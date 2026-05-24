const path = require('path');
const globalStore = require('./global-store');
const { configureTray } = require('../shared/components/tray-config');
const { loadAppIcon } = require('./icon-loader');
const { extractExtension } = require('./extension-manager');
const { createChromeWindow } = require('./chrome-window');
const logger = require('./logger-manager');

const ICON_SIZE = { width: 64, height: 64 };
const DEFAULT_KEEP_ACTIVE_INTERVAL_SECONDS = 240;

function getKeepActiveSettings() {
    const settingsStore = require('./settings-store');
    const seconds = Number(settingsStore.get('keepActiveIntervalSeconds')) || DEFAULT_KEEP_ACTIVE_INTERVAL_SECONDS;
    return {
        enabled: settingsStore.get('keepActive') === true,
        intervalMs: Math.max(60, Math.min(1800, seconds)) * 1000
    };
}

function toDisplayName(slug) {
    if (!slug) return '';
    return String(slug)
        .split(/[-_]+/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function buildAppDisplayName(config) {
    const raw = (config && config.displayName) || (config && config.name) || '';
    return /\s/.test(raw) ? raw : toDisplayName(raw);
}

let clickInterval = null;
let appConfig = {};
let win = null;
let chromeView = null;
let contentView = null;
let keepActiveLogging = false;

function iconDataUrl(nativeImage) {
    try {
        return nativeImage.resize({ width: 32, height: 32 }).toDataURL();
    } catch (err) {
        logger.warn('Falha ao gerar dataURL do icone: {}', err.message);
        return '';
    }
}

function registerAccelerators(menuManager) {
    contentView.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return;
        const match = menuManager.matchAccelerator(input);
        if (match) {
            event.preventDefault();
            menuManager.invokeMenu(match);
        }
    });
}

async function createWindow() {
    appConfig = globalStore.get('appConfig');
    const appName = globalStore.get('appName');
    const appIcon = loadAppIcon(appName);
    const partitionName = globalStore.get('partitionName');
    const currentSession = globalStore.get('session');
    const resizedIcon = appIcon.resize(ICON_SIZE);
    const dataUrl = iconDataUrl(appIcon);

    globalStore.set('appIconDataUrl', dataUrl);

    const entry = createChromeWindow({
        width: appConfig.width || 800,
        height: appConfig.height || 600,
        minWidth: 360,
        minHeight: 240,
        icon: resizedIcon,
        iconDataUrl: dataUrl,
        appName: buildAppDisplayName(appConfig),
        showMenu: true,
        resizable: true,
        minimizable: true,
        maximizable: true,
        contentUrl: validateUrl(appConfig.url),
        contentPreload: path.join(__dirname, '../shared/preload.js'),
        contentPartition: partitionName,
        contentSandbox: true
    });

    win = entry.win;
    chromeView = entry.chromeView;
    contentView = entry.contentView;

    const menuManager = require('./menu-manager');
    menuManager.setChromeView(chromeView);
    registerAccelerators(menuManager);

    const tray = configureTray(win, resizedIcon, appName);
    tray.setToolTip(appConfig.name);

    contentView.webContents.on('dom-ready', () => injectNotificationInterceptor());
    contentView.webContents.on('did-finish-load', () => injectNotificationInterceptor());
    contentView.webContents.on('did-navigate-in-page', () => injectNotificationInterceptor());
    contentView.webContents.on('page-title-updated', (event) => event.preventDefault());

    win.on('closed', () => {
        stopKeepActive();
        globalStore.set('mainWindow', null);
        globalStore.set('contentView', null);
        win = null;
        chromeView = null;
        contentView = null;
    });

    globalStore.set('mainWindow', win);
    globalStore.set('contentView', contentView);

    await extractExtension(appName, appConfig, currentSession);
    applyKeepActive();

    return win;
}

function validateUrl(raw) {
    const validUrl = new URL(raw);
    if (!['http:', 'https:'].includes(validUrl.protocol)) {
        throw new Error(`Protocolo nao permitido: ${validUrl.protocol}`);
    }
    return raw;
}

function getContentView() {
    return contentView;
}

function startKeepActive(intervalMs) {
    if (!contentView) return;
    if (clickInterval) clearInterval(clickInterval);

    clickInterval = setInterval(() => {
        const current = getKeepActiveSettings();
        if (!current.enabled) { stopKeepActive(); return; }
        if (!win || win.isFocused()) {
            if (keepActiveLogging) logger.info('Janela com foco, sem clique simulado.');
            return;
        }
        contentView.webContents.sendInputEvent({ type: 'mouseDown', x: 4000, y: 700, button: 'left' });
        contentView.webContents.sendInputEvent({ type: 'mouseUp', x: 4000, y: 700, button: 'left' });
        if (keepActiveLogging) logger.info('Clique simulado!');
    }, intervalMs);
}

function stopKeepActive() {
    if (clickInterval) {
        clearInterval(clickInterval);
        clickInterval = null;
        logger.info('Keep Active parado!');
    }
}

function applyKeepActive() {
    const { enabled, intervalMs } = getKeepActiveSettings();
    if (enabled) startKeepActive(intervalMs);
    else stopKeepActive();
    return enabled;
}

function injectNotificationInterceptor() {
    if (!contentView) return;
    contentView.webContents.executeJavaScript(`
        (function() {
            if (!window.__nestappNotifStore) window.__nestappNotifStore = {};
            if (!window.__nestappNotifHandlers) window.__nestappNotifHandlers = {};
            if (window.__nestappNotifPatched) return;
            window.__nestappNotifPatched = true;

            var OriginalNotification = window.Notification;
            window.Notification = function(title, options) {
                options = options || {};
                var tag = options.tag || ('notif_' + Date.now());
                var notif = new OriginalNotification(title, options);
                window.__nestappNotifStore[tag] = notif;

                var notifUrl = '';
                try {
                    if (options.data && typeof options.data === 'object') {
                        notifUrl = options.data.url || options.data.link || options.data.href || '';
                    }
                } catch (e) {}

                var origOnclick = null;
                Object.defineProperty(notif, 'onclick', {
                    get: function() { return origOnclick; },
                    set: function(fn) {
                        origOnclick = fn;
                        window.__nestappNotifHandlers[tag] = fn;
                    },
                    configurable: true
                });

                var origAddEventListener = notif.addEventListener.bind(notif);
                notif.addEventListener = function(type, fn, opts) {
                    if (type === 'click') window.__nestappNotifHandlers[tag + ':listener'] = fn;
                    return origAddEventListener(type, fn, opts);
                };

                window.postMessage({ type: '__nestapp_notification', title: title, body: options.body || '', tag: tag, url: notifUrl }, '*');
                notif.addEventListener('click', function() {
                    window.postMessage({ type: '__nestapp_notification_click' }, '*');
                });
                return notif;
            };

            window.Notification.permission = OriginalNotification.permission;
            window.Notification.requestPermission = OriginalNotification.requestPermission.bind(OriginalNotification);
            Object.defineProperty(window.Notification, 'permission', {
                get: function() { return OriginalNotification.permission; }
            });

            try {
                if (window.ServiceWorkerRegistration && window.ServiceWorkerRegistration.prototype && window.ServiceWorkerRegistration.prototype.showNotification) {
                    var origSWShow = window.ServiceWorkerRegistration.prototype.showNotification;
                    window.ServiceWorkerRegistration.prototype.showNotification = function(swTitle, swOptions) {
                        try {
                            var opts = swOptions || {};
                            var swTag = opts.tag || 'notif_' + Date.now();
                            var swUrl = '';
                            if (opts.data && typeof opts.data === 'object') {
                                swUrl = opts.data.url || opts.data.link || opts.data.href || '';
                            }
                            window.postMessage({
                                type: '__nestapp_notification',
                                title: swTitle,
                                body: opts.body || '',
                                tag: swTag,
                                url: swUrl
                            }, '*');
                        } catch (e) {}
                        return origSWShow.call(this, swTitle, swOptions);
                    };
                }
            } catch (e) {}
        })();
    `).catch(err => logger.error('Erro ao injetar interceptor de notificacoes: {}', err.message));
}

function triggerNotificationClick(targetWin, tag, title, url) {
    if (!contentView) {
        logger.info('triggerNotificationClick: contentView indisponivel');
        return;
    }
    logger.info('triggerNotificationClick: tag="{}", title="{}", url="{}"', tag || '', title || '', url || '');

    if (url) {
        try {
            const parsed = new URL(url);
            if (['http:', 'https:'].includes(parsed.protocol)) {
                contentView.webContents.loadURL(url).catch(err => {
                    logger.warn('Falha ao navegar via url da notificacao: {}', err.message);
                });
                return;
            }
        } catch (_) { /* invalid url, fallback */ }
    }

    if (!tag) return;

    const tagJson = JSON.stringify(tag);
    const titleJson = JSON.stringify(title || '');
    contentView.webContents.executeJavaScript(`
        (function() {
            var tag = ${tagJson};
            var title = ${titleJson};
            var store = window.__nestappNotifStore || {};
            var handlers = window.__nestappNotifHandlers || {};
            var notif = store[tag];

            function extractHref(el) {
                if (!el) return '';
                if (el.tagName === 'A' && el.href) return el.href;
                var dh = el.getAttribute && el.getAttribute('data-href');
                if (dh) return dh;
                var inner = el.querySelector && el.querySelector('a[href], [data-href]');
                if (inner) {
                    if (inner.tagName === 'A' && inner.href) return inner.href;
                    var idh = inner.getAttribute('data-href');
                    if (idh) return idh;
                }
                return '';
            }

            function navigateTo(href) {
                try {
                    var abs = /^https?:\\/\\//i.test(href) ? href : new URL(href, window.location.href).href;
                    window.location.href = abs;
                    return abs;
                } catch(e) {
                    return '';
                }
            }

            function coordsOf(el) {
                if (!el) return null;
                try { el.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch(e) {}
                var inner = el.querySelector('[role="button"], [role="link"], a, button') || el;
                var rect = inner.getBoundingClientRect();
                if (rect.width <= 0 || rect.height <= 0) return null;
                return {
                    x: Math.round(rect.left + rect.width / 2),
                    y: Math.round(rect.top + rect.height / 2)
                };
            }

            function activate(el, label) {
                var href = extractHref(el);
                if (href) {
                    var abs = navigateTo(href);
                    if (abs) return { action: 'navigated', label: label, url: abs };
                }
                var c = coordsOf(el);
                if (c) return { action: 'click', label: label, x: c.x, y: c.y };
                try { el.click(); } catch(e) {}
                return { action: 'clicked_fallback', label: label };
            }

            if (notif) {
                try { notif.dispatchEvent(new Event('click')); } catch(e) {}
                if (typeof notif.onclick === 'function') {
                    try { notif.onclick.call(notif); } catch(e) {}
                }
                return { action: 'clicked_object' };
            }

            var handler = handlers[tag] || handlers[tag + ':listener'];
            if (handler) {
                try { handler.call(null); } catch(e) {}
                return { action: 'clicked_handler' };
            }

            if (title) {
                var searchTerms = [title];
                var prefixes = ['Conversa em: ', 'Mensagem de ', 'Message from '];
                for (var p = 0; p < prefixes.length; p++) {
                    if (title.indexOf(prefixes[p]) === 0) {
                        searchTerms.push(title.substring(prefixes[p].length));
                    }
                }
                var colonIdx = title.indexOf(':');
                if (colonIdx > 0 && colonIdx < 80) {
                    searchTerms.push(title.substring(0, colonIdx).trim());
                }
                var firstParen = title.indexOf('(');
                if (firstParen > 0) {
                    searchTerms.push(title.substring(0, firstParen).trim());
                }
                var parenRe = /\\(([^()]+)\\)/g;
                var pm;
                while ((pm = parenRe.exec(title)) !== null) {
                    searchTerms.push(pm[1].trim());
                }

                var seen = {};
                searchTerms = searchTerms.filter(function(s){
                    s = (s || '').trim();
                    if (!s || s.length < 2 || seen[s]) return false;
                    seen[s] = true;
                    return true;
                });

                var ariaCandidates = document.querySelectorAll('[aria-label]');
                for (var t = 0; t < searchTerms.length; t++) {
                    var term = searchTerms[t];
                    for (var i = 0; i < ariaCandidates.length; i++) {
                        var al = ariaCandidates[i].getAttribute('aria-label') || '';
                        if (al.indexOf(term) !== -1) {
                            var clickAria = ariaCandidates[i].closest('[role="listitem"], [role="option"], [role="treeitem"], a, button') || ariaCandidates[i];
                            return activate(clickAria, 'aria:' + term);
                        }
                    }
                }

                var candidates = document.querySelectorAll(
                    '[role="listitem"], [role="option"], [role="treeitem"], [role="link"], [role="tab"], [role="row"], [data-topic-id], [data-group-id], [data-room-id]'
                );
                for (var t = 0; t < searchTerms.length; t++) {
                    var term = searchTerms[t];
                    for (var i = 0; i < candidates.length; i++) {
                        var text = candidates[i].textContent || '';
                        if (text.indexOf(term) !== -1) {
                            return activate(candidates[i], 'sidebar:' + term);
                        }
                    }
                }

                var allSpans = document.querySelectorAll('span, div');
                for (var t = 0; t < searchTerms.length; t++) {
                    var term = searchTerms[t];
                    for (var i = 0; i < allSpans.length; i++) {
                        var el = allSpans[i];
                        if (el.children.length === 0 && el.textContent.trim() === term) {
                            var clickTarget = el.closest('[role="listitem"], [role="option"], [role="treeitem"], [role="link"], a, button') || el;
                            return activate(clickTarget, 'text:' + term);
                        }
                    }
                }
            }
            return { action: 'not_found' };
        })();
    `).then(result => {
        if (!result || typeof result !== 'object') {
            logger.info('triggerNotificationClick resultado: {}', String(result));
            return;
        }
        const label = result.label ? ' ' + result.label : '';
        if (result.action === 'click' && typeof result.x === 'number' && typeof result.y === 'number') {
            logger.info('triggerNotificationClick click{} ({},{})', label, result.x, result.y);
            const wc = contentView.webContents;
            wc.sendInputEvent({ type: 'mouseMove', x: result.x, y: result.y });
            wc.sendInputEvent({ type: 'mouseDown', x: result.x, y: result.y, button: 'left', clickCount: 1 });
            wc.sendInputEvent({ type: 'mouseUp', x: result.x, y: result.y, button: 'left', clickCount: 1 });
        } else if (result.action === 'navigated') {
            logger.info('triggerNotificationClick navegado{}: {}', label, result.url || '');
        } else {
            logger.info('triggerNotificationClick resultado: {}{}', result.action || 'unknown', label);
        }
    }).catch(err => logger.error('Erro ao disparar notificacao: {}', err.message));
}

function toggleKeepActiveLogging(enabled) {
    keepActiveLogging = enabled;
    logger.info(`Keep Active logging: ${enabled ? 'ativado' : 'desativado'}`);
}

function isKeepActiveLogging() {
    return keepActiveLogging;
}

module.exports = {
    applyKeepActive,
    createWindow,
    toggleKeepActiveLogging,
    isKeepActiveLogging,
    triggerNotificationClick,
    getContentView
};
