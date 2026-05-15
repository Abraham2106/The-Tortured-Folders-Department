import * as settingsService from '../database/settings.js';

export const register = (ipcMain) => {
  ipcMain.handle('settings:get', async () => {
    return settingsService.getSettings();
  });

  ipcMain.handle('settings:update', async (_, { key, value }) => {
    return settingsService.updateSetting(key, value);
  });

  ipcMain.handle('logs:get', async (_, limit) => {
    return settingsService.getErrorLogs(limit);
  });
};
