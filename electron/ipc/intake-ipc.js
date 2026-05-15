import * as intakeService from '../logic/intake-service.js';
import { getMainWindow } from '../window/window-manager.js';
import { startConfiguredIntakeWorkers, startIntakeWorker } from '../services/intake-handler.js';

export const register = (ipcMain) => {
  ipcMain.handle('intake:add-watch-folder', async (_, { profileId, path, label }) => {
    const result = intakeService.addWatchFolder(profileId, path, label);
    const watchFolders = intakeService.listWatchFolders(profileId);
    startIntakeWorker(profileId, watchFolders, getMainWindow());
    return result;
  });

  ipcMain.handle('intake:list-watch-folders', async (_, profileId) => {
    return intakeService.listWatchFolders(profileId);
  });

  ipcMain.handle('intake:set-truth-source', async (_, { profileId, path }) => {
    const result = await intakeService.setTruthSource(profileId, path);
    const watchFolders = intakeService.listWatchFolders(profileId);
    startIntakeWorker(profileId, watchFolders, getMainWindow());
    return result;
  });

  ipcMain.handle('intake:get-truth-source', async (_, profileId) => {
    return intakeService.getTruthSource(profileId);
  });

  ipcMain.handle('intake:start-watcher', async (_, profileId) => {
    const watchFolders = intakeService.listWatchFolders(profileId);
    startIntakeWorker(profileId, watchFolders, getMainWindow());
    return { success: true };
  });
};

export { startConfiguredIntakeWorkers };
