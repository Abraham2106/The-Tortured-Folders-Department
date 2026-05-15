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
    send: (profileId, message, history, targetDir) => ipcRenderer.invoke('chat:send', { profileId, message, history, targetDir })
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
    deleteWatchFolder: (profileId, watchFolderId) => ipcRenderer.invoke('intake:delete-watch-folder', { profileId, watchFolderId }),
    setTruthSource: (profileId, path) => ipcRenderer.invoke('intake:set-truth-source', { profileId, path }),
    getTruthSource: (profileId) => ipcRenderer.invoke('intake:get-truth-source', profileId),
    startWatcher: (profileId) => ipcRenderer.invoke('intake:start-watcher', profileId),
    onStatus: (callback) => {
      const listener = (_, data) => callback(data);
      ipcRenderer.on('intake:status', listener);
      return () => ipcRenderer.removeListener('intake:status', listener);
    }
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (key, value) => ipcRenderer.invoke('settings:update', { key, value })
  },
  logs: {
    get: (limit) => ipcRenderer.invoke('logs:get', limit)
  },
  hitl: {
    listPending: (profileId) => ipcRenderer.invoke('hitl:list-pending', profileId),
    updateProposal: (proposalId, diffs) => ipcRenderer.invoke('hitl:update-proposal', { proposalId, diffs }),
    approve: (proposalId, diffs) => ipcRenderer.invoke('hitl:approve', { proposalId, diffs }),
    reject: (proposalId) => ipcRenderer.invoke('hitl:reject', proposalId),
    onProposal: (callback) => {
      const listener = (_, data) => callback(data);
      ipcRenderer.on('hitl:proposal', listener);
      return () => ipcRenderer.removeListener('hitl:proposal', listener);
    }
  }
});
