# 00 — Overview

## Propósito

**NestApp** (nest-forge) é um **framework Electron multi-app**: um único
codebase compartilhado (`modules/` + `shared/` + `src/` + `locales/`) gera
múltiplas aplicações desktop independentes, uma por subdiretório
`apps/{appName}/`, parametrizada por env vars `APP_NAME` / `APP_ID`.

Cada app tem seu próprio `config.json` (id, name, url, keepActive,
permissions, extensions), `package.json` (versão), ícone e (opcional)
extensões Chrome.

NestApp também é **fonte única de verdade** do template Electron usado
pelo `nest-build-app-api/` (`nest-build-app-api/templates/electron-base/` v3.0.0+ é derivado deste repo
via `scripts/export-template.js`).

## Tipo de aplicação

- Desktop Electron framework (multi-app builder)
- Não é serviço HTTP; não expõe REST.
- Cliente local de notificações, settings, configuração de proxy, etc.

## Stack detectada

| Camada | Tecnologia | Versão | Evidência |
|---|---|---|---|
| Runtime | Electron | ^37.2.4 | package.json:17 |
| Empacotador | electron-builder | ^26.0.12 | package.json:18 |
| Logger | winston | ^3.17.0 | package.json:22 |
| Unzip de extensões | extract-zip | ^2.0.1 | package.json:21 |
| Cross-env vars | cross-env | ^7.0.3 | package.json:16 |
| Versão NestApp | 3.0.0 | — | package.json:3 |
| Versão template (atual) | 3.0.5 | — | templates/api-overlay/template.json:2 |
| Minimum Electron version (template) | 30.0.0 | — | templates/api-overlay/template.json:3 |

## Estrutura de repositório (alto nível)

```
nest-forge/
├── package.json                   # NestApp framework v3.0.0
├── main.js                        # template com placeholders #default-name-app / #default-modules-path
├── installAppImage.js             # installer pós-build (~/apps/{productName}/ + .desktop)
├── electron-builder-config.json   # base de config; clonada para .electron-builder-config.generated.json no build
├── modules/                       # exportadas via modules/index.js
│   ├── global-store.js, config-loader.js, session-manager.js
│   ├── window-manager.js, menu-manager.js, settings-manager.js, settings-store.js
│   ├── notification-store.js, notification-window-manager.js
│   ├── about-window-manager.js, app-info.js, i18n-manager.js
│   ├── language-manager.js, logger-manager.js, icon-loader.js
│   ├── extension-manager.js
│   └── chrome-ui/                 # chrome customizada (BaseWindow + WebContentsView)
│       ├── chrome.html, chrome.css, chrome-preload.js, chrome-renderer.js
│   └── chrome-window.js
├── shared/
│   ├── preload.js                 # contextBridge + interceptor de target="_blank"
│   └── components/tray-config.js  # tray (close = hide to tray)
├── src/
│   ├── about/about.html, about-preload.js
│   ├── config/settings.html, settings-preload.js
│   └── notifications/notifications.html, notifications-preload.js
├── locales/{en-US,pt-BR,es-ES}.json
├── scripts/
│   ├── sync-app-entry.js          # materializa main.js → apps/{appName}/src/main.js
│   ├── build-app.js               # 1 build (electron-builder com config gerado)
│   ├── build-all.js               # itera apps/*/
│   ├── copy-icons.js              # postbuild hook
│   └── export-template.js         # exporta para nest-build-app-api/templates/electron-base
├── templates/api-overlay/         # overlay api-only (template.json, package.template.json, etc)
└── apps/
    └── gchat/
        ├── config.json            # id, name, url, keepActive, permissions, extensions
        ├── package.json           # version do app gchat (1.3.0)
        ├── assets/                # icon.png + .zip de extensões
        └── src/main.js            # GERADO via sync-app-entry.js (gitignored)
```

## Como rodar

```bash
npm install
npm run start:gchat                 # dev (regenera apps/gchat/src/main.js antes)
npm run build:gchat                 # 1 app
npm run build:all                   # todos apps/*/
npm run install:gchat               # copia AppImage para ~/apps/{productName}/
```

**Pré-requisitos:** Node.js, `cross-env`, `electron`, `electron-builder`
(devDependencies).

## Referências cruzadas

- Arquitetura: [01-architecture.md](./01-architecture.md)
- Domínio: [02-domain.md](./02-domain.md)
- Contratos (IPC): [03-contracts.md](./03-contracts.md)
- Dados: [04-data.md](./04-data.md)
- Integrações: [05-integrations.md](./05-integrations.md)
- Qualidade: [06-quality.md](./06-quality.md)
- Operações: [07-operations.md](./07-operations.md)
- Glossário: [08-glossary.md](./08-glossary.md)
- CONSTITUTION: [CONSTITUTION.md](./CONSTITUTION.md)
- Self-assessment: [_self-assessment.md](./_self-assessment.md)
