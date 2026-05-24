import os
import subprocess
import platform

# Diretório do projeto
project_dir = "meu-webcatalog"
apps_dir = os.path.join(project_dir, "apps")

# Criar diretórios
if not os.path.exists(project_dir):
    os.makedirs(project_dir)
if not os.path.exists(apps_dir):
    os.makedirs(apps_dir)

# Conteúdos dos arquivos
package_json_content = '''{
  "name": "meu-webcatalog",
  "version": "1.0.0",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "dist": "electron-builder",
    "build-app": "electron-builder --dir"
  },
  "devDependencies": {
    "electron": "^latest",
    "electron-builder": "^latest"
  },
  "build": {
    "appId": "com.exemplo.webcatalog",
    "directories": {
      "output": "dist"
    },
    "win": {
      "target": "dir"
    },
    "mac": {
      "target": "dir"
    },
    "linux": {
      "target": "dir",
      "category": "Utility"
    }
  }
}
'''

main_js_content = '''const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

let mainWindow;
let appWindows = [];
const appsDir = path.join(app.getPath('userData'), 'apps');

const predefinedApps = [
  { name: "Google", url: "https://www.google.com" },
  { name: "YouTube", url: "https://www.youtube.com" },
];

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile('index.html');
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('load-predefined-apps', predefinedApps);
  });
  buildMenu();
}

function createAppWindow(url, name) {
  const appWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    title: name,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  appWindow.loadURL(url);
  appWindows.push({ name, url, window: appWindow });

  appWindow.on('closed', () => {
    appWindows = appWindows.filter((win) => win.window !== appWindow);
    saveApps();
    buildMenu();
  });

  buildApp(name, url);
  saveApps();
  buildMenu();
}

function buildApp(name, url) {
  const appPath = path.join(appsDir, name);
  if (!fs.existsSync(appsDir)) fs.mkdirSync(appsDir);

  const appPackage = {
    name: name.toLowerCase().replace(/\\s/g, '-'),
    version: "1.0.0",
    main: "app.js",
    scripts: {
      "start": "electron .",
      "build-app": "electron-builder --dir"
    },
    devDependencies: {
      "electron": "^latest",
      "electron-builder": "^latest"
    },
    build: {
      appId: `com.exemplo.webcatalog.${name.toLowerCase().replace(/\\s/g, '-')}`,
      win: { target: "dir" },
      mac: { target: "dir" },
      linux: { target: "dir", category: "Utility" },
      directories: { output: "dist" }
    }
  };

  const appJs = `
    const { app, BrowserWindow } = require('electron');
    const path = require('path');

    function createWindow() {
      const win = new BrowserWindow({
        width: 1024,
        height: 768,
        title: "${name}",
        webPreferences: { nodeIntegration: false, contextIsolation: true }
      });
      win.loadURL("${url}");
    }

    app.whenReady().then(createWindow);
    app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  `;

  fs.mkdirSync(appPath, { recursive: true });
  fs.writeFileSync(path.join(appPath, 'package.json'), JSON.stringify(appPackage, null, 2));
  fs.writeFileSync(path.join(appPath, 'app.js'), appJs);

  // Executar instalação e build de forma síncrona para evitar erros
  const commands = [
    `cd "${appPath}" && npm install`,
    `cd "${appPath}" && npm run build-app`
  ];
  
  commands.forEach(cmd => {
    try {
      execSync(cmd, { stdio: 'inherit' });
      console.log(`Comando executado com sucesso: ${cmd}`);
    } catch (err) {
      console.error(`Erro ao executar ${cmd}: ${err}`);
      return;
    }
  });

  createSystemShortcut(name, appPath);
}

function createSystemShortcut(name, appPath) {
  const platform = process.platform;
  let shortcutPath, targetPath;

  if (platform === 'win32') {
    shortcutPath = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', `${name}.lnk`);
    targetPath = path.join(appPath, 'dist', 'win-unpacked', `${name.toLowerCase().replace(/\\s/g, '-')}.exe`);
    exec(`powershell -Command "New-Item -ItemType SymbolicLink -Path '${shortcutPath}' -Target '${targetPath}'"`, (err) => {
      if (err) console.error(`Erro ao criar atalho no Windows: ${err}`);
    });
  } else if (platform === 'darwin') {
    shortcutPath = path.join(app.getPath('home'), 'Applications', `${name}.app`);
    targetPath = path.join(appPath, 'dist', 'mac', `${name}.app`);
    if (fs.existsSync(targetPath)) fs.symlinkSync(targetPath, shortcutPath, 'dir');
  } else if (platform === 'linux') {
    shortcutPath = path.join(app.getPath('home'), '.local', 'share', 'applications', `${name.toLowerCase().replace(/\\s/g, '-')}.desktop`);
    targetPath = path.join(appPath, 'dist', 'linux-unpacked', `${name.toLowerCase().replace(/\\s/g, '-')}`);
    
    const desktopFile = `[Desktop Entry]
Name=${name}
Exec="${targetPath}" %U
Type=Application
Terminal=false
Categories=Utility;
`;
    fs.mkdirSync(path.dirname(shortcutPath), { recursive: true });
    fs.writeFileSync(shortcutPath, desktopFile);
    exec(`chmod +x "${shortcutPath}"`, (err) => {
      if (err) console.error(`Erro ao tornar o atalho executável no Linux: ${err}`);
    });
  }
}

function saveApps() {
  const apps = appWindows.map((win) => ({ name: win.name, url: win.url }));
  fs.writeFileSync(path.join(appsDir, 'apps.json'), JSON.stringify(apps, null, 2));
}

function loadApps() {
  const appsFile = path.join(appsDir, 'apps.json');
  if (fs.existsSync(appsFile)) {
    const apps = JSON.parse(fs.readFileSync(appsFile));
    apps.forEach((app) => createAppWindow(app.url, app.name));
  }
}

function buildMenu() {
  const menuTemplate = [
    {
      label: 'Apps Instalados',
      submenu: appWindows.map((win) => ({
        label: win.name,
        click: () => win.window.focus(),
      })),
    },
    {
      label: 'Arquivo',
      submenu: [{ role: 'quit', label: 'Sair' }],
    },
  ];
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  createMainWindow();
  loadApps();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('create-app', (event, { url, name }) => {
  createAppWindow(url, name);
});
'''

preload_js_content = '''const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  createApp: (url, name) => ipcRenderer.send('create-app', { url, name }),
  onLoadPredefinedApps: (callback) => ipcRenderer.on('load-predefined-apps', (event, apps) => callback(apps)),
});
'''

index_html_content = '''<!DOCTYPE html>
<html>
  <head>
    <title>Meu WebCatalog</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 20px; background-color: #f0f0f0; }
      h1 { color: #333; }
      input, button { margin: 5px; padding: 8px; font-size: 14px; }
      button { background-color: #007bff; color: white; border: none; cursor: pointer; }
      button:hover { background-color: #0056b3; }
      #predefinedApps { margin-top: 20px; }
      .app-item { display: flex; justify-content: space-between; align-items: center; padding: 10px; background-color: #fff; margin-bottom: 10px; border-radius: 5px; }
    </style>
  </head>
  <body>
    <h1>Crie um novo aplicativo</h1>
    <input type="text" id="appName" placeholder="Nome do app" />
    <input type="text" id="appUrl" placeholder="URL do site (ex: https://www.google.com)" />
    <button onclick="createApp()">Criar</button>

    <h1>Aplicativos Pré-Listados</h1>
    <div id="predefinedApps"></div>

    <script>
      function createApp() {
        const name = document.getElementById('appName').value.trim();
        const url = document.getElementById('appUrl').value.trim();
        if (name && url) {
          if (!url.startsWith('http://') && !url.startsWith('https://')) {
            alert('Por favor, inclua "http://" ou "https://" na URL!');
            return;
          }
          window.electronAPI.createApp(url, name);
          document.getElementById('appName').value = '';
          document.getElementById('appUrl').value = '';
        } else {
          alert('Por favor, preencha ambos os campos!');
        }
      }

      window.electronAPI.onLoadPredefinedApps((apps) => {
        const container = document.getElementById('predefinedApps');
        apps.forEach((app) => {
          const div = document.createElement('div');
          div.className = 'app-item';
          div.innerHTML = `
            <span>${app.name} (${app.url})</span>
            <button onclick="window.electronAPI.createApp('${app.url}', '${app.name}')">Instalar</button>
          `;
          container.appendChild(div);
        });
      });
    </script>
  </body>
</html>
'''

# Escrever os arquivos
with open(os.path.join(project_dir, 'package.json'), 'w') as f:
    f.write(package_json_content)
with open(os.path.join(project_dir, 'main.js'), 'w') as f:
    f.write(main_js_content)
with open(os.path.join(project_dir, 'preload.js'), 'w') as f:
    f.write(preload_js_content)
with open(os.path.join(project_dir, 'index.html'), 'w') as f:
    f.write(index_html_content)

# Instalar dependências do projeto principal
try:
    print("Instalando dependências do projeto principal...")
    subprocess.run(["npm", "install"], cwd=project_dir, check=True, shell=True)
    print("Dependências instaladas com sucesso!")

    print("Iniciando o projeto...")
    subprocess.run(["npm", "start"], cwd=project_dir, shell=True)
except subprocess.CalledProcessError as e:
    print(f"Erro ao executar comandos npm no projeto principal: {e}")

print(f"Projeto gerado com sucesso na pasta '{project_dir}'!")