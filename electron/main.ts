import { app, BrowserWindow, session, shell, nativeTheme } from 'electron';
import path from 'path';

const APP_URL = 'https://justdilo-app.vercel.app';
const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  nativeTheme.themeSource = 'dark';

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 375,
    minHeight: 600,
    title: 'JustDilo',
    icon: path.join(__dirname, '../build/icons/icon.png'),
    backgroundColor: '#0a0a0a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Grant microphone + notification permissions from the app origin
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'notifications', 'microphone', 'geolocation'];
    callback(allowed.includes(permission));
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    const allowed = ['media', 'notifications', 'microphone', 'geolocation'];
    return allowed.includes(permission);
  });

  win.loadURL(isDev ? 'http://localhost:3000' : APP_URL);

  win.once('ready-to-show', () => win.show());

  // Open links with target="_blank" in the system browser, not a new Electron window
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Catch any navigation away from the app domain and open in browser
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_URL) && !url.startsWith('http://localhost') && !url.startsWith('https://justdilo-app')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  return win;
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
