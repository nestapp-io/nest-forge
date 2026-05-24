const { app, shell } = require('electron');
const globalStore = require('./global-store');
const logger = require('./logger-manager');
const notificationStore = require('./notification-store');
const settingsStore = require('./settings-store');
const i18n = require('./i18n-manager');

let actionRegistry = new Map();
let acceleratorIndex = [];
let idSeq = 0;

function nextId(prefix) {
    idSeq += 1;
    return `${prefix}-${idSeq}`;
}

function setChromeView() {
    // compat no-op: menu agora é entregue via chrome-window.js
}

function pushAccelerator(id, accelerator) {
    if (!accelerator) return;
    const isMac = process.platform === 'darwin';
    const parts = accelerator.split('+').map(s => s.trim().toLowerCase());
    const mods = { ctrl: false, shift: false, alt: false, meta: false };
    let key = '';
    for (const p of parts) {
        if (p === 'cmdorctrl' || p === 'commandorcontrol') {
            if (isMac) mods.meta = true; else mods.ctrl = true;
        } else if (p === 'ctrl' || p === 'control') mods.ctrl = true;
        else if (p === 'command' || p === 'cmd') mods.meta = true;
        else if (p === 'shift') mods.shift = true;
        else if (p === 'alt' || p === 'option') mods.alt = true;
        else if (p === 'meta' || p === 'super') mods.meta = true;
        else key = p;
    }
    acceleratorIndex.push({ id, mods, key });
}

function matchAccelerator(input) {
    const key = (input.key || '').toLowerCase();
    for (const entry of acceleratorIndex) {
        if (entry.key !== key) continue;
        if (!!entry.mods.ctrl !== !!input.control) continue;
        if (!!entry.mods.shift !== !!input.shift) continue;
        if (!!entry.mods.alt !== !!input.alt) continue;
        if (!!entry.mods.meta !== !!input.meta) continue;
        return entry.id;
    }
    return null;
}

function resolveRoleAction(role) {
    const wm = require('./window-manager');
    switch (role) {
        case 'reload':
            return () => { const v = wm.getContentView(); if (v) v.webContents.reload(); };
        case 'forceReload':
            return () => { const v = wm.getContentView(); if (v) v.webContents.reloadIgnoringCache(); };
        case 'toggleDevTools':
            return () => { const v = wm.getContentView(); if (v) v.webContents.toggleDevTools(); };
        case 'quit':
            return () => app.quit();
        default:
            return null;
    }
}

function serializeItems(items) {
    const out = [];
    for (const it of items) {
        if (it.type === 'separator') {
            out.push({ separator: true });
            continue;
        }
        if (it.visible === false) continue;

        const id = nextId('mi');
        const node = {
            id,
            label: it.label || '',
            accelerator: it.accelerator || null,
            enabled: it.enabled !== false,
            checked: !!it.checked,
            checkbox: it.type === 'checkbox'
        };

        if (it.click) {
            actionRegistry.set(id, it.click);
            pushAccelerator(id, it.accelerator);
        } else if (it.role) {
            const fn = resolveRoleAction(it.role);
            if (fn) {
                actionRegistry.set(id, fn);
                pushAccelerator(id, it.accelerator);
            }
        }

        if (Array.isArray(it.submenu)) {
            node.items = serializeItems(it.submenu);
        }

        out.push(node);
    }
    return out;
}

function formatTimestamp(ts) {
    const date = new Date(ts);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

function buildNotificationSubmenu() {
    const quickList = notificationStore.getQuickList();
    const unreadCount = notificationStore.getUnreadCount();
    const submenu = [];

    if (quickList.length === 0) {
        submenu.push({ label: i18n.t('menu.notifications.empty'), enabled: false });
    } else {
        quickList.forEach((notif) => {
            const time = formatTimestamp(notif.timestamp);
            const pinIcon = notif.pinned ? '[F] ' : '';
            const readPrefix = notif.read ? '' : '* ';
            const title = notif.title.length > 50 ? notif.title.substring(0, 47) + '...' : notif.title;
            const label = `${readPrefix}${pinIcon}[${time}] ${title}`;

            submenu.push({
                label: label,
                submenu: [
                    { label: notif.body || i18n.t('menu.notifications.noBody'), enabled: false },
                    { type: 'separator' },
                    {
                        label: i18n.t('menu.notifications.open'),
                        click: () => {
                            const { triggerNotificationClick } = require('./window-manager');
                            const mainWindow = globalStore.get('mainWindow');
                            if (mainWindow) {
                                if (!mainWindow.isVisible()) mainWindow.show();
                                if (mainWindow.isMinimized()) mainWindow.restore();
                                mainWindow.focus();
                                if (notif.tag || notif.url) triggerNotificationClick(mainWindow, notif.tag, notif.title, notif.url);
                            }
                            notificationStore.markRead(notif.id);
                        }
                    },
                    {
                        label: notif.pinned ? i18n.t('menu.notifications.unpin') : i18n.t('menu.notifications.pin'),
                        click: () => notificationStore.togglePin(notif.id)
                    },
                    {
                        label: i18n.t('menu.notifications.delete'),
                        click: () => notificationStore.remove(notif.id)
                    }
                ]
            });
        });

        submenu.push({ type: 'separator' });
        const totalAll = notificationStore.getAll().length;
        submenu.push({
            label: i18n.t('menu.notifications.openAll', { count: totalAll }),
            click: () => {
                const { openNotificationWindow } = require('./notification-window-manager');
                openNotificationWindow();
            }
        });
        submenu.push({ type: 'separator' });

        const hasRead = quickList.some(n => n.read);
        if (hasRead) {
            submenu.push({ label: i18n.t('menu.notifications.clearRead'), click: () => notificationStore.clearRead() });
        }
        submenu.push({ label: i18n.t('menu.notifications.clearAll'), click: () => notificationStore.clearAll() });
    }

    return { submenu, unreadCount };
}

function buildFileMenu() {
    return {
        label: i18n.t('menu.file.title'),
        submenu: [
            { label: i18n.t('menu.file.reload'), accelerator: 'CmdOrCtrl+R', role: 'reload' },
            { label: i18n.t('menu.file.forceReload'), accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' },
            { type: 'separator' },
            { label: i18n.t('menu.file.quit'), accelerator: 'CmdOrCtrl+Q', role: 'quit' },
            { label: 'DevTools', accelerator: 'F12', role: 'toggleDevTools' }
        ]
    };
}

function buildSettingsMenu() {
    const { openSettingsWindow } = require('./settings-manager');

    return {
        label: i18n.t('menu.settings.title'),
        submenu: [
            {
                label: i18n.t('menu.settings.open'),
                accelerator: 'CmdOrCtrl+,',
                click: () => openSettingsWindow()
            }
        ]
    };
}

function buildHelpMenu() {
    const config = globalStore.get('appConfig');
    const submenu = [];

    if (config.helpUrl) submenu.push({ label: i18n.t('menu.help.docs'), click: () => shell.openExternal(config.helpUrl) });
    if (config.issuesUrl) submenu.push({ label: i18n.t('menu.help.report'), click: () => shell.openExternal(config.issuesUrl) });
    if (submenu.length > 0) submenu.push({ type: 'separator' });

    submenu.push({
        label: i18n.t('menu.help.about', { appName: config.name }),
        click: () => {
            try {
                const { openAboutWindow } = require('./about-window-manager');
                openAboutWindow();
            } catch (err) {
                logger.warn('about-window-manager nao disponivel: {}', err.message);
            }
        }
    });

    return { label: i18n.t('menu.help.title'), submenu };
}

function buildMenuTemplate() {
    const notifEnabled = settingsStore.get('notifications.enabled') !== false;
    const { submenu: notifSubmenu, unreadCount } = buildNotificationSubmenu();
    const notifLabel = unreadCount > 0
        ? i18n.t('menu.notifications.titleWithCount', { count: unreadCount })
        : i18n.t('menu.notifications.title');

    const template = [buildFileMenu(), buildSettingsMenu()];
    if (notifEnabled) template.push({ label: notifLabel, submenu: notifSubmenu });
    template.push(buildHelpMenu());
    return template;
}

function getSerializableMenu() {
    actionRegistry = new Map();
    acceleratorIndex = [];
    idSeq = 0;

    const template = buildMenuTemplate();
    const result = [];
    for (const top of template) {
        const id = nextId('top');
        result.push({
            id,
            label: top.label,
            items: Array.isArray(top.submenu) ? serializeItems(top.submenu) : []
        });
    }
    return result;
}

function invokeMenu(id) {
    const fn = actionRegistry.get(id);
    if (!fn) {
        logger.warn('invokeMenu: acao nao encontrada para id={}', id);
        return;
    }
    try {
        fn({ checked: undefined });
    } catch (err) {
        logger.error('invokeMenu erro: {}', err.message);
    }
}

function refreshMenu() {
    try {
        const { notifyMenuChanged } = require('./chrome-window');
        notifyMenuChanged();
    } catch (err) {
        logger.warn('refreshMenu: chrome-window indisponivel: {}', err.message);
    }
}

function createMenu() {
    return null;
}

function buildNativeItems(items) {
    const { Menu, MenuItem } = require('electron');
    const result = [];
    for (const it of items) {
        if (it.separator) {
            result.push({ type: 'separator' });
            continue;
        }
        const entry = {
            label: it.label || '',
            enabled: it.enabled !== false
        };
        if (it.checkbox) {
            entry.type = 'checkbox';
            entry.checked = !!it.checked;
        }
        if (it.accelerator) entry.accelerator = it.accelerator;
        if (Array.isArray(it.items) && it.items.length > 0) {
            entry.submenu = buildNativeItems(it.items);
        } else if (it.id) {
            const capturedId = it.id;
            entry.click = () => invokeMenu(capturedId);
        }
        result.push(entry);
    }
    return result;
}

function popupTopMenu(win, topId, x, y) {
    const { Menu } = require('electron');
    const serialized = getSerializableMenu();
    const top = serialized.find(t => t.label === topId || t.id === topId);
    if (!top || !top.items) return;
    const nativeItems = buildNativeItems(top.items);
    const menu = Menu.buildFromTemplate(nativeItems);
    menu.popup({ window: win, x: Math.round(x), y: Math.round(y) });
}

function popupBurgerMenu(win, x, y) {
    const { Menu } = require('electron');
    const serialized = getSerializableMenu();
    const nativeItems = [];
    for (const top of serialized) {
        nativeItems.push({ label: top.label, enabled: false });
        if (Array.isArray(top.items)) {
            for (const it of buildNativeItems(top.items)) nativeItems.push(it);
        }
        nativeItems.push({ type: 'separator' });
    }
    if (nativeItems.length && nativeItems[nativeItems.length - 1].type === 'separator') nativeItems.pop();
    const menu = Menu.buildFromTemplate(nativeItems);
    menu.popup({ window: win, x: Math.round(x), y: Math.round(y) });
}

function initMenuListeners() {
    notificationStore.onChange(() => refreshMenu());
    i18n.onChange(() => refreshMenu());
}

module.exports = {
    createMenu,
    refreshMenu,
    initMenuListeners,
    getSerializableMenu,
    invokeMenu,
    matchAccelerator,
    setChromeView,
    popupTopMenu,
    popupBurgerMenu
};
