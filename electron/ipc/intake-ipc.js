import * as intakeService from '../logic/intake-service.js';
import { getMainWindow } from '../window/window-manager.js';
import { startConfiguredIntakeWorkers, startIntakeWorker, stopIntakeWorker } from '../services/intake-handler.js';

const syncProfileIntakeWorker = (profileId) => {
  const watchFolders = intakeService.listWatchFolders(profileId);
  if (!Array.isArray(watchFolders) || watchFolders.length === 0) {
    stopIntakeWorker(profileId);
    return watchFolders;
  }

  startIntakeWorker(profileId, watchFolders, getMainWindow());
  return watchFolders;
};

export const register = (ipcMain) => {
  ipcMain.handle('intake:add-watch-folder', async (_, { profileId, path, label }) => {
    const result = intakeService.addWatchFolder(profileId, path, label);
    syncProfileIntakeWorker(profileId);
    return result;
  });

  ipcMain.handle('intake:list-watch-folders', async (_, profileId) => {
    return intakeService.listWatchFolders(profileId);
  });

  ipcMain.handle('intake:delete-watch-folder', async (_, { profileId, watchFolderId }) => {
    const result = intakeService.deleteWatchFolder(profileId, watchFolderId);
    syncProfileIntakeWorker(profileId);
    return result;
  });

  ipcMain.handle('intake:set-truth-source', async (_, { profileId, path }) => {
    const result = await intakeService.setTruthSource(profileId, path);
    syncProfileIntakeWorker(profileId);
    return result;
  });

  ipcMain.handle('intake:get-truth-source', async (_, profileId) => {
    return intakeService.getTruthSource(profileId);
  });

  ipcMain.handle('intake:start-watcher', async (_, profileId) => {
    syncProfileIntakeWorker(profileId);
    return { success: true };
  });
};

export { startConfiguredIntakeWorkers };
