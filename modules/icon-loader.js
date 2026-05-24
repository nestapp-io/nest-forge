const fs = require('fs');
const path = require('path');
const { nativeImage } = require('electron');

function loadAppIcon(appName) {
    // 1) Runtime path (OCI flow): icon written by nest-build-app-api/ DefaultAsarSafeCustomizer
    //    to <resources>/app.asar.unpacked/config/icon.png
    if (process.resourcesPath) {
        const runtimePath = path.join(process.resourcesPath, 'app.asar.unpacked', 'config', 'icon.png');
        if (fs.existsSync(runtimePath)) {
            return nativeImage.createFromPath(runtimePath);
        }
    }
    // 2) Legacy multi-app dev path (nest-forge dev mode)
    const legacyPath = path.join(__dirname, '../apps', appName, 'assets/icon.png');
    if (fs.existsSync(legacyPath)) {
        return nativeImage.createFromPath(legacyPath);
    }
    // 3) Default fallback
    return nativeImage.createFromPath(path.join(__dirname, '../default-icon.png'));
}

module.exports = { loadAppIcon };
