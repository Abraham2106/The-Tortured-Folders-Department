import { app, ipcMain, dialog } from 'electron';
import { setupDatabase } from './database/connection.js';
import { createTray, createWindow, setIsQuitting, showMainWindow } from './window/window-manager.js';
import { startConfiguredIntakeWorkers } from './ipc/intake-ipc.js';
import * as profilesIpc from './ipc/profiles-ipc.js';
import * as settingsIpc from './ipc/settings-ipc.js';
import * as chatIpc from './ipc/chat-ipc.js';
import * as hitlIpc from './ipc/hitl-ipc.js';
import * as intakeIpc from './ipc/intake-ipc.js';
import * as transactionsIpc from './ipc/transactions-ipc.js';
import * as dialogIpc from './ipc/dialog-ipc.js';

app.whenReady().then(() => {
  setupDatabase();

  profilesIpc.register(ipcMain);
  settingsIpc.register(ipcMain);
  chatIpc.register(ipcMain);
  hitlIpc.register(ipcMain);
  intakeIpc.register(ipcMain);
  transactionsIpc.register(ipcMain);
  dialogIpc.register(ipcMain, { dialog });

  createWindow();
  createTray();
  startConfiguredIntakeWorkers();

  app.on('activate', () => {
    showMainWindow();
  });
});

app.on('before-quit', () => {
  setIsQuitting(true);
});

app.on('window-all-closed', () => {
  // Keep background intake workers alive when all windows are closed.
});
