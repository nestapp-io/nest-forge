const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chromeApi', {
    init: () => ipcRenderer.invoke('chrome:init'),
    getMenu: () => ipcRenderer.invoke('menu:get'),
    invokeMenu: (id) => ipcRenderer.invoke('menu:invoke', id),
    popupTopMenu: (topId, x, y) => ipcRenderer.send('menu:popup-top', topId, x, y),
    popupBurgerMenu: (x, y) => ipcRenderer.send('menu:popup-burger', x, y),
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMax: () => ipcRenderer.send('window:toggle-maximize'),
    close: () => ipcRenderer.send('window:close'),
    onMaxState: (cb) => ipcRenderer.on('chrome:max-state', (_, isMax) => cb(isMax)),
    onMenuChanged: (cb) => ipcRenderer.on('chrome:menu-changed', () => cb()),
    onAppName: (cb) => ipcRenderer.on('chrome:set-app-name', (_, name) => cb(name))
});
