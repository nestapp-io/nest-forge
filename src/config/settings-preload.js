const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsAPI', {
    getSettings: () => ipcRenderer.invoke('settings:get'),
    saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
    getLogsDirectory: () => ipcRenderer.invoke('settings:get-logs-dir'),
    openLogsDirectory: () => ipcRenderer.invoke('settings:open-logs-dir'),
    clearLogs: () => ipcRenderer.invoke('settings:clear-logs')
});

contextBridge.exposeInMainWorld('i18nAPI', {
    get: () => ipcRenderer.invoke('i18n:get'),
    setLanguage: (code) => ipcRenderer.invoke('i18n:set-language', code),
    onChanged: (callback) => {
        ipcRenderer.on('i18n:changed', (_, payload) => callback(payload));
    }
});
