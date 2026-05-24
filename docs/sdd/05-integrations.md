# 05 — Integrations

## Sistemas externos consumidos pelo runtime

| Sistema | Tipo | Endpoint | Notas |
|---|---|---|---|
| Site web do app | webContents.loadURL | URL de `config.json` | Sessão isolada `persist:{appName}` |
| OS — system browser | Electron `shell.openExternal` | system default | URLs externas (não-same-domain) |
| OS — file system | Node fs | `~/.config/NestApp/`, `~/Downloads/`, `~/.local/share/applications/`, `~/apps/` | Persistência + installer |
| OS — system tray | Electron `Tray` | — | Close-to-tray |
| OS — desktop entry | gravado em `~/.local/share/applications/{appName}.desktop` | `installAppImage.js` |
| Chromium spell-check | embutido | — | `language-manager.js` configura idioma + context menu |

## Integrações por build

| Ferramenta | Função | Source |
|---|---|---|
| electron | Runtime | devDeps (^37.2.4) |
| electron-builder | Empacotador | devDeps (^26.0.12); `scripts/build-app.js` clona config + injeta `extraMetadata` |
| extract-zip | Unzip de extensões | deps (^2.0.1); `extension-manager.js` |
| winston | Logger | deps (^3.17.0); `logger-manager.js` |
| cross-env | Env vars cross-platform | devDeps (^7.0.3) |

## Integração com `nest-build-app-api/`

nest-forge é **source of truth** do template Electron consumido por `nest-build-app-api/`.
Workflow:

1. Editar `nest-forge/{modules,shared,src,locales,main.js}` ou
   `nest-forge/templates/api-overlay/`.
2. Rodar `node scripts/export-template.js` (default `--out
   ../nest-build-app-api/templates/electron-base`).
3. Verificar drift: `node scripts/export-template.js --check`
   (exit 1 se drift, uso em CI).
4. Bump em `templates/api-overlay/template.json` (`version` + changelog
   entry) ANTES de exportar.

`PATH_REWRITES` no script converte multi-app de nest-forge para o
layout single-app esperado pelo nest-build-app-api/template (`apps/{appName}/config.json`
→ raiz, substitui placeholders `#default-modules-path`/`#default-name-app`/
`{{APP_NAME}}` em `main.js`).

Detalhes em nest-forge/CLAUDE.md "Sync com nest-build-app-api/templates/electron-base/"
e `docs/plan-template-sync.md` (workspace root).

## Permissions e capacidades do Chromium

Por app, configurável via `config.json.permissions`:

- `notifications` (boolean)
- `camera` (boolean)
- `microphone` (boolean)
- `geolocation` (boolean)

`session-manager.js` interpreta estas flags ao configurar a sessão.

## Extensões Chrome

`extension-manager.js` faz unzip dos `.zip` em
`apps/{appName}/assets/` para dentro da sessão na primeira execução.
Listadas em `config.json.extensions`.

## Resiliência

- **`safeReplaceFile`** em `installAppImage.js` — `unlink + copy` para
  evitar `ETXTBSY`.
- **Notification interceptor re-injetado** em 3 eventos para sobreviver
  a reloads de SPA.
- **Notification interceptor com guard `window.__nestappNotifPatched`** —
  idempotente.
- **`triggerNotificationClick`** com cascata de fallbacks:
  1. Original `Notification` por tag em `window.__nestappNotifStore`.
  2. `contentView.loadURL(url)` se `options.data.url` foi capturado.
  3. DOM scan por título.
  4. Extração de `href` (anchor/`[data-href]`).
  5. `realClick` (pointer/mouse events) como último recurso.
  6. `webContents.sendInputEvent` mouseMove/Down/Up para SPAs sem href
     (v3.0.5).
  Evidência: changelog template.json v3.0.0-v3.0.5.

## OCI publish (ADR-0001) — saída para GHCR

| Operação | Tipo | Endpoint | Auth | Library | Source |
|---|---|---|---|---|---|
| **Publish template OCI** | exec shell | `ghcr.io/nestapp-io/nestapp-template:<v>-linux-x64` | `GHCR_PAT` (base64) ou `GITHUB_TOKEN` em CI | `regclient artifact put` | `scripts/publish-template.js` |
| **Publish manifest** | exec shell | `ghcr.io/nestapp-io/nestapp-template:<v>-manifest` | mesmo acima | mesma | mesma |

Workflow `.github/workflows/publish-template.yml` automatiza via tag `template/v*` ou dispatch manual.

Cliente do template: `nest-build-app-api/BuildService` via `GhcrOciTemplateRegistry` (`regclient artifact get`) — ver `nest-build-app-api/docs/sdd/05-integrations.md`.

## Não-integrações (intencional)

- **Nenhum tracking/telemetry externo.**
- **Sem auto-update server** declarado.
- **Sem CDN/asset server** — todos os assets locais ou da app web.
