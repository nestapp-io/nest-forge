# NestApp

Framework Electron multi-app que empacota serviços web (Google Chat, etc.) como aplicativos desktop independentes. Uma única base de código compartilhada gera múltiplos apps através de variáveis de ambiente no build.

## Pré-requisitos

- Node.js LTS (gerenciado via `nvm` é o cenário testado)
- Pacotes globais:
  ```bash
  npm install --global cross-env electron electron-builder
  ```
- Dependências do projeto:
  ```bash
  npm install
  ```

## Comandos principais

| Comando | O que faz |
|---|---|
| `npm run start:gchat` | Gera o entry point do app e roda em modo dev via `electron` |
| `npm run build:gchat` | Empacota o gchat (AppImage + Snap no Linux, NSIS no Windows, DMG no macOS) |
| `npm run install:gchat` | Instala o AppImage gerado em `~/apps/{productName}` e cria o atalho `.desktop` |
| `npm run build:all` | Itera por `apps/*/` e faz build de cada um |

O artefato final fica em `dist/{appName}/`.

## Estrutura do projeto

```
.
├── main.js                     # Template de entry point (tem placeholders #default-name-app e #default-modules-path)
├── apps/
│   └── gchat/
│       ├── config.json         # Metadados do app (id, name, url, keepActive, permissions, extensions)
│       ├── package.json        # Nome e versão do app (usados no empacotamento)
│       ├── assets/             # icon.png e extensões .zip (Chrome) opcionais
│       └── src/                # Entry gerado pelo build (gitignored)
├── modules/                    # Modulos compartilhados do processo main
├── shared/                     # preload + componentes compartilhados (tray, etc.)
├── src/                        # Páginas renderer do NestApp (settings, about, notifications)
├── locales/                    # Traduções (en-US, pt-BR, es-ES)
├── scripts/
│   ├── sync-app-entry.js       # Gera apps/{app}/src/main.js a partir do main.js
│   ├── build-app.js            # Orquestra o build de um app
│   ├── build-all.js            # Itera apps/ e dispara build-app.js
│   └── copy-icons.js           # Pós-build: copia ícones pro dist/
├── electron-builder-config.json
└── installAppImage.js          # Instala o AppImage gerado + .desktop
```

### Sobre `apps/{appName}/src/main.js`

É um arquivo **gerado**, não versionado. É criado a partir de `main.js` (raiz) com os placeholders resolvidos:

- `#default-name-app` → nome do app (ex.: `gchat`)
- `#default-modules-path` → `../../..`

A geração acontece automaticamente em:

- `npm run start:gchat` (prefixo `sync-app-entry.js && electron ...`)
- `npm run build:gchat` (via `scripts/build-app.js`)

Se você mexer em `main.js` (raiz), rode qualquer um dos comandos acima pra regenerar os entry points.

## Adicionando um app novo

1. Crie `apps/{appName}/config.json`:
   ```json
   {
     "id": "meu-app",
     "name": "Meu App",
     "url": "https://exemplo.com/",
     "keepActive": false,
     "extensions": [],
     "permissions": {
       "notifications": true,
       "camera": false,
       "microphone": false,
       "geolocation": false
     }
   }
   ```

2. Crie `apps/{appName}/package.json` com `name`, `version` e `productName`:
   ```json
   {
     "name": "meu-app",
     "productName": "Meu App",
     "version": "1.0.0"
   }
   ```

3. Coloque o ícone em `apps/{appName}/assets/icon.png` (PNG, >= 512x512).

4. Se o app precisa de extensões Chrome, coloque os `.zip` delas em `apps/{appName}/assets/` e liste em `config.extensions`.

5. Adicione os scripts no `package.json` raiz seguindo o padrão do `gchat`:
   ```json
   "start:meu-app":   "cross-env APP_NAME=meu-app node scripts/sync-app-entry.js && electron apps/meu-app/src/main.js",
   "build:meu-app":   "cross-env APP_ID=meu-app APP_NAME=meu-app node scripts/build-app.js",
   "install:meu-app": "cross-env APP_NAME=meu-app node installAppImage.js"
   ```

## Empacotamento e instalação (Linux)

O `install:gchat` faz:

1. Lê `apps/gchat/package.json` pra pegar nome, versão, descrição e `productName`.
2. Copia o `.AppImage` de `dist/gchat/` pra `~/apps/{productName}/` (substitui se já existir, mesmo com o app rodando — `unlink + copy`).
3. Copia o ícone pra mesma pasta.
4. Escreve o `.desktop` em `~/.local/share/applications/` com:
   - `StartupWMClass={appName}`
   - `Exec=… --no-sandbox --class={appName} %U` (o `--class` força o WM_CLASS do Chromium a casar com o `StartupWMClass`, pra cada app ter seu próprio atalho sem conflito)
5. Roda `update-desktop-database`.

## Segurança

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- IPC via `contextBridge` em `shared/preload.js`.
- Cada app tem sessão isolada (`persist:{appName}`).
- Navegação externa:
  - `setWindowOpenHandler` (popups/`target="_blank"`): redireciona pro navegador do sistema.
  - `will-navigate`: permite navegação dentro do mesmo domínio raiz do app (ex.: `chat.google.com` ↔ `accounts.google.com`), externos vão pro navegador.
  - Preload intercepta apenas cliques em `<a target="_blank">` (links internos navegam normalmente).

## Notas de build extras

- O `electron-builder-config.json` é o template; `scripts/build-app.js` injeta dinamicamente `appId`, `productName`, `files`, `linux`, `snap` e `extraMetadata` (versão do app + `nestApp` com nome/versão do packager) e grava em `.electron-builder-config.generated.json` (gitignored).
- A versão do pacote final vem do `apps/{appName}/package.json`, não do `package.json` da raiz.
- A identidade do packager (NestApp + versão) é preservada em `extraMetadata.nestApp`, pra ser exibida no "Sobre" sem colidir com a versão do app.

## Gerando Snap

```bash
sudo snap install snapcraft --classic
npx electron-builder --config .electron-builder-config.generated.json --linux snap
```

Instalar localmente (não assinado):

```bash
sudo snap install --dangerous dist/gchat/gchat_1.3.0_amd64.snap
```
