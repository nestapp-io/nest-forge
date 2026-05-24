const { ipcMain } = require('electron');
const path = require('path');
const globalStore = require('./global-store');
const logger = require('./logger-manager');
const notificationStore = require('./notification-store');
const i18n = require('./i18n-manager');
const { createChromeWindow, updateChromeTitle } = require('./chrome-window');

let entry = null;

function openNotificationWindow() {
    if (entry && entry.win && !entry.win.isDestroyed()) {
        entry.win.focus();
        return;
    }

    entry = createChromeWindow({
        width: 520,
        height: 560,
        appName: i18n.t('notifications.title'),
        iconDataUrl: globalStore.get('appIconDataUrl') || '',
        showMenu: false,
        resizable: true,
        minimizable: true,
        maximizable: true,
        contentFile: path.join(__dirname, '../src/notifications/notifications.html'),
        contentPreload: path.join(__dirname, '../src/notifications/notifications-preload.js'),
        contentSandbox: true
    });

    const onChanged = (list) => {
        if (!entry || !entry.win || entry.win.isDestroyed()) return;
        entry.contentView.webContents.send('notifications:updated', list);
    };

    const onLanguageChanged = (lang) => {
        if (!entry || !entry.win || entry.win.isDestroyed()) return;
        updateChromeTitle(entry.chromeView, i18n.t('notifications.title'));
        entry.contentView.webContents.send('i18n:changed', {
            language: lang,
            strings: i18n.getStrings()
        });
    };

    notificationStore.onChange(onChanged);
    i18n.onChange(onLanguageChanged);

    entry.win.on('closed', () => {
        notificationStore.removeListener(onChanged);
        i18n.removeListener(onLanguageChanged);
        entry = null;
    });
}

function registerNotificationIpc() {
    ipcMain.handle('notifications:get-all', () => notificationStore.getAll());
    ipcMain.handle('notifications:mark-read', (event, id) => { notificationStore.markRead(id); return true; });
    ipcMain.handle('notifications:toggle-pin', (event, id) => notificationStore.togglePin(id));
    ipcMain.handle('notifications:toggle-select', (event, id) => { notificationStore.toggleSelect(id); return true; });
    ipcMain.handle('notifications:select-all', () => { notificationStore.selectAll(); return true; });
    ipcMain.handle('notifications:deselect-all', () => { notificationStore.deselectAll(); return true; });
    ipcMain.handle('notifications:delete-selected', () => { notificationStore.removeSelected(); return true; });
    ipcMain.handle('notifications:clear-read', () => { notificationStore.clearRead(); return true; });
    ipcMain.handle('notifications:clear-all', () => { notificationStore.clearAll(); return true; });
    ipcMain.handle('notifications:remove', (event, id) => { notificationStore.remove(id); return true; });

    ipcMain.handle('notifications:open', (event, id) => {
        const notif = notificationStore.findById(id);
        if (!notif) {
            logger.info('notifications:open - notificacao id="{}" nao encontrada no store', id);
            return false;
        }
        logger.info('notifications:open - id="{}", tag="{}", title="{}"', id, notif.tag, notif.title);

        const mainWindow = globalStore.get('mainWindow');
        if (mainWindow) {
            if (!mainWindow.isVisible()) mainWindow.show();
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
            if (notif.tag || notif.url) {
                const { triggerNotificationClick } = require('./window-manager');
                triggerNotificationClick(mainWindow, notif.tag, notif.title, notif.url);
            } else {
                logger.info('notifications:open - tag e url vazias, apenas focando janela');
            }
        } else {
            logger.info('notifications:open - mainWindow nao encontrada no globalStore');
        }

        notificationStore.markRead(id);
        return true;
    });
}

module.exports = { openNotificationWindow, registerNotificationIpc };
