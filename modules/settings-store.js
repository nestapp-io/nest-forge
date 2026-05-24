const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const globalStore = require('./global-store');
const logger = require('./logger-manager');

const DEFAULTS = {
    language: null,
    keepActive: false,
    keepActiveIntervalSeconds: 240,
    logs: {
        enabled: false,
        level: 'info',
        maxFileSizeMB: 5,
        maxFiles: 5,
        scopes: {
            general: false,
            keepActive: false,
            notifications: false
        }
    },
    proxy: {
        type: 'system',
        host: '',
        port: ''
    },
    notifications: {
        enabled: true,
        maxQuickMenu: 10,
        maxStored: 50
    }
};

let settings = null;
let settingsFilePath = null;

function getFilePath() {
    if (!settingsFilePath) {
        const appName = globalStore.get('appName') || 'default';
        const dir = process.env.NESTAPP_CHILD
            ? app.getPath('userData')
            : path.join(app.getPath('userData'), `corebox/${appName}`);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        settingsFilePath = path.join(dir, 'settings.json');
    }
    return settingsFilePath;
}

function deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = deepMerge(result[key] || {}, source[key]);
        } else {
            result[key] = source[key];
        }
    }
    return result;
}

function loadSettings() {
    try {
        const filePath = getFilePath();
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            settings = deepMerge(DEFAULTS, data);
        } else {
            settings = { ...DEFAULTS };
            saveSettings();
        }
    } catch (err) {
        logger.error('Erro ao carregar settings: {}', err.message);
        settings = { ...DEFAULTS };
    }
}

function saveSettings() {
    try {
        const filePath = getFilePath();
        fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8');
    } catch (err) {
        logger.error('Erro ao salvar settings: {}', err.message);
    }
}

function getSettings() {
    if (!settings) loadSettings();
    return settings;
}

function get(key) {
    if (!settings) loadSettings();
    const keys = key.split('.');
    let value = settings;
    for (const k of keys) {
        if (value === undefined || value === null) return undefined;
        value = value[k];
    }
    return value;
}

function set(key, value) {
    if (!settings) loadSettings();
    const keys = key.split('.');
    let obj = settings;
    for (let i = 0; i < keys.length - 1; i++) {
        if (!obj[keys[i]] || typeof obj[keys[i]] !== 'object') {
            obj[keys[i]] = {};
        }
        obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    saveSettings();
}

function updateAll(newSettings) {
    settings = deepMerge(DEFAULTS, newSettings);
    saveSettings();
}

module.exports = { loadSettings, saveSettings, getSettings, get, set, updateAll };
