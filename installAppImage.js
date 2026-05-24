const fs = require('fs');
const path = require('path');
const os = require('os');
const process = require('process');
const { execSync } = require('child_process');

// Função para criar o arquivo .desktop
function createDesktopEntry(appData, appCategory = 'Utility') {

    // Diretórios necessários
    const homeDir = os.homedir(); // Acesse o diretório home do usuário
    const appsDir = path.join(homeDir, 'apps',);
    const desktopFileDir = path.join(homeDir, '.local', 'share', 'applications');
    const appName = appData.name;
    const appVersion = appData.version;
    const appDescription = appData.description;
    const productName = appData.productName;
    const appsDirDest = path.join(appsDir, productName).replace(' ', '-');
    const mainPacker = appData.mainPacker;

    // Definir o nome do arquivo .desktop
    const desktopFilePath = path.join(desktopFileDir, `${appName.toLowerCase().replace(' ', '_')}.desktop`);

    // Localizar o AppImage no diretório dist
    const appImagePath = path.join(process.cwd(), 'dist', appName, `${appName}-${appVersion}.AppImage`);

    if (!fs.existsSync(appImagePath)) {
        console.log(`Erro: O arquivo ${appName}-${appVersion}.AppImage não foi encontrado no diretório ${appImagePath}.`);
        return;
    }

    const appIconPath = path.join(process.cwd(), 'apps', appName, 'assets/icon.png');

    if (!fs.existsSync(appIconPath)) {
        console.log(`Erro: O arquivo de icone não foi encontrado no diretório ${appIconPath}.`);
        return;
    }

    // Criar diretório de aplicativos, se não existir
    if (!fs.existsSync(appsDirDest)) {
        fs.mkdirSync(appsDirDest, { recursive: true });
    }

    // Copiar o AppImage para o diretório de aplicativos
    const appImageDest = path.join(appsDirDest, path.basename(appImagePath));
    safeReplaceFile(appImagePath, appImageDest);

    // Copiar o icone para o diretório de aplicativos
    const appIconDest = path.join(appsDirDest, path.basename(appIconPath));
    safeReplaceFile(appIconPath, appIconDest);

    // Tornar o AppImage executável
    fs.chmodSync(appImageDest, 0o755);

    // Criar diretório de arquivos .desktop, se não existir
    if (!fs.existsSync(desktopFileDir)) {
        fs.mkdirSync(desktopFileDir, { recursive: true });
    }

    // Criar conteúdo do arquivo .desktop
    const startupWMClass = appName;

    const desktopEntry = `[Desktop Entry]
Name=${productName}
StartupWMClass=${startupWMClass}
Comment=${appDescription} - ${appVersion}
Path=${appsDirDest}
Exec=${appImageDest} --no-sandbox --class=${startupWMClass} %U
Icon=${appIconDest}
Terminal=false
Type=Application
Categories=${appCategory}
StartupNotify=true
`;

    // Escrever o arquivo .desktop
    fs.writeFileSync(desktopFilePath, desktopEntry);

    // Torna o arquivo .desktop executável
    fs.chmodSync(desktopFilePath, 0o755);

    console.log(`Arquivo .desktop criado em: ${desktopFilePath}`);
    console.log(`AppImage copiado para: ${appImageDest}`);

    // Atualizar banco de dados de atalhos
    execSync(`update-desktop-database ${desktopFileDir}`);
    console.log('Banco de dados de atalhos atualizado.');
}

function safeReplaceFile(src, dest) {
    try {
        fs.rmSync(dest, { force: true });
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }
    fs.copyFileSync(src, dest);
}

// Função para carregar os dados do aplicativo do arquivo package.json
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

// Função principal
function main() {
    const args = process.argv.slice(2); // Argumentos da linha de comando
    const appName = process.env.APP_NAME || args[0]; // Nome do aplicativo

    if (!appName) {
        console.log('Erro: Nome do aplicativo não especificado.');
        return;
    }

    // Carregar dados do aplicativo
    const appData = loadAppData(appName);

    if (appData) {
        // Criar atalho se os dados foram carregados com sucesso
        createDesktopEntry(appData);
    }
}

main();
