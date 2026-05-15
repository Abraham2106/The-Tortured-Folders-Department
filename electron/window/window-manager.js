import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let tray = null;
let isQuitting = false;

export const setIsQuitting = (value) => {
  isQuitting = value === true;
};

export const broadcastToAllWindows = (channel, payload) => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload);
  }
};

export const getMainWindow = () => BrowserWindow.getAllWindows()[0] || null;

const createTrayIcon = () => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="14" fill="#1f2937"/>
      <path d="M18 18h28v8H18zm0 12h28v8H18zm0 12h18v8H18z" fill="#f3f4f6"/>
      <circle cx="46" cy="46" r="6" fill="#10b981"/>
    </svg>
  `.trim();

  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
};

export const showMainWindow = () => {
  let mainWindow = getMainWindow();
  if (!mainWindow) {
    mainWindow = createWindow();
    return mainWindow;
  }

  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  return mainWindow;
};

export const createTray = () => {
  if (tray) return tray;

  tray = new Tray(createTrayIcon());
  tray.setToolTip('The Tortured Folders Department');
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Open',
      click: () => {
        showMainWindow();
      }
    },
    {
      label: 'Quit',
      click: () => {
        setIsQuitting(true);
        app.quit();
      }
    }
  ]));
  tray.on('double-click', () => {
    showMainWindow();
  });

  return tray;
};

export const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    title: 'The Tortured Folders Department',
    webPreferences: {
      preload: path.join(__dirname, '../preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });

  return mainWindow;
};
