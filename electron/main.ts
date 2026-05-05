import { app, BrowserWindow, session, shell, nativeTheme, screen, Tray, Menu, nativeImage } from 'electron';
import path from 'path';

const APP_URL = 'https://justdilo-app.vercel.app';
const isDev = process.env.NODE_ENV === 'development';
const BASE_URL = isDev ? 'http://localhost:3000' : APP_URL;

const WIDGET_STYLES = {
  nano:     { label: '● Nano    — floating pill',  path: '/widget/nano',  width: 200, height: 60  },
  mini:     { label: '◼ Mini    — compact bar',    path: '/widget/mini',  width: 288, height: 100 },
  focus:    { label: '◆ Focus   — one task',       path: '/widget/focus', width: 288, height: 172 },
  standard: { label: '▣ Standard — mic + tasks',  path: '/widget',       width: 288, height: 380 },
  full:     { label: '▦ Full    — all tasks',      path: '/widget/full',  width: 288, height: 480 },
} as const;

type WidgetStyle = keyof typeof WIDGET_STYLES;

let mainWin: BrowserWindow | null = null;
let widgetWin: BrowserWindow | null = null;
let tray: Tray | null = null;
let currentStyle: WidgetStyle = 'standard';

function setupPermissions() {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(['media', 'notifications', 'microphone', 'geolocation'].includes(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return ['media', 'notifications', 'microphone', 'geolocation'].includes(permission);
  });
}

function createWindow() {
  nativeTheme.themeSource = 'dark';
  mainWin = new BrowserWindow({
    width: 1280, height: 800, minWidth: 375, minHeight: 600,
    title: 'JustDilo',
    icon: path.join(__dirname, '../build/icons/icon.png'),
    backgroundColor: '#0a0a0a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  mainWin.loadURL(BASE_URL);
  mainWin.once('ready-to-show', () => mainWin!.show());
  mainWin.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  mainWin.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_URL) && !url.startsWith('http://localhost')) { event.preventDefault(); shell.openExternal(url); }
  });
  return mainWin;
}

function createWidget(style: WidgetStyle = currentStyle) {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const cfg = WIDGET_STYLES[style];
  const margin = 12;

  widgetWin = new BrowserWindow({
    width: cfg.width,
    height: cfg.height,
    x: sw - cfg.width - margin,
    y: sh - cfg.height - margin,
    resizable: false,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    hasShadow: false,
    skipTaskbar: true,
    title: 'JustDilo Widget',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });

  widgetWin.loadURL(BASE_URL + cfg.path);
  widgetWin.on('closed', () => { widgetWin = null; });
  currentStyle = style;
  return widgetWin;
}

function switchWidgetStyle(style: WidgetStyle) {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const cfg = WIDGET_STYLES[style];
  const margin = 12;

  if (widgetWin && !widgetWin.isDestroyed()) {
    widgetWin.setContentSize(cfg.width, cfg.height);
    widgetWin.setPosition(sw - cfg.width - margin, sh - cfg.height - margin);
    widgetWin.loadURL(BASE_URL + cfg.path);
    currentStyle = style;
  } else {
    createWidget(style);
  }
  buildTrayMenu();
}

function buildTrayMenu() {
  const isVisible = widgetWin && !widgetWin.isDestroyed();

  const styleItems = (Object.keys(WIDGET_STYLES) as WidgetStyle[]).map(key => ({
    label: WIDGET_STYLES[key].label,
    type: 'radio' as const,
    checked: currentStyle === key && !!isVisible,
    click: () => switchWidgetStyle(key),
  }));

  const menu = Menu.buildFromTemplate([
    { label: 'Open JustDilo', click: () => { mainWin ? mainWin.show() : createWindow(); } },
    { type: 'separator' },
    { label: 'Widget Style', enabled: false },
    ...styleItems,
    { type: 'separator' },
    { label: isVisible ? 'Hide Widget' : 'Show Widget', click: () => { isVisible ? widgetWin!.close() : createWidget(); buildTrayMenu(); } },
    { type: 'separator' },
    { label: 'Quit JustDilo', click: () => app.quit() },
  ]);

  tray!.setContextMenu(menu);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '../build/icons/icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('JustDilo');
  buildTrayMenu();
  tray.on('click', () => { mainWin ? mainWin.show() : createWindow(); });
}

app.whenReady().then(() => {
  setupPermissions();
  createWindow();
  createWidget();
  createTray();
  app.on('activate', () => { mainWin ? mainWin.show() : createWindow(); });
});

app.on('window-all-closed', () => { /* keep alive in tray */ });
