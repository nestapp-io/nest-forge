# CONSTITUTION — nest-forge (NestApp)

> Princípios NÃO-NEGOCIÁVEIS extraídos do código + nest-forge/CLAUDE.md.
> Esta constituição é DESCRITIVA — documenta o que o projeto JÁ É.

---

## 1. Architectural Principles

- **`apps/{appName}/src/main.js` é GERADO** — gitignored, materializado
  por `sync-app-entry.js`. Editar somente `main.js` raiz.
  Evidência: nest-forge/CLAUDE.md "Caveats" + scripts encadeados.

- **NestApp = source of truth do template `nest-build-app-api/templates/electron-base/`** (v3.0.0+). *(EVOLUÍDO em ADR-0001)*
  Editar nest-forge → rodar `node scripts/export-template.js` (FS-based, legacy)
  OU `node scripts/publish-template.js` (OCI-based, ADR-0001).
  CI deve rodar `--check` (export) ou `publish-template.yml` (publish).
  Evidência: nest-forge/CLAUDE.md "Sync" + ADR-0001.
  No fluxo OCI: template é publicado em
  `ghcr.io/nestapp-io/nestapp-template:<version>-<platform>-<arch>` com
  compressão zstd-19, consumido pelo `nest-build-app-api/BuildService` via `regclient`.
  Padrão "config-out-of-asar" estabelecido: `main.js` lê config dinâmico
  de `process.resourcesPath/app.asar.unpacked/config/app.json` via
  `config-runtime-loader.js` — preserva asar integrity do Electron 30+.

- **Per-app Electron session isolada** (`persist:{appName}`) — cookies/
  storage/extensões NÃO cruzam apps.
  Evidência: nest-forge/CLAUDE.md "Modules" + session-manager.js.

- **Multi-app a partir de codebase compartilhado** (`modules/` + `shared/`
  + `src/` + `locales/` + `main.js`). Customização per-app via
  `apps/{appName}/{config,package,assets}.*`.

- **IPC via `contextBridge` em preloads** — NUNCA `nodeIntegration: true`
  em renderers.
  Evidência: nest-forge/CLAUDE.md "Security model".

- **Chrome custom (BaseWindow + WebContentsView)** desde v2.0.0 —
  titlebar dark, menu horizontal, sem menubar nativa.
  Evidência: template.json changelog v2.0.0.

---

## 2. Quality Standards

- **Sem emojis** (regra global).

- **CommonJS modules** (`require`, `module.exports`) — não ES modules.

- **i18n via `t(key, params)`** — não hardcoded strings em UI.

- **Logger via winston** (`logger-manager.js`) — não `console.log` em
  main process.

- **Naming:**
  - Funções/variáveis: `camelCase`
  - Arquivos: `kebab-case.js`
  - Pastas: por responsabilidade (`modules/`, `shared/`, `src/`,
    `scripts/`, `locales/`, `templates/`)

- **Cobertura de testes: 0%** — sem dependências de teste no
  `package.json`. Mudanças exigem teste manual.

---

## 3. Security Rules

- **`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
  `webSecurity: true`, `allowRunningInsecureContent: false`.**
  Evidência: nest-forge/CLAUDE.md "Security model".

- **IPC só via `contextBridge`** (em `shared/preload.js` + preloads de
  `src/**`).

- **Per-app session** — não compartilhar cookies entre apps.

- **Navegação externa via `shell.openExternal`** (system browser):
  - URLs externas pelo `setWindowOpenHandler` (3 branches: download,
    same-domain, external).
  - `will-navigate` simétrico ao open-handler.
  Evidência: nest-forge/CLAUDE.md "Entry flow", template.json v2.4.0.

- **Preload intercepta APENAS `target="_blank"`** — não restaurar
  interceptação genérica de `http*` (quebra SPAs).
  Evidência: nest-forge/CLAUDE.md "Caveats" + shared/preload.js.

- **`installAppImage.js` deve tolerar binário em execução** via
  `safeReplaceFile` (unlink + copy). NÃO substituir por `copyFileSync`
  direto (gera `ETXTBSY`).

- **Permissões granulares via `config.json.permissions`**
  (`notifications`, `camera`, `microphone`, `geolocation`).
  Default deve ser `false` quando não explícito.

---

## 4. Design Patterns in Use

- **Template + Sync** — `main.js` raiz com placeholders, materializado
  per-app por `sync-app-entry.js`.

- **Module Index Hub** — `modules/index.js` agrega exports; cross-module
  glue via `global-store.js`.

- **Stores singletons** — `notification-store.js`, `settings-store.js`,
  `global-store.js` (in-memory + JSON persistido para os dois primeiros).

- **Re-injection com guard idempotente** — `__nestappNotifPatched`.

- **Cascata de fallbacks** em `triggerNotificationClick` (original
  Notification → contentView.loadURL → DOM scan → href extract → realClick
  → sendInputEvent).

---

## 5. Forbidden Practices

- **NÃO setar `extraMetadata.name = appName` em `build-app.js`.**
  Causa: muda `app.getName()` → muda `~/.config/userData` → perde
  sessão, notification store, click-replay.
  Solução para WM_CLASS único: `--class={appName}` em .desktop
  (já feito em installAppImage.js).
  Evidência: nest-forge/CLAUDE.md "Caveats".

- **NÃO editar `apps/{appName}/src/main.js`** — é gerado.

- **NÃO restaurar interceptação genérica de `http*` no preload** —
  quebra SPAs.

- **NÃO usar `copyFileSync` direto em installAppImage.js** — usar
  `safeReplaceFile`.

- **NÃO introduzir emojis** (regra global).

- **NÃO commitar `.electron-builder-config.generated.json` nem
  `apps/{appName}/src/main.js`** (gitignored).

- **NÃO editar `nest-build-app-api/templates/electron-base/` diretamente** — é derivado.
  Editar `nest-forge/` e regenerar com `scripts/export-template.js` (FS)
  ou `scripts/publish-template.js` (OCI, ADR-0001).

- **NÃO modificar `app.asar` em runtime** — preservar asar integrity (Electron 30+ rejeita). *(NOVA REGRA, ADR-0001)*
  Config dinâmico per-app (id, name, url, icon) DEVE ser gravado em
  `resources/app.asar.unpacked/config/app.json` + `config/icon.png` —
  arquivos UNPACKED, fora do asar lacrado.
  Evidência: `DefaultAsarSafeCustomizer.customize` valida sha256(app.asar)
  antes/depois e lança `TemplateRegistryException` se alterado.

---

## 6. Domain Invariants

- **`app.getName() === "NestApp"`** sempre.
- **`userData = ~/.config/NestApp/`** sempre.
- **`appName` é único entre apps/.
- **WM_CLASS = appName** (via `--class={appName}`).
- **Notifications dedup por `tag`.**
- **`config.json.id`** casa com `appId` semântico do `nest-build-app-api/`.

---

## 7. Tech Stack Boundaries

- **Electron** ^37.2.4 (devDeps).
- **electron-builder** ^26.0.12.
- **Minimum Electron version (template):** 30.0.0 (templates/api-overlay/template.json).
- **CommonJS only** (não migrar para ESM sem ADR — quebra
  electron-builder + scripts).
- **winston** ^3.17.0 — logger.
- **extract-zip** ^2.0.1 — unzip de extensões.
- **cross-env** ^7.0.3 — env vars cross-platform.

---

## Como esta constituição é mantida

- Regenerada quando `spec-init` roda. Edições manuais devem ser
  preservadas.
- `spec-create` LÊ esta constituição ao propor features.
- Bump em `templates/api-overlay/template.json.version` para template
  changes (rastreado em changelog).
- Bump em `package.json.version` para framework changes (3.0.0 atual).
