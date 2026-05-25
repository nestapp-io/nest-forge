# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NestApp is a multi-app Electron framework that wraps web services (like Google Chat) into standalone desktop applications. A single shared codebase produces multiple apps, each with its own `config.json`, `package.json`, icon and (optional) Chrome extensions. Builds are parameterized by `APP_NAME` / `APP_ID` environment variables.

## Commands

```bash
# Dev (regenerates the per-app entry first, then runs electron)
npm run start:gchat

# Build a single app (AppImage + Snap on Linux, NSIS on Windows, DMG on macOS)
npm run build:gchat

# Build every app under apps/
npm run build:all

# Install the built AppImage into ~/apps/{productName} and create the .desktop
npm run install:gchat
```

Global tools required: `cross-env`, `electron`, `electron-builder`.

## Entry flow

The root `main.js` is a **template** with two placeholders:

- `#default-name-app` — replaced by the app id (e.g. `gchat`)
- `#default-modules-path` — replaced by `../../..`

`scripts/sync-app-entry.js` materializes the template into `apps/{appName}/src/main.js`. This generated file is **gitignored** and runs both in dev (`start:gchat` chains the sync before `electron`) and at build time (`build-app.js` calls `syncAppEntry(appName)` before invoking `electron-builder`).

Runtime boot sequence (inside the generated entry):

1. `app.requestSingleInstanceLock()`
2. `app.whenReady()` → `initializeApp()`
3. `createSession()` → `loadAppConfig()` → `configureSessionSecurity()`
4. `notificationStore.load()` → `i18n.init()`
5. `initMenuListeners()` → `registerSettingsIpc()` → `registerNotificationIpc()` → `registerAboutIpc()`
6. `applyProxy(settingsStore.get('proxy') || {})`
7. `createWindow()` → returns the `BrowserWindow`

Security listeners are wired in `web-contents-created`:

- `setWindowOpenHandler`: denies all popups/`target="_blank"`, routes them through `shell.openExternal`.
- `will-navigate`: lets the navigation through when it's same-origin **or** shares the same root domain (last two labels of the hostname); otherwise prevents it and opens externally. This is what lets the Google login flow bounce across `chat.google.com` ↔ `accounts.google.com` without being yanked to the system browser.

## Modules (`modules/`)

`modules/index.js` is the central export hub consumed by the generated entry.

| Module | Responsibility |
|---|---|
| `global-store.js` | Singleton in-memory state (`appName`, `appConfig`, `mainWindow`, `session`, `powerSaveId`, etc). Cross-module glue |
| `config-loader.js` | Reads `apps/{appName}/config.json`, stores it in `globalStore` |
| `session-manager.js` | Creates the isolated Electron session (`persist:{appName}`), applies proxy, handles session security |
| `window-manager.js` | Creates the main `BrowserWindow`, wires tray, injects the notification interceptor script, manages "keep active" (synthetic input event every 4min when blurred), exposes `triggerNotificationClick` |
| `extension-manager.js` | Unzips Chrome extensions from `apps/{appName}/assets/*.zip` into the session on first run |
| `menu-manager.js` | App menu (Settings, Logger toggle, Keep Active toggle, Notifications, About, Language), reactive to state via listeners |
| `settings-manager.js` / `settings-store.js` | Secondary window for proxy/app settings; store persists to `userData` |
| `notification-store.js` | Persists notifications to `userData/corebox/{appName}/notifications.json`, emits `changed` events |
| `notification-window-manager.js` | Dedicated `BrowserWindow` listing notifications (load, pin, mark-read, delete). `notifications:open` IPC calls `triggerNotificationClick` to replay the click in the main window |
| `about-window-manager.js` | "About" window; consumes `app-info.js` |
| `app-info.js` | Aggregates app identity for the About window. Prefers `rootPkg.nestApp.{name,version}` (injected at build time) and falls back to the top-level `package.json` fields (dev mode) |
| `i18n-manager.js` | Loads JSON catalogs from `locales/`, exposes `t()` and a change emitter (menu + About react to language changes) |
| `language-manager.js` | Spell checker setup + context menu suggestions |
| `logger-manager.js` | Winston logger (file + console), runtime-toggleable |
| `icon-loader.js` | Loads `apps/{appName}/assets/icon.png` as `nativeImage` |

## Shared renderer glue (`shared/`)

- `shared/preload.js` — runs in the main window:
  - Exposes `window.electron.openExternal(url)` via `contextBridge`.
  - **Intercepts click events only when the anchor has `target="_blank"`**. Regular in-page links (internal navigation, hash routing) flow normally.
  - Relays notification events between page and main process via `postMessage`.
- `shared/components/tray-config.js` — system tray. Close hides to tray instead of quitting.

## Renderer pages (`src/`)

- `src/about/` — About dialog (HTML + preload). Consumes `getAppInfo()`.
- `src/config/` — Settings window (`settings.html` + `settings-preload.js`). Proxy, extensions, language, keep-active toggles.
- `src/notifications/` — Notification list window (`notifications.html` + `notifications-preload.js`). IPC-driven list with pin, mark-read, open, select, delete.

## Notification flow

1. The site calls `new Notification(title, options)`.
2. `window-manager.js :: injectNotificationInterceptor` (run on `dom-ready`, `did-finish-load`, `did-navigate-in-page`) patches `window.Notification` to:
   - Store the instance in `window.__nestappNotifStore[tag]`.
   - `postMessage({ type: '__nestapp_notification', title, body, tag })` so the preload relays it via IPC.
3. `shared/preload.js` forwards `__nestapp_notification` → IPC `notification-received` → `notificationStore.add(...)`.
4. The notification list window reads the store via `notifications:get-all` and reacts to `notifications:updated` pushes.
5. When the user clicks "Open" on a row: `notifications:open` focuses the main window and calls `triggerNotificationClick(mainWindow, tag, title)`, which:
   - Looks up the original `Notification` by `tag` in `window.__nestappNotifStore`, tries to dispatch `click`.
   - Falls back to a DOM scan of the sidebar for an element matching the notification title (handles cases where the in-page store was cleared by a reload).

## Build system (`scripts/`)

- `sync-app-entry.js` — standalone template-resolver. Exported as a function and also runnable via `node scripts/sync-app-entry.js` with `APP_NAME` in env.
- `build-app.js` — drives one build:
  1. Reads `APP_NAME`, `APP_ID`.
  2. Reads `apps/{appName}/package.json` (version required) and the root `package.json`.
  3. Clones `electron-builder-config.json` into `.electron-builder-config.generated.json` (gitignored) with:
     - `appId`, `productName = appName`
     - `directories.{output, buildResources}` pointing to the app
     - `files` whitelist (`shared/`, `modules/`, `src/`, `locales/`, the per-app entry, assets, config, package.json, root package.json)
     - `linux` / `snap` sections
     - `extraMetadata = { version: <app version>, nestApp: { name, version } from root }` — **never `name`** (see caveats)
  4. `syncAppEntry(appName)`
  5. `electron-builder --config .electron-builder-config.generated.json`
- `build-all.js` — iterates `apps/*/`, loads each `config.json` for the `id`, shells out to `build-app.js` with the right env.
- `copy-icons.js` — post-build hook (`postbuild` npm script) that copies icons into the linux-unpacked output.

## Installer (`installAppImage.js`)

Run via `npm run install:gchat`. Steps:

1. Reads `apps/{appName}/package.json` for `name`, `productName`, `version`, `description`.
2. Copies the `.AppImage` and icon to `~/apps/{productName}/`, using `safeReplaceFile` (`unlink + copy`) so reinstalling while the app is running doesn't fail with `ETXTBSY` — the running process keeps the old inode, the new file gets a fresh one.
3. Writes `~/.local/share/applications/{appName}.desktop` with:
   - `StartupWMClass={appName}`
   - `Exec=<path> --no-sandbox --class={appName} %U`
   The `--class` switch forces Chromium to set WM_CLASS to `{appName}`, so each installed app has a unique window class that matches its own `.desktop` — no collisions between multiple NestApp-built apps on the same machine.
4. Runs `update-desktop-database`.

## Sync with `nest-build-app-api/templates/electron-base/`

As of template `3.0.0`, `nest-build-app-api/templates/electron-base/` is a **derived artifact** built from this repo. nest-forge is the single source of truth.

- Script: `node scripts/export-template.js [--out <dir>] [--check]`.
- Default `--out` is `../nest-build-app-api/templates/electron-base`.
- Overlay (template-only files) lives in `templates/api-overlay/`: `template.json`, `default-icon.png`, `config.json`, `assets/`, `scripts/afterPack.js`, `package.template.json`, `electron-builder-config.template.json`.
- `PATH_REWRITES` in the script rewrites nest-forge's multi-app paths (`apps/{appName}/config.json`, `corebox/`, etc.) to the single-app layout the api expects, and substitutes `#default-modules-path`/`#default-name-app`/`{{APP_NAME}}` placeholders in `main.js`.
- `--check` regenerates to a temp dir and diffs against the current `nest-build-app-api/templates/electron-base`; exit 1 on drift (use in CI).
- Bump the template version by editing `templates/api-overlay/template.json` (`version` + changelog entry) before exporting.

When touching anything under `modules/`, `shared/`, `src/`, `locales/`, `main.js`, or `templates/api-overlay/`, run the script to keep both sides aligned. See `../docs/plan-template-sync.md` for the cutover plan and rationale.

### OCI publish (ADR-0001) — irmão do export-template.js

A partir do ADR-0001 (workspace `specs/prebuilt-electron-template-distribution/`), o template também é publicado como **OCI artifact em GHCR**:

- Script: `node scripts/publish-template.js [--version=X] [--platforms=linux,win] [--platform=linux] [--arch=x64] [--dry-run]`
- `--platforms=linux,win` (CSV, ADR-0002) publica multi-arch num único run; manifest único agrega todos. Best-effort: falha em uma plataforma não aborta as outras. `--platform=linux` (singular) ainda funciona para compat.
- Empacota com `electron-builder --dir` → comprime com `zstd -19` → faz `regclient artifact put` em `ghcr.io/nestapp-io/nestapp-template:<version>-<platform>-<arch>`
- Publica também manifest separado como `<repo>:<version>-manifest` (media-type `application/vnd.nestapp.template-manifest.v1+json`)
- Auth via env `GHCR_PAT` (base64 `user:token`)
- GitHub Action `.github/workflows/publish-template.yml` automatiza via tag `template/v*` ou dispatch manual (usa `GITHUB_TOKEN` automático)
- Consumido pelo `nest-build-app-api/BuildService.runOciBuild` via `regclient` (cliente Java invoca via ProcessBuilder)

### Config dinâmico via `config-runtime-loader.js` (ADR-0001)

Para preservar **asar integrity** (Electron 30+), config per-app NÃO mais vive em `apps/{appName}/config.json` quando o build vem do template OCI. Em vez disso:

- `modules/config-runtime-loader.js` (substitui `config-loader.js` no hub `modules/index.js`)
- Em dev (`npm run start:gchat`): runtime path não existe → delega para legacy `config-loader.js` → lê `apps/{appName}/config.json` (sem regressão)
- Em build packaged OCI: runtime path `process.resourcesPath/app.asar.unpacked/config/app.json` é gravado pelo `nest-build-app-api/DefaultAsarSafeCustomizer` durante customização per-app

**Forbidden:** NÃO modificar `app.asar` em runtime — preservar hash do fuse. Customização dinâmica DEVE viver em `resources/app.asar.unpacked/config/`.

## Internationalization

- `locales/{en-US,pt-BR,es-ES}.json` — flat JSON catalogs.
- `i18n-manager.js` exposes `t(key, params)` and emits `changed` events when the user switches language from the menu. The About window and the notification list subscribe to live updates.

## Data locations

With `app.getName() === "NestApp"` (see caveats), everything lives under `~/.config/NestApp/`:

- `corebox/{appName}/notifications.json` — persisted notifications
- `Partitions/{appName}/` — the isolated session (cookies, storage, extensions)
- Settings/store JSON files managed by `settings-store.js`

## Caveats and non-obvious pitfalls

- **Do not set `extraMetadata.name = appName` in `build-app.js`.** It changes `app.getName()` in the packaged build, which shifts `app.getPath('userData')` from `~/.config/NestApp` to `~/.config/{appName}`. Consequences: login/session is lost, notification store is re-created empty, and notification click replay fails because the tags in the newly empty `__nestappNotifStore` no longer match. The correct way to give each app a unique WM_CLASS is via `--class=${appName}` in the `.desktop` `Exec` line (already done in `installAppImage.js`).
- **`apps/{appName}/src/main.js` is generated.** It is gitignored. Edits must go to root `main.js`; running any `start:*`, `build:*` or `scripts/sync-app-entry.js` regenerates the per-app file. Never edit the generated copy directly.
- **Google login (and anything with cross-subdomain redirects) depends on `will-navigate` allowing the same root domain.** `isInternalNavigation` compares the last two hostname labels. This is a pragmatic heuristic that fails on compound TLDs (`.co.uk`, `.com.br` registrable domains). If you onboard such an app, replace the heuristic with an explicit `allowedHosts` array in `config.json`.
- **Preload only intercepts `target="_blank"` anchors.** Intercepting every `http*` link (old behavior) broke in-page navigation for SPAs. Don't restore the old behavior — wire new navigation rules through `will-navigate` in `main.js` instead.
- **Notification interceptor is re-injected on `dom-ready`, `did-finish-load`, and `did-navigate-in-page`** because SPAs often swap the document without a full reload. The interceptor guards itself with `window.__nestappNotifPatched` so re-injection is a no-op.
- **`installAppImage.js` must tolerate the running target binary.** `safeReplaceFile` unlinks before copying to avoid `ETXTBSY`. Don't replace this with a direct `copyFileSync`.
- **App-level version vs. packager version.** The AppImage/installer version comes from `apps/{appName}/package.json` (injected via `extraMetadata.version`). The "Packaged by NestApp x.y.z" string in the About window reads `extraMetadata.nestApp` (preserved from the root `package.json` at build time). Keep both channels when adding new build metadata.

## Adding a new app

1. `apps/{appName}/config.json` — `id`, `name`, `url`, `keepActive`, `permissions`, `extensions`.
2. `apps/{appName}/package.json` — `name`, `productName`, `version`, `description`.
3. `apps/{appName}/assets/icon.png` (and extension `.zip`s if needed).
4. Add the scripts to the root `package.json`, mirroring the `gchat` ones.

See README.md for examples.

## Security model (summary)

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, `allowRunningInsecureContent: false`.
- IPC only through `contextBridge` in `shared/preload.js` + preload files in `src/**`.
- Per-app Electron session (`persist:{appName}`).
- External navigation routed to the system browser via `setWindowOpenHandler` and `will-navigate`.
