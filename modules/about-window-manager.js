const { ipcMain } = require('electron');
const path = require('path');
const { getAppInfo } = require('./app-info');
const { loadAppIcon } = require('./icon-loader');
const globalStore = require('./global-store');
const i18n = require('./i18n-manager');
const { createChromeWindow, updateChromeTitle } = require('./chrome-window');

let entry = null;

function openAboutWindow() {
    if (entry && entry.win && !entry.win.isDestroyed()) {
        entry.win.focus();
        return;
    }

    let icon;
    try {
        const appName = globalStore.get('appName');
        if (appName) icon = loadAppIcon(appName).resize({ width: 64, height: 64 });
    } catch (_) {
        icon = undefined;
    }

    entry = createChromeWindow({
        width: 420,
        height: 540,
        icon,
        iconDataUrl: globalStore.get('appIconDataUrl') || '',
        appName: i18n.t('about.title'),
        showMenu: false,
        resizable: false,
        minimizable: false,
        maximizable: false,
        contentFile: path.join(__dirname, '../src/about/about.html'),
        contentPreload: path.join(__dirname, '../src/about/about-preload.js'),
        contentSandbox: true
    });

    const onLanguageChanged = (lang) => {
        if (!entry || !entry.win || entry.win.isDestroyed()) return;
        updateChromeTitle(entry.chromeView, i18n.t('about.title'));
        entry.contentView.webContents.send('i18n:changed', {
            language: lang,
            strings: i18n.getStrings()
        });
    };
    i18n.onChange(onLanguageChanged);

    entry.win.on('closed', () => {
        i18n.removeListener(onLanguageChanged);
        entry = null;
    });
}

function registerAboutIpc() {
    ipcMain.handle('about:get-info', () => getAppInfo());
    ipcMain.handle('about:close', () => {
        if (entry && entry.win && !entry.win.isDestroyed()) entry.win.close();
        return true;
    });
}

module.exports = { openAboutWindow, registerAboutIpc };
