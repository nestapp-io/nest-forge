const fs = require('fs');
const path = require('path');

const TEMPLATE_PATH = path.join(__dirname, '..', 'main.js');

function syncAppEntry(appName) {
    if (!appName) {
        throw new Error('APP_NAME nao definido');
    }

    const outputPath = path.join(__dirname, '..', 'apps', appName, 'src', 'main.js');
    const template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

    const resolved = template
        .replace(/#default-name-app/g, appName)
        .replace(/#default-modules-path/g, '../../..');

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, resolved, 'utf-8');

    console.log(`Entry point gerado: ${outputPath}`);
    return outputPath;
}

if (require.main === module) {
    try {
        syncAppEntry(process.env.APP_NAME);
    } catch (error) {
        console.error(`Erro ao gerar entry point: ${error.message}`);
        process.exit(1);
    }
}

module.exports = syncAppEntry;
