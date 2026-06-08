# 08 — Glossary

| Termo | Definição | Aparece em |
|---|---|---|
| **NestApp** | Nome fixo do `app.getName()` no Electron. NÃO é o nome do app empacotado. Determina `~/.config/NestApp/` como raiz de userData. | nest-forge/CLAUDE.md "Caveats", main.js |
| **nest-forge** | Repositório/framework que gera múltiplos NestApps. | nest-forge/CLAUDE.md, package.json |
| **app** | Sub-aplicação em `apps/{appName}/`. Cada uma tem config.json + package.json + assets. | apps/, config.json |
| **APP_NAME** | Diretório do app em `apps/` (ex: `gchat`). | scripts npm |
| **APP_ID** | `id` do `config.json` (ex: `google-chat`). | scripts npm, build-app.js |
| **productName** | Display name final do app empacotado (ex: "Google Chat"). | apps/{appName}/package.json |
| **ctv** | Current Template Version. Aqui em `templates/api-overlay/template.json.version` (3.0.5 atual). | template.json, nest-build-app-api/CLAUDE.md |
| **per-app session** | `persist:{appName}` — Electron session isolada. | session-manager.js |
| **keep active** | Synthetic input event a cada 4min quando blurred para evitar suspend. Opt-in v3.0.0+. | window-manager.js, config.json |
| **chrome UI** | Titlebar + menu horizontal customizados (BaseWindow + WebContentsView, dark theme). | modules/chrome-ui/, chrome-window.js |
| **WebContentsView** | API Electron usada com `BaseWindow` para chrome customizada (replaceu BrowserWindow plain). | nest-forge/CLAUDE.md, chrome-window.js |
| **`#default-name-app` / `#default-modules-path`** | Placeholders em `main.js` raiz substituídos por `sync-app-entry.js`. | main.js, scripts/sync-app-entry.js |
| **`__nestappNotifStore`** | Variável global injetada na page guardando `Notification` instances por tag. | window-manager.js (interceptor) |
| **`__nestappNotifPatched`** | Guard de idempotência para re-injeção do interceptor. | window-manager.js |
| **`triggerNotificationClick`** | Função main-process que replaya click de notificação. Cascata de fallbacks. | window-manager.js |
| **`realClick`** | Sequência pointer/mouse events em DOM para replay de click (fallback DOM scan). | injetado em page |
| **`webContents.sendInputEvent`** | Pipeline input do Chromium (v3.0.5) — usado quando SPA não expõe href. | window-manager.js |
| **same-root-domain heuristic** | Compara últimos dois labels do hostname. Pragmática; falha em compound TLDs. | will-navigate, isInternalNavigation |
| **`allowedHosts`** | Alternativa explícita à heurística — campo opcional em `config.json` para apps em `.co.uk`/`.com.br`. | nest-forge/CLAUDE.md caveats |
| **api-overlay** | `templates/api-overlay/` — arquivos template-only (template.json, package.template.json, electron-builder-config.template.json, scripts/afterPack.js, config.json, default-icon.png). | scripts/export-template.js |
| **PATH_REWRITES** | Mapeamento em `export-template.js` que converte multi-app → single-app layout. | scripts/export-template.js |
| **`safeReplaceFile`** | Função em `installAppImage.js` que faz `unlink + copy` para evitar `ETXTBSY` durante reinstall com app rodando. | installAppImage.js |
| **WM_CLASS** | Window class no X11. Setado via `--class={appName}` no `.desktop` Exec. Garante apps NestApp não colidam. | installAppImage.js |
| **`extraMetadata.version`** | Versão do app injetada no empacotado. Multi-app: de `apps/{appName}/package.json` (build-app.js). **OCI/publish: de `template.json.version` (publish-template.js)** — app publicado reporta a versão do template (= tag OCI/ctv). | build-app.js, publish-template.js |
| **`extraMetadata.nestApp.{name,version}`** | Metadado do packager para a About ("Empacotado por…"). Multi-app: do root `package.json`. **OCI/publish: `{name:'nestapp-template', version: template.json.version}`**. | build-app.js, publish-template.js, app-info.js |
| **notification interceptor** | Script injetado em `dom-ready`/`did-finish-load`/`did-navigate-in-page` que patch `window.Notification`. | window-manager.js |
| **download notification** | Notification nativa após `session.will-download`. NÃO grava em notificationStore (v3.0.1+). | session/will-download |

## Siglas

| Sigla | Significado | Fonte |
|---|---|---|
| IPC | Inter-Process Communication (Electron) | nest-forge/CLAUDE.md |
| SPA | Single-Page Application | nest-forge/CLAUDE.md |
| TLD | Top-Level Domain | caveat compound TLDs |
| OS | Operating System | runtime |
| CTV | Current Template Version | template.json |
| WM | Window Manager | WM_CLASS |
| OIDC | (não usado aqui — só no nest-account-api) | — |
