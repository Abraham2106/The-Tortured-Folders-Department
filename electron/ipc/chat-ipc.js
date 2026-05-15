import { handleChatSend } from '../services/chat-handler.js';

export const register = (ipcMain) => {
  ipcMain.handle('chat:send', async (_, payload) => {
    return handleChatSend(payload);
  });
};
