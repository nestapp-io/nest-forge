const { BaseWindow, WebContentsView, ipcMain } = require('electron');
const path = require('path');
const logger = require('./logger-manager');

const CHROME_HEIGHT = 32;
const registry = new Map();
let ipcRegistered = false;

function registerChromeIpc() {
    if (ipcRegistered) return;
    ipcRegistered = true;

    const resolve = (event) => {
        const entry = registry.get(event.sender.id);
        return entry || null;
    };

    ipcMain.on('window:minimize', (event) => {
        const e = resolve(event);
        if (e && !e.win.isDestroyed()) e.win.minimize();
    });

    ipcMain.on('window:toggle-maximize', (event) => {
        const e = resolve(event);
        if (!e || e.win.isDestroyed()) return;
        if (!e.meta.maximizable) return;
        if (e.win.isMaximized()) e.win.unmaximize(); else e.win.maximize();
    });

    ipcMain.on('window:close', (event) => {
        const e = resolve(event);
        if (e && !e.win.isDestroyed()) e.win.close();
    });

    ipcMain.handle('chrome:init', (event) => {
        const e = resolve(event);
        if (!e) return { appName: '', icon: '', showMenu: false, platform: process.platform, controls: { minimizable: false, maximizable: false } };
        return {
            appName: e.meta.appName || '',
            icon: e.meta.icon || '',
            showMenu: !!e.meta.showMenu,
            platform: process.platform,
            controls: {
                minimizable: !!e.meta.minimizable,
                maximizable: !!e.meta.maximizable
            }
        };
    });

    ipcMain.handle('menu:get', () => {
        try {
            const { getSerializableMenu } = require('./menu-manager');
            return getSerializableMenu();
        } catch (_) {
            return [];
        }
    });

    ipcMain.handle('menu:invoke', (_event, id) => {
        try {
            const { invokeMenu } = require('./menu-manager');
            invokeMenu(id);
        } catch (err) {
            logger.error('menu:invoke erro: {}', err.message);
        }
    });

    ipcMain.on('menu:popup-top', (event, topId, x, y) => {
        const e = resolve(event);
        if (!e || e.win.isDestroyed()) return;
        try {
            const { popupTopMenu } = require('./menu-manager');
            popupTopMenu(e.win, topId, x, y);
        } catch (err) {
            logger.error('menu:popup-top erro: {}', err.message);
        }
    });

    ipcMain.on('menu:popup-burger', (event, x, y) => {
        const e = resolve(event);
        if (!e || e.win.isDestroyed()) return;
        try {
            const { popupBurgerMenu } = require('./menu-manager');
            popupBurgerMenu(e.win, x, y);
        } catch (err) {
            logger.error('menu:popup-burger erro: {}', err.message);
        }
    });
}

function makeLayout(entry) {
    return function layout() {
        if (!entry.win || entry.win.isDestroyed()) return;
        const [w, h] = entry.win.getSize();
        if (entry.fullscreen) {
            entry.chromeView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
            entry.contentView.setBounds({ x: 0, y: 0, width: w, height: h });
            return;
        }
        entry.chromeView.setBounds({ x: 0, y: 0, width: w, height: CHROME_HEIGHT });
        entry.contentView.setBounds({
            x: 0,
            y: CHROME_HEIGHT,
            width: w,
            height: Math.max(0, h - CHROME_HEIGHT)
        });
    };
}

function createChromeWindow(opts) {
    registerChromeIpc();

    const {
        width = 800,
        height = 600,
        minWidth,
        minHeight,
        icon,
        iconDataUrl = '',
        appName = '',
        showMenu = false,
        resizable = true,
        minimizable = true,
        maximizable = true,
        backgroundColor = '#0e1116',
        contentFile,
        contentUrl,
        contentPreload,
        contentPartition,
        contentSandbox = true
    } = opts || {};

    const win = new BaseWindow({
        width,
        height,
        minWidth,
        minHeight,
        icon,
        backgroundColor,
        resizable,
        minimizable,
        maximizable,
        frame: false,
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
        trafficLightPosition: process.platform === 'darwin' ? { x: 12, y: 10 } : undefined
    });

    const chromeView = new WebContentsView({
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            preload: path.join(__dirname, 'chrome-ui', 'chrome-preload.js')
        }
    });
    chromeView.setBackgroundColor('#151a22');
    chromeView.webContents.loadFile(path.join(__dirname, 'chrome-ui', 'chrome.html'));

    const contentPrefs = {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: contentSandbox,
        webSecurity: true,
        allowRunningInsecureContent: false
    };
    if (contentPreload) contentPrefs.preload = contentPreload;
    if (contentPartition) contentPrefs.partition = contentPartition;

    const contentView = new WebContentsView({ webPreferences: contentPrefs });

    win.contentView.addChildView(contentView);
    win.contentView.addChildView(chromeView);

    if (contentFile) contentView.webContents.loadFile(contentFile);
    else if (contentUrl) contentView.webContents.loadURL(contentUrl);

    const entry = {
        win,
        chromeView,
        contentView,
        fullscreen: false,
        meta: { appName, icon: iconDataUrl, showMenu, minimizable, maximizable }
    };
    const layout = makeLayout(entry);

    registry.set(chromeView.webContents.id, entry);

    function deferLayout() {
        setImmediate(layout);
    }

    win.on('resize', layout);
    win.on('maximize', () => {
        deferLayout();
        if (!chromeView.webContents.isDestroyed()) chromeView.webContents.send('chrome:max-state', true);
    });
    win.on('unmaximize', () => {
        deferLayout();
        if (!chromeView.webContents.isDestroyed()) chromeView.webContents.send('chrome:max-state', false);
    });
    win.on('restore', deferLayout);
    win.on('moved', layout);

    contentView.webContents.on('enter-html-full-screen', () => {
        entry.fullscreen = true;
        chromeView.setVisible(false);
        layout();
    });
    contentView.webContents.on('leave-html-full-screen', () => {
        entry.fullscreen = false;
        chromeView.setVisible(true);
        layout();
    });

    chromeView.webContents.once('did-finish-load', layout);
    layout();

    win.on('closed', () => {
        registry.delete(chromeView.webContents.id);
    });

    return entry;
}

function updateChromeTitle(chromeView, appName) {
    if (!chromeView || chromeView.webContents.isDestroyed()) return;
    chromeView.webContents.send('chrome:set-app-name', appName);
}

function notifyMenuChanged() {
    for (const entry of registry.values()) {
        if (!entry.meta.showMenu) continue;
        if (entry.chromeView.webContents.isDestroyed()) continue;
        entry.chromeView.webContents.send('chrome:menu-changed');
    }
}

module.exports = { createChromeWindow, updateChromeTitle, notifyMenuChanged, registerChromeIpc };
