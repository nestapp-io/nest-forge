const { session, app, Notification, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const globalStore = require('./global-store');
const logger = require('./logger-manager');

const DEFAULT_PERMISSIONS = {
    notifications: true,
    camera: false,
    microphone: false,
    geolocation: false,
    midi: false,
    pointerLock: false,
    fullscreen: true,
    mediaKeySystem: false,
};

function createSession() {
    const appName = globalStore.get("appName");
    globalStore.set("partitionName", `persist:${appName}`);
    const currentSession = session.fromPartition(globalStore.get("partitionName"));
    globalStore.set("session", currentSession);

    setupCSPHeaders(currentSession);
}

function configureSessionSecurity() {
    const currentSession = globalStore.get("session");
    setupPermissionHandler(currentSession);
    setupDownloadHandler(currentSession);
}

function uniqueDownloadPath(targetDir, filename) {
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    let candidate = path.join(targetDir, filename);
    let counter = 1;
    while (fs.existsSync(candidate)) {
        candidate = path.join(targetDir, `${base} (${counter})${ext}`);
        counter += 1;
    }
    return candidate;
}

function setupDownloadHandler(currentSession) {
    const downloadsDir = app.getPath('downloads');

    currentSession.on('will-download', (event, item) => {
        const filename = item.getFilename();
        const savePath = uniqueDownloadPath(downloadsDir, filename);
        item.setSavePath(savePath);

        logger.info('Download iniciado: {} -> {}', filename, savePath);

        item.on('done', (_e, state) => {
            if (state === 'completed') {
                logger.info('Download concluido: {}', savePath);
                try {
                    if (Notification.isSupported()) {
                        const notif = new Notification({
                            title: 'Download concluido',
                            body: path.basename(savePath),
                            silent: false
                        });
                        notif.on('click', () => {
                            shell.showItemInFolder(savePath);
                        });
                        notif.show();
                    }
                } catch (err) {
                    logger.warn('Falha ao exibir notificacao nativa: {}', err.message);
                }
            } else {
                logger.warn('Download {}: {}', state, filename);
            }
        });
    });
}

function setupPermissionHandler(currentSession) {
    const appConfig = globalStore.get("appConfig") || {};
    const permissions = { ...DEFAULT_PERMISSIONS, ...appConfig.permissions };

    currentSession.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowed = permissions[permission] ?? false;
        logger.info(`Permission request: ${permission} -> ${allowed ? 'granted' : 'denied'}`);
        callback(allowed);
    });
}

function setupCSPHeaders(currentSession) {
    const defaultCSP =
        "default-src 'self' https:; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; " +
        "style-src 'self' 'unsafe-inline' https:; " +
        "img-src 'self' https: data:; " +
        "connect-src 'self' https: wss:; " +
        "font-src 'self' https: data:; " +
        "frame-src 'self' https:;";

    currentSession.webRequest.onHeadersReceived((details, callback) => {
        const hasCSP = details.responseHeaders &&
            Object.keys(details.responseHeaders).some(
                key => key.toLowerCase() === 'content-security-policy'
            );

        const filteredHeaders = { ...details.responseHeaders };
        for (const key of Object.keys(filteredHeaders)) {
            const lower = key.toLowerCase();
            if (lower === 'cross-origin-opener-policy' ||
                lower === 'cross-origin-embedder-policy') {
                delete filteredHeaders[key];
            }
        }

        if (hasCSP) {
            callback({ responseHeaders: filteredHeaders });
        } else {
            callback({
                responseHeaders: {
                    ...filteredHeaders,
                    'Content-Security-Policy': [defaultCSP]
                }
            });
        }
    });
}

function getCurrentSession() {
    if (!globalStore.get("session")) {
        throw new Error('Session não foi criada. Chame createSession primeiro.');
    }
    return globalStore.get("session");
}

function getPartitionName() {
    if (!globalStore.get("partitionName")) {
        throw new Error('Session não foi criada. Chame createSession primeiro.');
    }
    return globalStore.get("partitionName");
}

module.exports = { createSession, getCurrentSession, getPartitionName, configureSessionSecurity };
