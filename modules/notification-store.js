const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const crypto = require('crypto');
const globalStore = require('./global-store');
const logger = require('./logger-manager');
const settingsStore = require('./settings-store');

const emitter = new EventEmitter();
let notificationList = [];
let notificationsFilePath = null;

function generateId() {
    return crypto.randomBytes(8).toString('hex');
}

function getFilePath() {
    if (!notificationsFilePath) {
        const appName = globalStore.get('appName') || 'default';
        const dir = process.env.NESTAPP_CHILD
            ? app.getPath('userData')
            : path.join(app.getPath('userData'), `corebox/${appName}`);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        notificationsFilePath = path.join(dir, 'notifications.json');
    }
    return notificationsFilePath;
}

function load() {
    try {
        const filePath = getFilePath();
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            notificationList = data.map(n => ({
                id: n.id || generateId(),
                title: n.title || '',
                body: n.body || '',
                tag: n.tag || '',
                url: n.url || '',
                timestamp: n.timestamp || Date.now(),
                read: n.read || false,
                pinned: n.pinned || false
            }));
        }
    } catch (err) {
        logger.error('Erro ao carregar notificacoes: {}', err.message);
        notificationList = [];
    }
}

function save() {
    try {
        const filePath = getFilePath();
        fs.writeFileSync(filePath, JSON.stringify(notificationList, null, 2), 'utf-8');
    } catch (err) {
        logger.error('Erro ao salvar notificacoes: {}', err.message);
    }
}

function notifyChange() {
    save();
    emitter.emit('changed', notificationList);
}

function add(data) {
    const maxStored = settingsStore.get('notifications.maxStored') || 50;

    notificationList.unshift({
        id: generateId(),
        title: data.title,
        body: data.body,
        tag: data.tag || '',
        url: data.url || '',
        timestamp: data.timestamp || Date.now(),
        read: false,
        pinned: false
    });

    if (notificationList.length > maxStored) {
        notificationList = notificationList.filter(n => n.pinned)
            .concat(notificationList.filter(n => !n.pinned).slice(0, maxStored));
    }

    notifyChange();
}

function findById(id) {
    return notificationList.find(n => n.id === id);
}

function markRead(id) {
    const notif = findById(id);
    if (notif) {
        notif.read = true;
        notifyChange();
    }
}

function togglePin(id) {
    const notif = findById(id);
    if (notif) {
        notif.pinned = !notif.pinned;
        notifyChange();
    }
    return notif ? notif.pinned : false;
}

function remove(id) {
    notificationList = notificationList.filter(n => n.id !== id);
    notifyChange();
}

function removeSelected() {
    notificationList = notificationList.filter(n => !n.selected);
    notifyChange();
}

function toggleSelect(id) {
    const notif = findById(id);
    if (notif) {
        notif.selected = !notif.selected;
        notifyChange();
    }
}

function selectAll() {
    notificationList.forEach(n => { n.selected = true; });
    notifyChange();
}

function deselectAll() {
    notificationList.forEach(n => { n.selected = false; });
    notifyChange();
}

function clearRead() {
    notificationList = notificationList.filter(n => !n.read || n.pinned);
    notifyChange();
}

function clearAll() {
    notificationList = notificationList.filter(n => n.pinned);
    notifyChange();
}

function getAll() {
    return [...notificationList];
}

function getUnreadCount() {
    return notificationList.filter(n => !n.read).length;
}

function getPinned() {
    return notificationList.filter(n => n.pinned);
}

function getQuickList() {
    const max = settingsStore.get('notifications.maxQuickMenu') || 10;
    const pinned = notificationList.filter(n => n.pinned);
    const recent = notificationList.filter(n => !n.pinned).slice(0, max);
    return [...pinned, ...recent];
}

function onChange(callback) {
    emitter.on('changed', callback);
}

function removeListener(callback) {
    emitter.removeListener('changed', callback);
}

module.exports = {
    load,
    add,
    findById,
    markRead,
    togglePin,
    remove,
    removeSelected,
    toggleSelect,
    selectAll,
    deselectAll,
    clearRead,
    clearAll,
    getAll,
    getUnreadCount,
    getPinned,
    getQuickList,
    onChange,
    removeListener
};
