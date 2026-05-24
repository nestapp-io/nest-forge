const fs = require('fs');
const path = require('path');
const extract = require('extract-zip');
const { app } = require('electron');
const globalStore = require('./global-store');
const logger = require('./logger-manager');

async function extractExtension(appName, appConfig, currentSession) {
    if (appConfig?.extensions?.length > 0) {
        for (const extensionName of appConfig.extensions) {
            const extensionZipPath = path.join(__dirname, '../apps', appName, `/assets/${extensionName}.zip`);
            const extensionExtractPath = path.join(app.getPath('userData'), globalStore.get("partition"), `/extension/${extensionName}`);

            if (!fs.existsSync(extensionExtractPath)) {
                try {
                    await extract(extensionZipPath, { dir: extensionExtractPath });
                } catch (err) {
                    logger.error('Erro ao extrair a extensao: {}', err.message);
                }
            }

            try {
                await currentSession.loadExtension(extensionExtractPath);
                logger.info('Extensao {} carregada com sucesso', extensionName);
            } catch (err) {
                logger.error('Erro ao carregar a extensao {}: {}', extensionName, err.message);
            }
        }
    }
}

module.exports = { extractExtension };
