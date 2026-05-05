import { app, BrowserWindow, session, shell, nativeTheme, screen, Tray, Menu, nativeImage } from 'electron';
import path from 'path';

const APP_URL = 'https://justdilo-app.vercel.app';
const isDev = process.env.NODE_ENV === 'development';
const BASE_URL = isDev ? 'http://localhost:3000' : APP_URL;

let mainWin: BrowserWindow | null = null;
let widgetWin: BrowserWindow | null = null;
let tray: Tray | null = null;

function setupPermissions() {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowed = ['media', 'notifications', 'microphone', 'geolocation'];
    callback(allowed.includes(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    const allowed = ['media', 'notifications', 'microphone', 'geolocation'];
    return allowed.includes(permission);
  });
}

function createWindow() {
  nativeTheme.themeSource = 'dark';

  mainWin = new BrowserWindow({
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

  mainWin.loadURL(BASE_URL);
  mainWin.once('ready-to-show', () => mainWin!.show());

  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWin.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_URL) && !url.startsWith('http://localhost')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  return mainWin;
}

function createWidget() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  widgetWin = new BrowserWindow({
    width: 340,
    height: 520,
    x: width - 356,
    y: height - 536,
    resizable: false,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    hasShadow: true,
    skipTaskbar: true,
    title: 'JustDilo Widget',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  widgetWin.loadURL(`${BASE_URL}/widget`);

  widgetWin.on('closed', () => { widgetWin = null; });

  return widgetWin;
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '../build/icons/icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('JustDilo');

  const updateMenu = () => {
    const isWidgetVisible = widgetWin && !widgetWin.isDestroyed();
    const menu = Menu.buildFromTemplate([
      { label: 'Open JustDilo', click: () => { mainWin ? mainWin.show() : createWindow(); } },
      {
        label: isWidgetVisible ? 'Hide Widget' : 'Show Widget',
        click: () => {
          if (isWidgetVisible) {
            widgetWin!.close();
          } else {
            createWidget();
          }
          updateMenu();
        },
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]);
    tray!.setContextMenu(menu);
  };

  updateMenu();
  tray.on('click', () => { mainWin ? mainWin.show() : createWindow(); });
}

app.whenReady().then(() => {
  setupPermissions();
  createWindow();
  createWidget();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWin?.show();
  });
});

app.on('window-all-closed', () => {
  // Keep app running in tray on all platforms
});
