const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const appsDir = path.join(rootDir, 'apps');
const buildAppScript = path.join(__dirname, 'build-app.js');

const apps = fs.readdirSync(appsDir).filter((entry) =>
    fs.statSync(path.join(appsDir, entry)).isDirectory()
);

function loadAppId(appName) {
    const configPath = path.join(appsDir, appName, 'config.json');
    if (!fs.existsSync(configPath)) {
        throw new Error(`Configuracao nao encontrada para ${appName}`);
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (!config.id) {
        throw new Error(`config.json de ${appName} sem campo "id"`);
    }

    return config.id;
}

for (const appName of apps) {
    console.log(`Buildando ${appName}...`);
    try {
        const appId = loadAppId(appName);
        execSync(`cross-env APP_ID=${appId} APP_NAME=${appName} node ${buildAppScript}`, {
            stdio: 'inherit',
            cwd: rootDir
        });
        console.log(`${appName} buildado com sucesso.`);
    } catch (error) {
        console.error(`Falha ao buildar ${appName}: ${error.message}`);
        process.exitCode = 1;
    }
}
