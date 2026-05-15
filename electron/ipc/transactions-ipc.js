import * as transactionsService from '../database/transactions.js';
import { performRollback } from '../logic/rollback-engine.js';

export const register = (ipcMain) => {
  ipcMain.handle('transactions:list', async (_, profileId) => {
    return transactionsService.listTransactions(profileId);
  });

  ipcMain.handle('transactions:rollback', async (_, transactionId) => {
    return performRollback(transactionId);
  });
};
