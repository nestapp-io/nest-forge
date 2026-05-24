const fs = require('fs');
const path = require('path');

// Obtém os argumentos do CLI
const appName = process.env.APP_NAME || 'default-app';
const outputDir = `dist/${appName}/linux-unpacked`;

// Caminho do ícone fonte
const iconSource = path.resolve(__dirname, `../apps/${appName}/assets/icon.png`);

// Caminho do destino
const iconDest = path.join(outputDir, 'resources', 'icon.png');

// Cria o diretório de destino, se necessário
fs.mkdirSync(path.dirname(iconDest), { recursive: true });

// Copia o arquivo, se existir
if (fs.existsSync(iconSource)) {
  fs.copyFileSync(iconSource, iconDest);
  console.log(`Ícone copiado para: ${iconDest}`);
} else {
  console.error(`Ícone não encontrado: ${iconSource}`);
  process.exit(1);
}
