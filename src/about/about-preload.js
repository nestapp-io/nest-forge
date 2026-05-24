const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aboutAPI', {
    getInfo: () => ipcRenderer.invoke('about:get-info'),
    close: () => ipcRenderer.invoke('about:close')
});

contextBridge.exposeInMainWorld('i18nAPI', {
    get: () => ipcRenderer.invoke('i18n:get'),
    onChanged: (callback) => {
        ipcRenderer.on('i18n:changed', (_, payload) => callback(payload));
    }
});
