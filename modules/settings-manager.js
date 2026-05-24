const { BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const globalStore = require('./global-store');
const logger = require('./logger-manager');
const settingsStore = require('./settings-store');
const i18n = require('./i18n-manager');

let settingsWin = null;

function openSettingsWindow() {
    if (settingsWin && !settingsWin.isDestroyed()) {
        settingsWin.focus();
        return;
    }

    settingsWin = new BrowserWindow({
        width: 540,
        height: 500,
        title: i18n.t('settings.title'),
        resizable: false,
        webPreferences: {
            preload: path.join(__dirname, '../src/config/settings-preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
        },
    });

    settingsWin.loadFile(path.join(__dirname, '../src/config/settings.html'));
    settingsWin.setMenuBarVisibility(false);

    const onLanguageChanged = (lang) => {
        if (settingsWin && !settingsWin.isDestroyed()) {
            settingsWin.setTitle(i18n.t('settings.title'));
            settingsWin.webContents.send('i18n:changed', {
                language: lang,
                strings: i18n.getStrings()
            });
        }
    };
    i18n.onChange(onLanguageChanged);

    settingsWin.on('closed', () => {
        i18n.removeListener(onLanguageChanged);
        settingsWin = null;
    });
}

function applyProxy(proxyConfig) {
    const currentSession = globalStore.get('session');
    if (!currentSession) return;

    const config = proxyConfig || {};
    let options;
    if (config.type === 'custom' && config.host) {
        const port = config.port ? `:${config.port}` : '';
        options = {
            mode: 'fixed_servers',
            proxyRules: `http=${config.host}${port};https=${config.host}${port}`,
            proxyBypassRules: ''
        };
    } else if (config.type === 'none') {
        options = { mode: 'direct' };
    } else {
        options = { mode: 'system' };
    }

    currentSession.setProxy(options)
        .then(() => {
            logger.info('Proxy aplicado: {}', config.type || 'system');
            try {
                const { getContentView } = require('./window-manager');
                const contentView = getContentView();
                if (contentView && contentView.webContents) {
                    contentView.webContents.reload();
                }
            } catch (_) { /* janela pode nao existir ainda */ }
        })
        .catch(err => logger.error('Erro ao aplicar proxy: {}', err.message));
}

function registerSettingsIpc() {
    ipcMain.handle('settings:get', () => {
        return settingsStore.getSettings();
    });

    ipcMain.handle('settings:save', (event, newSettings) => {
        const previousLanguage = settingsStore.get('language');
        settingsStore.updateAll(newSettings);
        applyProxy(newSettings.proxy);

        if (newSettings.language && newSettings.language !== previousLanguage) {
            i18n.setLanguage(newSettings.language);
        }

        if (newSettings.logs) {
            logger.reconfigure({
                enabled: newSettings.logs.enabled === true,
                level: newSettings.logs.level,
                maxFileSizeMB: newSettings.logs.maxFileSizeMB,
                maxFiles: newSettings.logs.maxFiles
            });
        }

        try {
            const { applyKeepActive } = require('./window-manager');
            applyKeepActive();
        } catch (err) {
            logger.warn('Falha ao aplicar keep-active: {}', err.message);
        }

        const { refreshMenu } = require('./menu-manager');
        refreshMenu();
        logger.info('Configuracoes salvas');
        return true;
    });

    ipcMain.handle('settings:get-logs-dir', () => {
        return logger.getLogDirectory() || '';
    });

    ipcMain.handle('settings:open-logs-dir', async () => {
        const dir = logger.getLogDirectory();
        if (!dir) return false;
        await shell.openPath(dir);
        return true;
    });

    ipcMain.handle('settings:clear-logs', () => {
        return logger.clearLogs();
    });

    ipcMain.handle('i18n:get', () => {
        return {
            language: i18n.getCurrent(),
            available: i18n.getAvailable(),
            strings: i18n.getStrings()
        };
    });

    ipcMain.handle('i18n:set-language', (event, code) => {
        i18n.setLanguage(code);
        return i18n.getCurrent();
    });
}

module.exports = { openSettingsWindow, registerSettingsIpc, applyProxy };
