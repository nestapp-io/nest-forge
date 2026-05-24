const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const logger = require('./logger-manager');
const settingsStore = require('./settings-store');

const FALLBACK = 'en-US';
const LOCALES_DIR = path.join(__dirname, '..', 'locales');

const cache = {};
let currentLanguage = FALLBACK;
let currentStrings = {};
let fallbackStrings = {};
const emitter = new EventEmitter();

function getAvailable() {
    try {
        return fs.readdirSync(LOCALES_DIR)
            .filter(f => f.endsWith('.json'))
            .map(f => {
                const code = f.replace('.json', '');
                const data = loadLocaleFile(code);
                return { code, name: (data && data.language && data.language.name) || code };
            });
    } catch (err) {
        logger.error('Erro ao listar locales: {}', err.message);
        return [{ code: FALLBACK, name: 'English (US)' }];
    }
}

function loadLocaleFile(code) {
    if (cache[code]) return cache[code];
    try {
        const filePath = path.join(LOCALES_DIR, `${code}.json`);
        if (!fs.existsSync(filePath)) return null;
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        cache[code] = data;
        return data;
    } catch (err) {
        logger.error('Erro ao carregar locale {}: {}', code, err.message);
        return null;
    }
}

function detectDefaultLanguage() {
    try {
        const sysLocale = app.getLocale();
        const available = getAvailable().map(l => l.code);
        if (available.includes(sysLocale)) return sysLocale;

        const lang = sysLocale.split('-')[0];
        const match = available.find(code => code.startsWith(lang + '-') || code === lang);
        if (match) return match;
    } catch (err) {
        // ignore
    }
    return FALLBACK;
}

function init() {
    fallbackStrings = loadLocaleFile(FALLBACK) || {};

    let lang = settingsStore.get('language');
    if (!lang) {
        lang = detectDefaultLanguage();
        settingsStore.set('language', lang);
    }
    setLanguage(lang, { silent: true });
}

function setLanguage(code, options = {}) {
    const data = loadLocaleFile(code);
    if (!data) {
        logger.warn('Locale {} nao encontrado, usando fallback {}', code, FALLBACK);
        currentLanguage = FALLBACK;
        currentStrings = fallbackStrings;
    } else {
        currentLanguage = code;
        currentStrings = data;
    }

    if (settingsStore.get('language') !== currentLanguage) {
        settingsStore.set('language', currentLanguage);
    }

    if (!options.silent) {
        emitter.emit('changed', currentLanguage);
    }
}

function getCurrent() {
    return currentLanguage;
}

function getStrings() {
    return currentStrings;
}

function resolveKey(obj, key) {
    const parts = key.split('.');
    let value = obj;
    for (const p of parts) {
        if (value === null || value === undefined) return undefined;
        value = value[p];
    }
    return value;
}

function interpolate(str, params) {
    if (typeof str !== 'string' || !params) return str;
    return str.replace(/\{(\w+)\}/g, (_, key) => {
        return params[key] !== undefined ? String(params[key]) : `{${key}}`;
    });
}

function t(key, params) {
    let value = resolveKey(currentStrings, key);
    if (value === undefined) {
        value = resolveKey(fallbackStrings, key);
    }
    if (value === undefined) return key;
    return interpolate(value, params);
}

function onChange(callback) {
    emitter.on('changed', callback);
}

function removeListener(callback) {
    emitter.off('changed', callback);
}

module.exports = {
    init,
    setLanguage,
    getCurrent,
    getAvailable,
    getStrings,
    t,
    onChange,
    removeListener
};
