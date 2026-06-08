# 07 — Operations

## Comandos

```bash
# Dev (regenera entry per-app, então roda electron)
npm run start:gchat

# Build 1 app (AppImage/Snap Linux, NSIS Windows, DMG macOS)
npm run build:gchat

# Build todos os apps/*/
npm run build:all

# Instala o AppImage construído em ~/apps/{productName}/ + cria .desktop
npm run install:gchat
```

## Variáveis de ambiente

| Var | Default | Função |
|---|---|---|
| `APP_NAME` | (obrigatório) | Nome do diretório em `apps/` (ex: `gchat`) |
| `APP_ID` | (obrigatório no build) | id de `config.json` (ex: `google-chat`) |

Aplicadas via `cross-env` nos scripts npm.

## Build pipeline

1. `scripts/build-app.js`:
   - Lê `APP_NAME`, `APP_ID`.
   - Lê `apps/{appName}/package.json` (`version` obrigatório) + root
     `package.json`.
   - Clona `electron-builder-config.json` → `.electron-builder-config.generated.json`
     (gitignored) com:
     - `appId`, `productName = appName`
     - `directories.{output, buildResources}` por app
     - `files` whitelist (`shared/`, `modules/`, `src/`, `locales/`, entry per-app, assets, config, package.json, root package.json)
     - seções `linux` / `snap`
     - `extraMetadata = { version: <app version>, nestApp: { name, version } from root }`
     - **nunca `extraMetadata.name`** (caveat documentado)
     - **No fluxo OCI (`publish-template.js`):** `extraMetadata.version` e
       `extraMetadata.nestApp` vêm de `template.json.version` (não do
       `package.json` de framework) — o app publicado reporta a versão do
       template/tag OCI. Ver `specs/nestforge-template-version-sync/`.
   - `syncAppEntry(appName)` materializa `apps/{appName}/src/main.js`
     a partir de `main.js` raiz.
   - `electron-builder --config .electron-builder-config.generated.json`.
2. `npm postbuild` chama `scripts/copy-icons.js` para copiar ícones para
   linux-unpacked.

## Install pipeline (`installAppImage.js`)

1. Lê `apps/{appName}/package.json`.
2. Copia `.AppImage` + icon para `~/apps/{productName}/` usando
   `safeReplaceFile` (unlink + copy).
3. Escreve `~/.local/share/applications/{appName}.desktop`:
   - `StartupWMClass={appName}`
   - `Exec=<path> --no-sandbox --class={appName} %U`
4. `update-desktop-database`.

## Locais de runtime

| Caminho | Conteúdo |
|---|---|
| `~/.config/NestApp/corebox/{appName}/notifications.json` | Notificações |
| `~/.config/NestApp/Partitions/{appName}/` | Sessão isolada (cookies, storage) |
| `~/.config/NestApp/Settings/...` | Settings (proxy, language, etc.) |
| `~/apps/{productName}/` | Binários instalados via installAppImage.js |
| `~/.local/share/applications/{appName}.desktop` | Desktop entry |
| `~/Downloads/` | Downloads salvos com nome único + Notification nativa |

## Deploy

- **Linux:** AppImage + Snap (via electron-builder linux section).
- **Windows:** NSIS installer.
- **macOS:** DMG.

Não há servidor de auto-update declarado. Updates são reinstall manual.

## Observabilidade

- **Logger:** winston (file + console), toggle runtime.
  - Caminho exato dos logs [A CONFIRMAR] — provavelmente
    `userData/logs/` (windows-compatível).
  - v3.0.0+: rotação/retenção/scopes configuráveis via Settings UI.

- **Sem metrics/tracing externos.**

## Sync com `nest-build-app-api/`

Quando tocar em `modules/`, `shared/`, `src/`, `locales/`, `main.js` ou
`templates/api-overlay/`:

```bash
node scripts/export-template.js                # gera nest-build-app-api/templates/electron-base/
node scripts/export-template.js --check        # CI: exit 1 em drift
```

ANTES de exportar, bumpar `templates/api-overlay/template.json` com:
- `version` (semver — segue mudança no template)
- Entry no `changelog[]` descrevendo a mudança

## Runbooks conhecidos

- nest-forge/CLAUDE.md — bíblia operacional deste subprojeto.
- `docs/plan-template-sync.md` (workspace root) — plano de cutover do
  template para 3.0.0+.
- nest-forge/README.md — quickstart.
