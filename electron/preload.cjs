const { contextBridge, ipcRenderer } = require('electron');

console.log('Preload script (CJS) loading...');

contextBridge.exposeInMainWorld('api', {
  profiles: {
    list: () => ipcRenderer.invoke('profiles:list'),
    create: (data) => ipcRenderer.invoke('profiles:create', data),
    get: (id) => ipcRenderer.invoke('profiles:get', id),
    delete: (id) => ipcRenderer.invoke('profiles:delete', id)
  },
  chat: {
    send: (message, history, targetDir) => ipcRenderer.invoke('chat:send', { message, history, targetDir })
  },
  fs: {
    execute: (profileId, diffs) => ipcRenderer.invoke('fs:execute', { profileId, diffs })
  },
  dialog: {
    openFolder: () => ipcRenderer.invoke('dialog:open-folder')
  },
  transactions: {
    list: (profileId) => ipcRenderer.invoke('transactions:list', profileId),
    rollback: (id) => ipcRenderer.invoke('transactions:rollback', id)
  },
  intake: {
    addWatchFolder: (profileId, path, label) => ipcRenderer.invoke('intake:add-watch-folder', { profileId, path, label }),
    listWatchFolders: (profileId) => ipcRenderer.invoke('intake:list-watch-folders', profileId),
    setTruthSource: (profileId, path) => ipcRenderer.invoke('intake:set-truth-source', { profileId, path }),
    getTruthSource: (profileId) => ipcRenderer.invoke('intake:get-truth-source', profileId),
    startWatcher: (profileId) => ipcRenderer.invoke('intake:start-watcher', profileId),
    onStatus: (callback) => {
      const listener = (_, data) => callback(data);
      ipcRenderer.on('intake:status', listener);
      return () => ipcRenderer.removeListener('intake:status', listener);
    }
  }
});
