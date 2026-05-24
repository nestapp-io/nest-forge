const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('notificationsAPI', {
    getAll: () => ipcRenderer.invoke('notifications:get-all'),
    markRead: (id) => ipcRenderer.invoke('notifications:mark-read', id),
    togglePin: (id) => ipcRenderer.invoke('notifications:toggle-pin', id),
    toggleSelect: (id) => ipcRenderer.invoke('notifications:toggle-select', id),
    selectAll: () => ipcRenderer.invoke('notifications:select-all'),
    deselectAll: () => ipcRenderer.invoke('notifications:deselect-all'),
    deleteSelected: () => ipcRenderer.invoke('notifications:delete-selected'),
    clearRead: () => ipcRenderer.invoke('notifications:clear-read'),
    clearAll: () => ipcRenderer.invoke('notifications:clear-all'),
    remove: (id) => ipcRenderer.invoke('notifications:remove', id),
    open: (id) => ipcRenderer.invoke('notifications:open', id),
    onUpdated: (callback) => {
        ipcRenderer.on('notifications:updated', (event, list) => callback(list));
    }
});

contextBridge.exposeInMainWorld('i18nAPI', {
    get: () => ipcRenderer.invoke('i18n:get'),
    onChanged: (callback) => {
        ipcRenderer.on('i18n:changed', (_, payload) => callback(payload));
    }
});
