import { executeMoves } from '../logic/executor.js';

export const register = (ipcMain, { dialog }) => {
  ipcMain.handle('dialog:open-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });
    if (canceled) {
      return null;
    }

    return filePaths[0];
  });

  ipcMain.handle('fs:execute', async (_, { profileId, diffs }) => {
    return executeMoves(profileId, diffs);
  });
};
