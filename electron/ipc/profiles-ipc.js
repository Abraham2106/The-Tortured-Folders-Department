import * as profilesService from '../database/profiles.js';

export const register = (ipcMain) => {
  ipcMain.handle('profiles:list', async () => {
    return profilesService.listProfiles();
  });

  ipcMain.handle('profiles:create', async (_, data) => {
    return profilesService.createProfile(data.name, data.avatarPath, data.themeId);
  });

  ipcMain.handle('profiles:get', async (_, id) => {
    return profilesService.getProfile(id);
  });

  ipcMain.handle('profiles:delete', async (_, id) => {
    return profilesService.deleteProfile(id);
  });
};
