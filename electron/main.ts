import { app, BrowserWindow, session, shell, nativeTheme, screen, Tray, Menu, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';

const APP_URL = 'https://justdilo-app.vercel.app';
const isDev = process.env.NODE_ENV === 'development';
const BASE_URL = isDev ? 'http://localhost:3000' : APP_URL;

// Persist mic widget bounds across sessions
function getMicBoundsFile() {
  return path.join(app.getPath('userData'), 'mic-widget-bounds.json');
}
function saveMicBounds(bounds: Electron.Rectangle) {
  try { fs.writeFileSync(getMicBoundsFile(), JSON.stringify(bounds)); } catch {}
}
function loadMicBounds(): Electron.Rectangle | null {
  try { return JSON.parse(fs.readFileSync(getMicBoundsFile(), 'utf-8')); } catch { return null; }
}

const WIDGET_STYLES = {
  mic:      { label: '🎙 Mic only — resizable',      path: '/widget/mic',   width: 160, height: 160, resizable: true  },
  nano:     { label: '● Nano — floating pill',        path: '/widget/nano',  width: 200, height: 60,  resizable: false },
  mini:     { label: '◼ Mini — compact bar',          path: '/widget/mini',  width: 288, height: 100, resizable: false },
  focus:    { label: '◆ Focus — one task',            path: '/widget/focus', width: 288, height: 172, resizable: false },
  standard: { label: '▣ Standard — mic + tasks',      path: '/widget',       width: 288, height: 380, resizable: false },
  full:     { label: '▦ Full — all tasks',            path: '/widget/full',  width: 288, height: 480, resizable: false },
} as const;

type WidgetStyle = keyof typeof WIDGET_STYLES;

let mainWin: BrowserWindow | null = null;
let widgetWin: BrowserWindow | null = null;
let tray: Tray | null = null;
let currentStyle: WidgetStyle = 'mic';

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
    if (!url.startsWith(APP_URL) && !url.startsWith('http://localhost')) {
      event.preventDefault(); shell.openExternal(url);
    }
  });
  return mainWin;
}

function createWidget(style: WidgetStyle = currentStyle) {
  const cfg = WIDGET_STYLES[style];
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const margin = 16;

  // For mic widget, restore saved bounds or default to bottom-right
  let x = sw - cfg.width - margin;
  let y = sh - cfg.height - margin;
  let w = cfg.width;
  let h = cfg.height;

  if (style === 'mic') {
    const saved = loadMicBounds();
    if (saved) { x = saved.x; y = saved.y; w = saved.width; h = saved.height; }
  }

  widgetWin = new BrowserWindow({
    width: w,
    height: h,
    x,
    y,
    minWidth: style === 'mic' ? 100 : cfg.width,
    minHeight: style === 'mic' ? 100 : cfg.height,
    resizable: cfg.resizable,
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

  // Save position + size when mic widget is moved or resized
  if (style === 'mic') {
    const save = () => { if (widgetWin && !widgetWin.isDestroyed()) saveMicBounds(widgetWin.getBounds()); };
    widgetWin.on('moved', save);
    widgetWin.on('resized', save);
  }

  widgetWin.on('closed', () => { widgetWin = null; });
  currentStyle = style;
  return widgetWin;
}

function switchWidgetStyle(style: WidgetStyle) {
  const cfg = WIDGET_STYLES[style];
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const margin = 16;

  if (widgetWin && !widgetWin.isDestroyed()) {
    widgetWin.close();
  }
  createWidget(style);
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
    {
      label: isVisible ? 'Hide Widget' : 'Show Widget',
      click: () => { isVisible ? widgetWin!.close() : createWidget(); buildTrayMenu(); },
    },
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
  createWidget('mic'); // default to mic widget
  createTray();
  app.on('activate', () => { mainWin ? mainWin.show() : createWindow(); });
});

app.on('window-all-closed', () => { /* keep alive in tray */ });
