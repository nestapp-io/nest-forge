const fs = require('fs');
const path = require('path');
const globalStore = require('./global-store');

let cachedInfo = null;

function readJsonSafe(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (err) {
        return {};
    }
}

function getAppInfo() {
    if (cachedInfo) return cachedInfo;

    const appName = globalStore.get('appName') || 'unknown';
    const appConfig = globalStore.get('appConfig') || {};

    const rootPkgPath = path.join(__dirname, '..', 'package.json');
    const appPkgPath = path.join(__dirname, '..', 'apps', appName, 'package.json');

    const rootPkg = readJsonSafe(rootPkgPath);
    const appPkg = readJsonSafe(appPkgPath);

    const nestAppMeta = rootPkg.nestApp || {};

    cachedInfo = {
        appName: appConfig.name || appPkg.productName || appPkg.name || appName,
        appVersion: appPkg.version || rootPkg.version || '0.0.0',
        nestAppName: nestAppMeta.name || rootPkg.name || 'NestApp',
        nestAppVersion: nestAppMeta.version || rootPkg.version || '0.0.0',
        author: typeof rootPkg.author === 'object'
            ? `${rootPkg.author.name || ''}${rootPkg.author.email ? ' <' + rootPkg.author.email + '>' : ''}`
            : (rootPkg.author || ''),
        license: rootPkg.license || '',
        electron: process.versions.electron,
        chromium: process.versions.chrome,
        node: process.versions.node,
        v8: process.versions.v8,
        platform: process.platform,
        arch: process.arch
    };

    return cachedInfo;
}

function resetCache() {
    cachedInfo = null;
}

module.exports = { getAppInfo, resetCache };
