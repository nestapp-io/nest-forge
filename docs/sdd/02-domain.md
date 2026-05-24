# 02 — Domain

> Como nest-forge é framework Electron, não há entidades de banco. O
> "domínio" aqui é o modelo conceitual de Apps, Notificações, Settings.

## Entidades conceituais

### App (per-app config)

- **Arquivo fonte:** `apps/{appName}/config.json`
- **Exemplo:** `apps/gchat/config.json`

| Campo | Tipo | Obrigatório | Notas |
|---|---|---|---|
| id | string | sim | `appId` único (ex: `google-chat`) |
| name | string | sim | Display name |
| url | string | sim | URL da app web (`https://chat.google.com/`) |
| requestBlock | boolean | não | (uso a confirmar) |
| keepActive | boolean | não | Se `true`, injeta input event sintético a cada 4min quando blurred |
| extensions | string[] | não | Nomes de `.zip` de extensões Chrome em `assets/` |
| permissions | object | não | `{notifications, camera, microphone, geolocation}` (boolean cada) |

### App (per-app package)

- **Arquivo fonte:** `apps/{appName}/package.json`

| Campo | Tipo | Notas |
|---|---|---|
| name | string | identificador npm |
| productName | string | nome final da janela / installer (ex: "Google Chat") |
| version | string | versão do app específico (ex: `1.3.0`) — injetada como `extraMetadata.version` no build |
| main | string | `src/main.js` (gerado) |
| description | string | metadado |

### Notification (in-memory + persisted)

- **Store:** `modules/notification-store.js`
- **Persistência:** `~/.config/NestApp/corebox/{appName}/notifications.json`
- **Evento:** `changed` emitido após mutação.

Shape inferido de uso (não há schema explícito no código lido):

| Campo | Tipo | Origem |
|---|---|---|
| tag | string | `Notification.tag` ou hash |
| title | string | `new Notification(title, ...)` |
| body | string | `options.body` |
| timestamp | number | `Date.now()` |
| read | boolean | mutável via IPC |
| pinned | boolean | mutável via IPC |
| url | string | `options.data.url` (extraído pelo interceptor v3.0.2+) |

### Settings

- **Store:** `modules/settings-store.js`
- **Persistência:** `userData` JSON (`~/.config/NestApp/...`)
- **Chaves observadas:**
  - `proxy` — `applyProxy(settingsStore.get('proxy') || {})` em
    `initializeApp`.
  - `language` — controlada por menu-manager + i18n.
  - `keepActive` — toggle opt-in.
  - `logger` — toggle runtime.

### Global store (in-memory singleton)

- **Arquivo:** `modules/global-store.js`
- **Chaves:** `appName`, `appConfig`, `mainWindow`, `session`,
  `powerSaveId`, etc.
- **Propósito:** cross-module glue, evitar circular deps.

## Invariantes

- **Per-app session isolada:** `persist:{appName}` — cookies/storage não
  cruzam apps.
  Evidência: nest-forge/CLAUDE.md "Modules" + "Data locations".

- **`app.getName() === "NestApp"`** sempre, em dev e em prod.
  Não setar `extraMetadata.name`.
  Evidência: nest-forge/CLAUDE.md "Caveats" + `build-app.js`.

- **Versão do app exibida no About vem de `apps/{appName}/package.json`;
  versão do "Packager NestApp" vem de `rootPkg.nestApp.{name,version}`.**
  Dois canais distintos, ambos preservados em builds via `extraMetadata`.
  Evidência: nest-forge/CLAUDE.md "Caveats" + `modules/app-info.js`.

- **Tag uniqueness** — notificações são deduplicadas por `tag`.
  Replay de click busca por `tag` em `window.__nestappNotifStore[tag]`.

## Agregados conceituais

| Aggregate | Componentes | Boundary |
|---|---|---|
| App runtime | per-app config + session + main window + notification store + settings | Vida útil = sessão Electron |
| Notification stream | site → interceptor → store → list window → replay | Persistência cross-restart via JSON |

## Regras de negócio recorrentes

- **Close → hide to tray** (não quit).
  Evidência: `shared/components/tray-config.js`.

- **Keep active opt-in (v3.0.0+).**
  Quando ativado: synthetic input event a cada 4min quando janela blurred.
  Evidência: `modules/window-manager.js` (descrito em nest-forge/CLAUDE.md).

- **`setWindowOpenHandler` em 3 branches (v2.4.0+):**
  1. URL é download (extensões conhecidas ou `blob:`/`data:`) → `downloadURL` + deny.
  2. Same-domain → `contentView.loadURL` + deny.
  3. External → `shell.openExternal` + deny.

- **`will-navigate` simétrico ao open-handler** — mesma decisão de
  same-root-domain.

- **`session.will-download`:** salva em `~/Downloads` com nome único +
  Notification nativa com click → showItemInFolder. NÃO grava no
  notificationStore.
  Evidência: changelog template.json v3.0.1.

## Glossário-resumo (detalhes em [08-glossary.md](./08-glossary.md))

- **app** — uma sub-aplicação em `apps/{appName}/`.
- **ctv** — Current Template Version (3.0.5 atualmente).
- **NestApp** — nome fixo do `app.getName()` no Electron (não confundir
  com nome do app empacotado).
- **per-app session** — `persist:{appName}`.
- **keep active** — input event sintético para evitar suspend.
