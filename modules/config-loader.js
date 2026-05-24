const fs = require('fs');
const path = require('path');
const globalStore = require('./global-store');
const logger = require('./logger-manager');
const settingsStore = require('./settings-store');

function loadAppConfig() {
    const appName = globalStore.get("appName");
    const partition = `corebox/${appName}`;
    const configPath = path.join(__dirname, '../apps', appName, 'config.json');

    if (fs.existsSync(configPath)) {
        const config = require(configPath);
        if (!config.url) {
            throw new Error(`Configuração incompleta para ${appName}.`);
        }

        globalStore.set('appConfig',config );
        globalStore.set('partition', partition );
        settingsStore.loadSettings();
        const logsConfig = settingsStore.get('logs') || {};
        logger.reconfigure({
            enabled: logsConfig.enabled === true,
            level: logsConfig.level || 'info',
            maxFileSizeMB: logsConfig.maxFileSizeMB || 5,
            maxFiles: logsConfig.maxFiles || 5
        });
        logger.createLogger(partition);

    } else {
        throw new Error(`Configuração não encontrada para ${appName}`);
    }
}

module.exports = { loadAppConfig };