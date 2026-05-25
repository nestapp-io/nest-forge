const path = require('path');
const fs = require('fs');
const { app, ipcMain, powerSaveBlocker, shell, BaseWindow } = require('electron');

// Per-app identity (neutron-style, refined): when this template is generated
// by nest-build-app-api/ for a specific app, read the per-app config out-of-asar EARLY
// (before whenReady) and:
//   - app.setName(config.name)  → OS-visible name (tooltip, taskbar, window title)
//   - app.setPath('userData', appData/<config.id>) → isolated storage per install
// This way the user sees "Google Chat" / "Slack" everywhere, but storage
// (cookies, sessions, settings) stays isolated by stable id even when 2
// apps share the same display name.
// Fallback: dev multi-app mode keeps default name "NestApp".
(() => {
    try {
        if (!process.resourcesPath) return;
        const cfg = path.join(process.resourcesPath, 'app.asar.unpacked', 'config', 'app.json');
        if (!fs.existsSync(cfg)) return;
        const parsed = JSON.parse(fs.readFileSync(cfg, 'utf8'));
        const displayName = parsed.name;
        const isolationId = parsed.id || parsed.name;
        if (displayName) {
            app.setName(String(displayName));
        }
        if (isolationId) {
            try {
                const baseAppData = app.getPath('appData');
                app.setPath('userData', path.join(baseAppData, String(isolationId)));
            } catch (e2) {
                // ignore — userData fallback to default
            }
        }
    } catch (e) {
        // ignore — fallback to default app.getName() = "NestApp"
    }
})();

const {
    createWindow, loadAppConfig, createSession, configureSessionSecurity,
    setupLanguageManager, globalStore, logger, notificationStore,
    initMenuListeners, registerSettingsIpc, registerNotificationIpc,
    registerAboutIpc, applyProxy, settingsStore, i18n
} = require('#default-modules-path/modules');

process.on('uncaughtException', (error) => {
    // Why: handlers de navegacao envolvem o proprio corpo em try/catch; exceptions
    // genuinamente fatais ja crasham o processo via Chromium. Encerrar aqui matava
    // o app em falhas recuperaveis (ex: shell.openExternal rejection).
    const stack = error && error.stack ? error.stack : '(no stack)';
    logger.error('Uncaught Exception: {} | stack: {}', error.message || String(error), stack);
});

process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection: {}', reason);
});

async function initializeApp() {
    try {
        // Prefer per-app identity set via app.setName() (OCI flow) over env
        // var (dev multi-app) or placeholder (legacy sync-app-entry).
        const appName = app.getName() !== 'NestApp'
            ? app.getName()
            : (process.env.APP_NAME || '#default-name-app');

        if (!appName || appName.trim() === '') {
            throw new Error('Nome da aplicacao e obrigatorio.');
        }

        const powerSaveId = powerSaveBlocker.start('prevent-display-sleep');
        globalStore.set('powerSaveId', powerSaveId);
        globalStore.set('appName', appName);

        const mainWindow = await createMainWindow();
        globalStore.set('mainWindow', mainWindow);

        setupIpcHandlers();
    } catch (error) {
        logger.error('Falha ao iniciar a aplicacao: {}', error.message);
        app.quit();
    }
}

async function createMainWindow() {
    createSession();
    loadAppConfig();
    configureSessionSecurity();
    notificationStore.load();
    i18n.init();
    initMenuListeners();
    registerSettingsIpc();
    registerNotificationIpc();
    registerAboutIpc();
    applyProxy(settingsStore.get('proxy') || {});

    const win = await createWindow();

    if (!win) {
        throw new Error('Falha ao criar a janela principal.');
    }

    setupLanguageManager();

    return win;
}

function setupIpcHandlers() {
    ipcMain.on('focus-window', () => {
        const mainWindow = globalStore.get('mainWindow');
        if (mainWindow) {
            if (!mainWindow.isVisible()) mainWindow.show();
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    ipcMain.on('open-external-url', (event, url) => {
        try {
            const parsedUrl = new URL(url);
            if (['http:', 'https:'].includes(parsedUrl.protocol)) {
                shell.openExternal(url);
            }
        } catch (e) {
            // URL invalida
        }
    });

    ipcMain.on('notification-received', (event, data) => {
        logger.info('Notificacao recebida: {}', data.title);
        notificationStore.add(data);
    });
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
    process.exit(0);
} else {
    app.on('second-instance', () => {
        const mainWindow = globalStore.get('mainWindow');
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            if (!mainWindow.isVisible()) mainWindow.show();
            mainWindow.focus();
            app.focus({ steal: true });
        }
    });

    app.whenReady().then(initializeApp);
}

app.on('before-quit', () => {
    const powerSaveId = globalStore.get('powerSaveId');
    if (powerSaveId !== null && powerSaveId !== undefined) {
        powerSaveBlocker.stop(powerSaveId);
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

function getRootDomain(hostname) {
    const parts = hostname.split('.').filter(Boolean);
    if (parts.length <= 2) return hostname;
    return parts.slice(-2).join('.');
}

function isInternalNavigation(parsedUrl, appUrl) {
    if (parsedUrl.origin === appUrl.origin) return true;
    return getRootDomain(parsedUrl.hostname) === getRootDomain(appUrl.hostname);
}

const DOWNLOAD_EXTENSIONS = /\.(pdf|zip|rar|7z|tar|gz|tgz|bz2|xz|exe|dmg|deb|rpm|msi|appimage|apk|ipa|csv|tsv|xlsx?|docx?|pptx?|odt|ods|odp|rtf|epub|mobi|mp3|wav|ogg|flac|aac|mp4|mkv|mov|avi|webm|wmv|flv|png|jpe?g|gif|svg|webp|heic|bmp|tiff?|ico|iso|img)(\?|$|#)/i;

function isLikelyDownload(parsedUrl) {
    if (parsedUrl.protocol === 'blob:' || parsedUrl.protocol === 'data:') return true;
    return DOWNLOAD_EXTENSIONS.test(parsedUrl.pathname);
}

async function openExternalSafe(url, context) {
    if (typeof url !== 'string' || url.length === 0) return;
    try {
        await shell.openExternal(url);
    } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        logger.error('Falha ao abrir URL externa (contexto={}, url={}): {}', context, url, msg);
    }
}

app.on('web-contents-created', (_, contents) => {
    const appConfig = globalStore.get('appConfig');
    const appUrl = new URL(appConfig.url);

    contents.setWindowOpenHandler(({ url, disposition }) => {
        try {
            const parsedUrl = new URL(url);

            if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
                if (parsedUrl.protocol === 'mailto:' || parsedUrl.protocol === 'tel:') {
                    openExternalSafe(url, 'popup-protocol');
                }
                return { action: 'deny' };
            }

            if (isLikelyDownload(parsedUrl)) {
                contents.downloadURL(url);
                return { action: 'deny' };
            }

            if (isInternalNavigation(parsedUrl, appUrl)) {
                const isUserTabClick =
                    disposition === 'foreground-tab' ||
                    disposition === 'background-tab';
                const contentView = globalStore.get('contentView');
                if (isUserTabClick && contentView && contentView.webContents) {
                    contentView.webContents.loadURL(url).catch(err => {
                        logger.warn('Falha ao carregar popup interno: {}', err.message);
                    });
                    return { action: 'deny' };
                }
                const session = globalStore.get('session');
                if (!session) {
                    logger.error('Sessao indisponivel para popup; abrindo externamente: {}', url);
                    openExternalSafe(url, 'popup-no-session');
                    return { action: 'deny' };
                }
                return {
                    action: 'allow',
                    overrideBrowserWindowOptions: {
                        webPreferences: {
                            session,
                            preload: path.join(__dirname, '#default-modules-path', 'shared/preload.js'),
                            sandbox: true,
                            contextIsolation: true
                        }
                    }
                };
            }

            openExternalSafe(url, 'popup-external');
        } catch (e) {
            const msg = e && e.message ? e.message : String(e);
            logger.error('Excecao em setWindowOpenHandler (url={}): {}', url, msg);
        }
        return { action: 'deny' };
    });

    contents.on('will-navigate', (event, url) => {
        try {
            const parsedUrl = new URL(url);
            if (!['http:', 'https:'].includes(parsedUrl.protocol)) return;

            if (isLikelyDownload(parsedUrl)) {
                event.preventDefault();
                contents.downloadURL(url);
                return;
            }

            if (isInternalNavigation(parsedUrl, appUrl)) return;

            event.preventDefault();
            openExternalSafe(url, 'will-navigate-external');
        } catch (e) {
            const msg = e && e.message ? e.message : String(e);
            logger.error('Excecao em will-navigate (url={}): {}', url, msg);
        }
    });

    contents.on('render-process-gone', (_event, details) => {
        const reason = details && details.reason ? details.reason : 'unknown';
        const exitCode = details && details.exitCode !== undefined ? details.exitCode : -1;
        logger.error('Renderer crash: reason={}, exitCode={}', reason, exitCode);
        const RECOVERABLE = ['crashed', 'oom'];
        const KEY = 'lastRendererRecoveryAt';
        const now = Date.now();
        const lastAt = globalStore.get(KEY) || 0;
        if (RECOVERABLE.includes(reason) && (now - lastAt) > 60_000) {
            globalStore.set(KEY, now);
            try {
                contents.reload();
            } catch (e) {
                const msg = e && e.message ? e.message : String(e);
                logger.error('Falha ao recarregar renderer apos crash: {}', msg);
            }
        }
    });
});

app.on('activate', async () => {
    if (BaseWindow.getAllWindows().length === 0) {
        const mainWindow = await createMainWindow();
        globalStore.set('mainWindow', mainWindow);
    }
});
