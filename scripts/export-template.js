const fs = require('fs');
const path = require('path');

const FORGE_ROOT = path.join(__dirname, '..');
const OVERLAY_DIR = path.join(FORGE_ROOT, 'templates', 'api-overlay');
const DEFAULT_OUT = path.join(FORGE_ROOT, '..', 'api', 'templates', 'electron-base');

const COPY_ROOTS = ['modules', 'shared', 'src', 'locales'];
const COPY_FILES = ['main.js'];

const PATH_REWRITES = [
    { file: 'modules/config-loader.js',
      subs: [
          [/`corebox\/\$\{appName\}`/g, '`CoreBox/${appName}`'],
          [/path\.join\(__dirname, '\.\.\/apps', appName, 'config\.json'\)/g, "path.join(__dirname, '..', 'config.json')"]
      ] },
    { file: 'modules/icon-loader.js',
      subs: [
          [/path\.join\(__dirname, '\.\.\/apps', appName, '\/assets\/icon\.png'\)/g, "path.join(__dirname, '..', 'assets', 'icon.png')"]
      ] },
    { file: 'modules/extension-manager.js',
      subs: [
          [/path\.join\(__dirname, '\.\.\/apps', appName, `\/assets\/\$\{extensionName\}\.zip`\)/g,
           "path.join(__dirname, '..', 'assets', `${extensionName}.zip`)"]
      ] },
    { file: 'modules/notification-store.js',
      subs: [
          [/const dir = process\.env\.NESTAPP_CHILD[\s\S]*?`corebox\/\$\{appName\}`\);/m,
           "const dir = path.join(app.getPath('userData'), `CoreBox/${appName}`);"]
      ] },
    { file: 'modules/settings-store.js',
      subs: [
          [/const dir = process\.env\.NESTAPP_CHILD[\s\S]*?`corebox\/\$\{appName\}`\);/m,
           "const dir = path.join(app.getPath('userData'), `CoreBox/${appName}`);"]
      ] },
    { file: 'modules/app-info.js',
      subs: [
          [/const appPkgPath = path\.join\([^)]+\);\s*/g, ''],
          [/const rootPkg = readJsonSafe\(rootPkgPath\);\s*const appPkg = readJsonSafe\(appPkgPath\);/g,
           "const rootPkg = readJsonSafe(path.join(__dirname, '..', 'package.json'));"],
          [/appPkg\.productName \|\| appPkg\.name/g, 'rootPkg.productName || rootPkg.name'],
          [/appPkg\.version \|\| rootPkg\.version/g, 'rootPkg.version'],
          [/nestAppMeta\.name \|\| rootPkg\.name \|\| 'NestApp'/g, "nestAppMeta.name || 'NestApp'"],
          [/const rootPkgPath = path\.join\([^)]+\);\s*/g, '']
      ] },
    { file: 'main.js',
      subs: [
          [/require\('#default-modules-path\/modules'\)/g, "require('./modules')"],
          [/process\.env\.APP_NAME \|\| '#default-name-app'/g, '"{{APP_NAME}}"'],
          [/path\.join\(__dirname, '#default-modules-path', 'shared\/preload\.js'\)/g,
           "path.join(__dirname, 'shared/preload.js')"]
      ] }
];

const MAIN_APP_SET_NAME_INJECTION = {
    anchor: /^const gotTheLock = app\.requestSingleInstanceLock\(\);$/m,
    insertBefore: "app.setName('{{APP_NAME}}');\n"
};

function rmrf(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        const stat = fs.lstatSync(full);
        if (stat.isDirectory()) {
            rmrf(full);
            fs.rmdirSync(full);
        } else {
            fs.unlinkSync(full);
        }
    }
}

function copyRecursive(src, dest) {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        for (const entry of fs.readdirSync(src)) {
            copyRecursive(path.join(src, entry), path.join(dest, entry));
        }
    } else {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
    }
}

function applySubs(filePath, relPath) {
    const rule = PATH_REWRITES.find(r => r.file === relPath);
    if (!rule) return;

    let content = fs.readFileSync(filePath, 'utf-8');
    for (const [re, rep] of rule.subs) {
        content = content.replace(re, rep);
    }
    fs.writeFileSync(filePath, content, 'utf-8');
}

function injectMainAppSetName(mainPath) {
    let content = fs.readFileSync(mainPath, 'utf-8');
    if (content.includes("app.setName('{{APP_NAME}}')")) return;
    if (!MAIN_APP_SET_NAME_INJECTION.anchor.test(content)) {
        throw new Error('main.js: âncora para app.setName não encontrada');
    }
    content = content.replace(
        MAIN_APP_SET_NAME_INJECTION.anchor,
        MAIN_APP_SET_NAME_INJECTION.insertBefore + '$&'
    );
    fs.writeFileSync(mainPath, content, 'utf-8');
}

function walkFiles(dir, onFile) {
    for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) walkFiles(full, onFile);
        else onFile(full);
    }
}

function renameTemplateFiles(outDir) {
    const pkgTemplate = path.join(outDir, 'package.template.json');
    const pkgFinal = path.join(outDir, 'package.json');
    if (fs.existsSync(pkgTemplate)) {
        if (fs.existsSync(pkgFinal)) fs.unlinkSync(pkgFinal);
        fs.renameSync(pkgTemplate, pkgFinal);
    }
    const builderTemplate = path.join(outDir, 'electron-builder-config.template.json');
    const builderFinal = path.join(outDir, 'electron-builder-config.json');
    if (fs.existsSync(builderTemplate)) {
        if (fs.existsSync(builderFinal)) fs.unlinkSync(builderFinal);
        fs.renameSync(builderTemplate, builderFinal);
    }
}

function parseArgs(argv) {
    const out = { outDir: DEFAULT_OUT, check: false };
    for (let i = 2; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--out' && argv[i + 1]) {
            out.outDir = path.resolve(argv[i + 1]);
            i += 1;
        } else if (arg === '--check') {
            out.check = true;
        }
    }
    return out;
}

function exportTemplate({ outDir }) {
    const stagingDir = outDir + '.staging';
    rmrf(stagingDir);
    fs.mkdirSync(stagingDir, { recursive: true });

    for (const root of COPY_ROOTS) {
        const src = path.join(FORGE_ROOT, root);
        if (!fs.existsSync(src)) continue;
        copyRecursive(src, path.join(stagingDir, root));
    }

    for (const file of COPY_FILES) {
        copyRecursive(path.join(FORGE_ROOT, file), path.join(stagingDir, file));
    }

    copyRecursive(OVERLAY_DIR, stagingDir);
    renameTemplateFiles(stagingDir);

    walkFiles(stagingDir, (f) => {
        const rel = path.relative(stagingDir, f).replace(/\\/g, '/');
        if (!rel.endsWith('.js')) return;
        applySubs(f, rel);
    });

    const mainPath = path.join(stagingDir, 'main.js');
    if (fs.existsSync(mainPath)) injectMainAppSetName(mainPath);

    rmrf(outDir);
    fs.mkdirSync(path.dirname(outDir), { recursive: true });
    fs.renameSync(stagingDir, outDir);
}

function checkTemplate({ outDir }) {
    const tmpDir = path.join(FORGE_ROOT, '.export-check-tmp');
    rmrf(tmpDir);
    try {
        exportTemplate({ outDir: tmpDir });
        const diff = collectDiff(tmpDir, outDir);
        if (diff.length > 0) {
            console.error('Diferenças detectadas entre export e ' + outDir + ':');
            for (const entry of diff) console.error('  ' + entry);
            process.exit(1);
        }
        console.log('check-template: OK (' + outDir + ' em sync com nest-forge)');
    } finally {
        rmrf(tmpDir);
    }
}

function collectDiff(a, b) {
    const diffs = [];
    function walk(relPath) {
        const aFull = path.join(a, relPath);
        const bFull = path.join(b, relPath);
        const aExists = fs.existsSync(aFull);
        const bExists = fs.existsSync(bFull);
        if (!aExists && bExists) { diffs.push('extra em ' + b + ': ' + relPath); return; }
        if (aExists && !bExists) { diffs.push('faltando em ' + b + ': ' + relPath); return; }
        const aStat = fs.statSync(aFull);
        const bStat = fs.statSync(bFull);
        if (aStat.isDirectory() !== bStat.isDirectory()) { diffs.push('tipo difere: ' + relPath); return; }
        if (aStat.isDirectory()) {
            const names = new Set([...fs.readdirSync(aFull), ...fs.readdirSync(bFull)]);
            for (const n of names) walk(path.join(relPath, n));
            return;
        }
        const aBuf = fs.readFileSync(aFull);
        const bBuf = fs.readFileSync(bFull);
        if (!aBuf.equals(bBuf)) diffs.push('conteúdo difere: ' + relPath);
    }
    walk('.');
    return diffs;
}

if (require.main === module) {
    const args = parseArgs(process.argv);
    if (args.check) {
        checkTemplate(args);
    } else {
        exportTemplate(args);
        console.log('Template exportado para: ' + args.outDir);
    }
}

module.exports = { exportTemplate, checkTemplate };
