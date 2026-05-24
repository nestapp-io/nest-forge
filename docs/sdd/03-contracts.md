# 03 — Contracts

> nest-forge não é serviço HTTP. Os "contratos" relevantes são **canais
> IPC** entre main process e renderers (main window + janelas auxiliares).
> Listados aqui a partir da descrição em nest-forge/CLAUDE.md.

## Fontes de contrato

| Tipo | Caminho | Status |
|---|---|---|
| OpenAPI/REST | — | N/A (não é serviço HTTP) |
| IPC channels | `modules/*-ipc` handlers / `register*Ipc` | inferidos de CLAUDE.md |

## IPC — Settings

Registrados em `registerSettingsIpc()` (chamado em `initializeApp`).
Consumidos por `src/config/settings.html` + `settings-preload.js`.

| Canal | Tipo | Propósito |
|---|---|---|
| `settings:get` | invoke | Lê settings persisted |
| `settings:set` | invoke | Persiste settings + propaga listeners |
| `settings:open` | on | Abre janela de settings |
| (proxy, language, keep-active, logger toggles) | invoke | Sub-handlers granulares — [A CONFIRMAR] nomes exatos |

## IPC — Notifications

Registrados em `registerNotificationIpc()`. Consumidos por
`src/notifications/notifications.html` + `notifications-preload.js`.

| Canal | Tipo | Propósito |
|---|---|---|
| `notification-received` | on (do renderer principal) | Site → preload → main; chama `notificationStore.add` |
| `notifications:get-all` | invoke | Lista de notificações persistidas |
| `notifications:updated` | send (push) | Main → janela de notificações ao mudar store |
| `notifications:open` | invoke | Foca main window + chama `triggerNotificationClick(mainWindow, tag, title)` |
| `notifications:pin` | invoke | Toggle pin |
| `notifications:mark-read` | invoke | Mark read |
| `notifications:select` | invoke | Selecionar entrada |
| `notifications:delete` | invoke | Remover |

## IPC — About

Registrados em `registerAboutIpc()`. Consumidos por `src/about/about.html`
+ `about-preload.js`.

| Canal | Tipo | Propósito |
|---|---|---|
| `about:get-info` | invoke | Retorna `getAppInfo()` (versão app + nestApp packager) |
| `about:open` | on | Abre janela About |
| `i18n:changed` | send | Main → About ao trocar idioma (live update) |

## IPC — Menu/Language

| Canal | Tipo | Propósito |
|---|---|---|
| `language:set` | invoke | Troca idioma + emite `i18n:changed` |
| `language:get` | invoke | Idioma atual |
| `menu:reload` | send | Re-render do menu ao mudar idioma/state |

## IPC — Logger

| Canal | Tipo | Propósito |
|---|---|---|
| `logger:toggle` | invoke | Liga/desliga logger runtime |
| `logger:status` | invoke | Estado atual |
| `logger:open-folder` | invoke | Abre pasta de logs no file manager |

## DOM/Window message channel

Site → main process (sem IPC direto, via preload):

| Mensagem | Origem | Destino |
|---|---|---|
| `__nestapp_notification` | `injectNotificationInterceptor` em main window | `shared/preload.js` → IPC `notification-received` |

## Preload — `contextBridge` (shared)

Exposto em `window.electron.*`:

| API | Source | Notas |
|---|---|---|
| `window.electron.openExternal(url)` | `shared/preload.js` | Único método externo exposto |

## Preload — Setting/Notification/About

Cada janela auxiliar tem seu próprio preload:

- `src/config/settings-preload.js` — APIs de settings via contextBridge.
- `src/notifications/notifications-preload.js` — APIs da lista de
  notificações.
- `src/about/about-preload.js` — API `aboutAPI.getInfo()` etc.

> **Nomes exatos dos métodos expostos pelos preloads não foram lidos
> linha-a-linha — [A CONFIRMAR].**

## Eventos externos

| Evento | Origem | Destino |
|---|---|---|
| `new Notification(title, options)` | site web | interceptor patched |
| `setWindowOpenHandler` callback | Electron | `window-manager.js` decide download/internal/external |
| `will-navigate` | Electron | `window-manager.js` valida same-root-domain |
| `did-finish-load`, `dom-ready`, `did-navigate-in-page` | Electron | re-injetar notification interceptor |
| `session.will-download` | Electron | salvar em `~/Downloads` + Notification nativa |

## Integrações externas (saída)

| Sistema | Tipo | Endpoint | Notas |
|---|---|---|---|
| Site web do app | webContents.loadURL | `config.json.url` | Sessão isolada `persist:{appName}` |
| Sistema de arquivos | fs (Node) | `~/.config/NestApp/`, `~/Downloads/`, `~/.local/share/applications/` | Notification JSON, settings, .desktop |
| Sistema operacional — shell | Electron `shell.openExternal` | system browser | URLs externas |
| Sistema operacional — tray | Electron `Tray` | system tray area | close-to-tray |
| Sistema operacional — desktop entry | gravado em `~/.local/share/applications/` | — | `installAppImage.js` |
| Spell-check engines | Chromium built-in | — | `language-manager.js` configura idioma + context menu |
