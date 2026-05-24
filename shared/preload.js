const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  openExternal: (url) => {
    if (typeof url === 'string' && url.startsWith('http')) {
      ipcRenderer.send('open-external-url', url);
    }
  }
});

window.addEventListener('click', (event) => {
    const anchor = event.target.closest('a');
    if (!anchor || !anchor.href) return;
    if (!anchor.href.startsWith('http')) return;
    if (anchor.target !== '_blank') return;

    event.preventDefault();
    event.stopImmediatePropagation();
    ipcRenderer.send('open-external-url', anchor.href);
}, true);


window.addEventListener('message', (event) => {
    if (event.data && event.data.type === '__nestapp_notification') {
        ipcRenderer.send('notification-received', {
            title: event.data.title,
            body: event.data.body,
            tag: event.data.tag || '',
            url: event.data.url || '',
            timestamp: Date.now()
        });
    }
    if (event.data && event.data.type === '__nestapp_notification_click') {
        ipcRenderer.send('focus-window');
    }
});

