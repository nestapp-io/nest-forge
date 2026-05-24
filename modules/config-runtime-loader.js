const fs = require('fs');
const path = require('path');
const globalStore = require('./global-store');
const logger = require('./logger-manager');
const settingsStore = require('./settings-store');
const legacyLoader = require('./config-loader');

function resolveRuntimeConfigPath() {
    if (!process.resourcesPath) {
        return null;
    }
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'config', 'app.json');
}

function validateConfig(config, sourcePath) {
    if (!config || typeof config !== 'object') {
        throw new Error('Config inválido (não é objeto): ' + sourcePath);
    }
    if (!config.url) {
        throw new Error('Config sem campo obrigatório "url": ' + sourcePath);
    }
    if (!config.id && !config.name) {
        throw new Error('Config precisa de "id" ou "name": ' + sourcePath);
    }
}

function applyConfigSideEffects(config) {
    const appName = config.id || config.name;
    if (!globalStore.get('appName')) {
        globalStore.set('appName', appName);
    }
    const partition = `corebox/${appName}`;
    globalStore.set('appConfig', config);
    globalStore.set('partition', partition);
    settingsStore.loadSettings();
    const logsConfig = settingsStore.get('logs') || {};
    logger.reconfigure({
        enabled: logsConfig.enabled === true,
        level: logsConfig.level || 'info',
        maxFileSizeMB: logsConfig.maxFileSizeMB || 5,
        maxFiles: logsConfig.maxFiles || 5
    });
    logger.createLogger(partition);
}

function loadAppConfig() {
    const runtimePath = resolveRuntimeConfigPath();
    if (runtimePath && fs.existsSync(runtimePath)) {
        const raw = fs.readFileSync(runtimePath, 'utf8');
        const config = JSON.parse(raw);
        validateConfig(config, runtimePath);
        applyConfigSideEffects(config);
        return;
    }
    legacyLoader.loadAppConfig();
}

module.exports = { loadAppConfig };
