const  globalStore  = require('./global-store');
const  logger  = require('./logger-manager');
const { configureTray } = require('../shared/components/tray-config');
const { loadAppIcon } = require('./icon-loader');
const { extractExtension } = require('./extension-manager');
const { openSettingsWindow, registerSettingsIpc, applyProxy } = require('./settings-manager');
const { createMenu, refreshMenu, initMenuListeners } = require('./menu-manager');
const { applyKeepActive, createWindow } = require('./window-manager');
const { loadAppConfig } = require('./config-runtime-loader');
const { createSession, getCurrentSession, getPartitionName, configureSessionSecurity } = require('./session-manager');
const { setupLanguageManager } = require('./language-manager');
const notificationStore = require('./notification-store');
const settingsStore = require('./settings-store');
const { openNotificationWindow, registerNotificationIpc } = require('./notification-window-manager');
const { openAboutWindow, registerAboutIpc } = require('./about-window-manager');
const { getAppInfo } = require('./app-info');
const i18n = require('./i18n-manager');

module.exports = {
    globalStore,
    logger,
    configureTray,
    loadAppIcon,
    extractExtension,
    openSettingsWindow,
    registerSettingsIpc,
    applyProxy,
    createMenu,
    refreshMenu,
    initMenuListeners,
    applyKeepActive,
    createWindow,
    loadAppConfig,
    createSession,
    getCurrentSession,
    getPartitionName,
    configureSessionSecurity,
    setupLanguageManager,
    notificationStore,
    settingsStore,
    openNotificationWindow,
    registerNotificationIpc,
    openAboutWindow,
    registerAboutIpc,
    getAppInfo,
    i18n
};
