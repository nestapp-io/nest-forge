const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');

const FORGE_ROOT = path.join(__dirname, '..');
const OVERLAY_TEMPLATE_JSON = path.join(FORGE_ROOT, 'templates', 'api-overlay', 'template.json');
const DIST_DIR = path.join(FORGE_ROOT, 'dist');
const DEFAULT_REGISTRY = 'ghcr.io/nestapp-io';
const DEFAULT_REPOSITORY = 'nestapp-template';
const MEDIA_TYPE = 'application/vnd.nestapp.template.v1.tar+zstd';
const MANIFEST_MEDIA_TYPE = 'application/vnd.nestapp.template-manifest.v1+json';
const UNPACKED_DIR_NAMES = {
    linux: 'linux-unpacked',
    win: 'win-unpacked',
    mac: 'mac'
};

function parseArgs(argv) {
    const args = {
        version: null,
        platform: 'linux',
        arch: 'x64',
        registry: process.env.BUILD_TEMPLATE_REGISTRY || DEFAULT_REGISTRY,
        repository: process.env.BUILD_TEMPLATE_REPOSITORY || DEFAULT_REPOSITORY,
        dryRun: false
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--dry-run') args.dryRun = true;
        else if (a.startsWith('--version=')) args.version = a.split('=')[1];
        else if (a.startsWith('--platform=')) args.platform = a.split('=')[1];
        else if (a.startsWith('--arch=')) args.arch = a.split('=')[1];
        else if (a.startsWith('--registry=')) args.registry = a.split('=')[1];
        else if (a.startsWith('--repository=')) args.repository = a.split('=')[1];
    }
    return args;
}

function readTemplateVersion() {
    const raw = fs.readFileSync(OVERLAY_TEMPLATE_JSON, 'utf8');
    const json = JSON.parse(raw);
    if (!json.version) {
        throw new Error('template.json missing version');
    }
    return { version: json.version, minimumElectronVersion: json.minimumElectronVersion || '30.0.0' };
}

function sha256OfFile(file) {
    const hash = crypto.createHash('sha256');
    hash.update(fs.readFileSync(file));
    return hash.digest('hex');
}

function ensureCleanDist() {
    if (fs.existsSync(DIST_DIR)) {
        fs.rmSync(DIST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(DIST_DIR, { recursive: true });
}

function prepareOciMainJs() {
    // OCI template uses the root main.js DIRECTLY (not apps/<name>/src/main.js,
    // which is dev-only multi-app workflow). Resolve placeholders so it works
    // when bundled at the root of the asar.
    const srcMain = path.join(FORGE_ROOT, 'main.js');
    const ociMain = path.join(FORGE_ROOT, 'main.oci.js');
    const content = fs.readFileSync(srcMain, 'utf8');
    const resolved = content
        .replace(/#default-modules-path/g, '.')     // main.js sits at asar root
        .replace(/#default-name-app/g, '');         // app name comes from app.setName() in runtime
    fs.writeFileSync(ociMain, resolved, 'utf8');
    console.log(`Generated OCI main: ${ociMain}`);
    return 'main.oci.js';
}

function writePublishConfig(ociMainRelative) {
    const configPath = path.join(FORGE_ROOT, '.electron-builder-publish.json');
    const cfg = {
        appId: 'io.nestapp.template',
        productName: 'NestApp',
        extraMetadata: { main: ociMainRelative, name: 'nestapp-template' },
        files: [
            'main.oci.js', 'modules/**/*', 'shared/**/*', 'src/**/*',
            'locales/**/*', 'package.json',
            '!apps/**', '!specs/**', '!docs/**', '!scripts/**',
            '!templates/**', '!dist/**', '!.electron-builder*',
            '!CLAUDE.md', '!README.md', '!create-project.py',
            '!**/node_modules/*/{CHANGELOG.md,README.md,README,readme.md,readme}'
        ],
        directories: { output: 'dist' },
        linux: { target: 'dir' },
        win: { target: 'dir' },
        mac: { target: 'dir' }
    };
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8');
    return configPath;
}

function runElectronBuilderDir(platform, arch) {
    const ociMainRelative = prepareOciMainJs();
    const configPath = writePublishConfig(ociMainRelative);
    const flagPlatform = platform === 'win' ? '--win' : platform === 'mac' ? '--mac' : '--linux';
    const flagArch = arch === 'arm64' ? '--arm64' : '--x64';
    console.log(`Running electron-builder --dir ${flagPlatform} ${flagArch} --config ${configPath}...`);
    const result = spawnSync('npx', [
        'electron-builder', '--dir', flagPlatform, flagArch,
        '--config', configPath
    ], {
        cwd: FORGE_ROOT,
        stdio: 'inherit',
        env: process.env
    });
    if (result.status !== 0) {
        throw new Error(`electron-builder exited ${result.status}`);
    }
    const unpackedDir = path.join(FORGE_ROOT, 'dist', UNPACKED_DIR_NAMES[platform]);
    if (!fs.existsSync(unpackedDir)) {
        throw new Error(`unpacked dir not found: ${unpackedDir}`);
    }
    return unpackedDir;
}

function createTarZstArchive(unpackedDir, version, platform, arch) {
    const archiveName = `template-${version}-${platform}-${arch}.tar.zst`;
    const archivePath = path.join(DIST_DIR, archiveName);
    const parentDir = path.dirname(unpackedDir);
    const dirName = path.basename(unpackedDir);
    console.log(`Compressing ${dirName} -> ${archiveName} (zstd -19)...`);
    execFileSync('sh', ['-c',
        `tar -cf - -C "${parentDir}" "${dirName}" | zstd -19 -o "${archivePath}"`
    ], { stdio: 'inherit' });
    return archivePath;
}

function buildOciReference(args, version, suffix) {
    return `${args.registry}/${args.repository}:${version}-${suffix}`;
}

function publishArtifact(archivePath, ociRef, mediaType, dryRun, auth) {
    if (dryRun) {
        console.log(`[dry-run] would publish ${archivePath} -> ${ociRef}`);
        return;
    }
    if (!checkRegctl()) {
        throw new Error('regctl not found in PATH (install: github.com/regclient/regclient/releases — regctl-linux-amd64)');
    }
    console.log(`Publishing ${archivePath} -> ${ociRef}`);
    const env = { ...process.env };
    if (auth) env.REGCLIENT_AUTH = auth;
    const result = spawnSync('regctl', [
        'artifact', 'put',
        '--artifact-type', mediaType,
        '-f', archivePath,
        ociRef
    ], { stdio: 'inherit', env });
    if (result.status !== 0) {
        throw new Error(`regclient artifact put exited ${result.status}`);
    }
}

function checkRegctl() {
    const probe = spawnSync('regctl', ['version'], { stdio: 'ignore' });
    return probe.status === 0;
}

function writeManifest(manifest, version) {
    const manifestPath = path.join(DIST_DIR, `template-manifest-${version}.json`);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    return manifestPath;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const tplInfo = readTemplateVersion();
    const version = args.version || tplInfo.version;

    console.log(`publish-template: version=${version}, platform=${args.platform}, arch=${args.arch}, dryRun=${args.dryRun}`);

    ensureCleanDist();
    const unpackedDir = runElectronBuilderDir(args.platform, args.arch);
    const archivePath = createTarZstArchive(unpackedDir, version, args.platform, args.arch);
    const sha256 = sha256OfFile(archivePath);
    const sizeBytes = fs.statSync(archivePath).size;

    const platformKey = `${args.platform}-${args.arch}`;
    const ociRef = buildOciReference(args, version, platformKey);
    const ociRefManifest = buildOciReference(args, version, 'manifest');

    const manifest = {
        version,
        minimumElectronVersion: tplInfo.minimumElectronVersion,
        publishedAt: new Date().toISOString(),
        platforms: {
            [platformKey]: { ociReference: ociRef, sha256, sizeBytes }
        }
    };
    const manifestPath = writeManifest(manifest, version);

    const auth = process.env.GHCR_PAT
        ? Buffer.from(`maurigre:${process.env.GHCR_PAT}`).toString('base64')
        : '';

    publishArtifact(archivePath, ociRef, MEDIA_TYPE, args.dryRun, auth);
    publishArtifact(manifestPath, ociRefManifest, MANIFEST_MEDIA_TYPE, args.dryRun, auth);

    console.log('---');
    console.log(`Archive:  ${archivePath} (${(sizeBytes / 1024 / 1024).toFixed(1)} MB)`);
    console.log(`SHA-256:  ${sha256}`);
    console.log(`OCI ref:  ${ociRef}`);
    console.log(`Manifest: ${ociRefManifest}`);
    console.log('Done.');
}

if (require.main === module) {
    main().catch(err => {
        console.error(err.message);
        process.exit(1);
    });
}

module.exports = { main, parseArgs, sha256OfFile, buildOciReference };
