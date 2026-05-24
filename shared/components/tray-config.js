const { Tray, Menu, app } = require('electron');
const i18n = require('../../modules/i18n-manager');

/**
 * Configura o icone da tray e seu comportamento
 * @param {BrowserWindow} win - A janela principal da aplicacao
 * @param {string} iconPath - Caminho para o icone da tray
 * @param {string} appName - Nome do aplicativo
 */
function configureTray(win, iconPath, appName) {
    const tray = new Tray(iconPath);

    function buildContextMenu() {
        return Menu.buildFromTemplate([
            { label: i18n.t('tray.toggle'), click: () => toggleWindow(win) },
            { type: 'separator' },
            {
                label: i18n.t('tray.quit'),
                click: () => {
                    app.isQuitting = true;
                    app.quit();
                }
            }
        ]);
    }

    function updateTooltip() {
        const stateKey = win.isVisible() ? 'tray.visible' : 'tray.hidden';
        tray.setToolTip(`${appName} (${i18n.t(stateKey)})`);
    }

    tray.setContextMenu(buildContextMenu());
    updateTooltip();

    tray.on('click', () => {
        if (win.isVisible()) {
            win.hide();
        } else {
            win.show();
        }
    });

    win.on('show', updateTooltip);
    win.on('hide', updateTooltip);

    const onLanguageChanged = () => {
        tray.setContextMenu(buildContextMenu());
        updateTooltip();
    };
    i18n.onChange(onLanguageChanged);

    win.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            win.hide();
        }
    });

    win.on('closed', () => {
        i18n.removeListener(onLanguageChanged);
        tray.destroy();
    });

    return tray;
}

/**
 * Alterna entre mostrar e esconder a janela
 * @param {BrowserWindow} window - Instancia da janela a ser alternada
 */
function toggleWindow(window) {
    if (window.isVisible()) {
        window.hide();
    } else {
        window.show();
    }
}

module.exports = {
    configureTray,
};
