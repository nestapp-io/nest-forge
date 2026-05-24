const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const syncAppEntry = require('./sync-app-entry');

const appName = process.env.APP_NAME || 'default-app';
const appId = process.env.APP_ID || 'com.example.app';

const configFilePath = path.join(__dirname, '../electron-builder-config.json');
const generatedConfigPath = path.join(__dirname, '../.electron-builder-config.generated.json');

const appData = loadAppData(appName);
if (!appData || !appData.version) {
    console.error(`Erro: versão não encontrada em apps/${appName}/package.json`);
    process.exit(1);
}
const version = appData.version;

const rootPkgPath = path.join(__dirname, '..', 'package.json');
const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'));

const config = JSON.parse(fs.readFileSync(configFilePath, 'utf-8'));
config.appId = appId;
config.productName = appName;
config.extraMetadata = {
    ...(config.extraMetadata || {}),
    version,
    nestApp: {
        name: rootPkg.name,
        version: rootPkg.version
    }
};
config.directories.output = `dist/${appName}`;
config.directories.buildResources = `apps/${appName}/assets`;
config.files = [
    "shared/**/*",
    "modules/**/*",
    "src/**/*",
    "locales/**/*",
    `apps/${appName}/src/main.js`,
    `apps/${appName}/assets/**/*`,
    `apps/${appName}/config.json`,
    `apps/${appName}/package.json`,
    "package.json"
];

config.linux = {
    icon: `apps/${appName}/assets/icon.png`,
    target: ["AppImage", "snap"],
    category: "Utility",
    executableName: `${appName}`
};

config.snap = {
    grade: "stable",
    confinement: "strict",
    plugs: [
        "home",
        "network",
        "x11",
        "opengl",
        "desktop",
        "desktop-legacy"
    ],
    artifactName: `${appName}_\${version}_\${arch}.snap`
};

syncAppEntry(appName);

fs.writeFileSync(generatedConfigPath, JSON.stringify(config, null, 2));

execSync(`electron-builder --config ${generatedConfigPath}`, { stdio: 'inherit' });

function loadAppData(appName) {
    const appDir = path.join(process.cwd(), 'apps', appName);

    if (!fs.existsSync(appDir)) {
        console.log(`Erro: O diretório ${appDir} não existe.`);
        return null;
    }

    // Caminho do arquivo package.json
    const packageJsonPath = path.join(appDir, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
        console.log(`Erro: O arquivo package.json não foi encontrado no diretório ${appDir}.`);
        return null;
    }

    // Ler e carregar os dados do package.json
    const appData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    return appData;
}
