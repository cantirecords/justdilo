import { app, BrowserWindow, session, shell, nativeTheme, screen, Tray, Menu, nativeImage, ipcMain, globalShortcut, powerMonitor } from 'electron';
import path from 'path';
import fs from 'fs';

const APP_URL = 'https://justdilo-app.vercel.app';
const isDev = process.env.NODE_ENV === 'development';
const BASE_URL = isDev ? 'http://localhost:3000' : APP_URL;

const WIDGET_STYLES: Record<string, { label: string; path: string; width: number; height: number; resizable: boolean }> = {
  mic:      { label: '🎙 Mic only — resizable',  path: '/widget/mic',   width: 160, height: 160, resizable: true  },
  nano:     { label: '● Nano — floating pill',    path: '/widget/nano',  width: 200, height: 60,  resizable: false },
  mini:     { label: '◼ Mini — compact bar',      path: '/widget/mini',  width: 288, height: 100, resizable: false },
  focus:    { label: '◆ Focus — one task',        path: '/widget/focus', width: 288, height: 172, resizable: false },
  standard: { label: '▣ Standard — mic + tasks',  path: '/widget',       width: 288, height: 380, resizable: false },
  full:     { label: '▦ Full — all tasks',        path: '/widget/full',  width: 300, height: 480, resizable: false },
};

type WidgetStyle = 'mic' | 'nano' | 'mini' | 'focus' | 'standard' | 'full';

const MIC_MAX = { width: 360, height: 480 };
const MIC_MIN = { width: 100, height: 100 };

let mainWin: BrowserWindow | null = null;
let widgetWin: BrowserWindow | null = null;
let tray: Tray | null = null;
// True while we close the widget only to reopen it with another style, so the
// 'closed' handler doesn't treat it as the user hiding the widget.
let switchingStyle = false;

// ── Persisted state ──────────────────────────────────────────────────────────
// One JSON file remembers the widget's style, whether it was visible, and the
// last bounds per style — so the app reopens exactly as you left it.

type WidgetState = {
  style: WidgetStyle;
  visible: boolean;
  bounds: Partial<Record<WidgetStyle, Electron.Rectangle>>;
};

function stateFile(name: string) {
  return path.join(app.getPath('userData'), name);
}

function readJSON<T>(file: string): T | null {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) as T; } catch { return null; }
}

function writeJSON(file: string, data: unknown) {
  try { fs.writeFileSync(file, JSON.stringify(data)); } catch {}
}

let widgetState: WidgetState = { style: 'mic', visible: true, bounds: {} };

function loadWidgetState() {
  const saved = readJSON<Partial<WidgetState>>(stateFile('widget-state.json'));
  if (saved) {
    if (saved.style && WIDGET_STYLES[saved.style]) widgetState.style = saved.style as WidgetStyle;
    if (typeof saved.visible === 'boolean') widgetState.visible = saved.visible;
    if (saved.bounds && typeof saved.bounds === 'object') widgetState.bounds = saved.bounds;
  } else {
    // Migrate the pre-state-file mic bounds, if any.
    const legacy = readJSON<Electron.Rectangle>(stateFile('mic-widget-bounds.json'));
    if (legacy) widgetState.bounds.mic = legacy;
  }
}

function saveWidgetState() {
  writeJSON(stateFile('widget-state.json'), widgetState);
}

// Keep a window reachable: clamp its bounds into the work area of whichever
// display it's nearest to. Handles monitors that were unplugged since the
// bounds were saved — previously the widget could restore fully off-screen
// with no way to grab it.
function clampToDisplay(b: Electron.Rectangle): Electron.Rectangle {
  const wa = screen.getDisplayMatching(b).workArea;
  const width  = Math.min(b.width,  wa.width);
  const height = Math.min(b.height, wa.height);
  const x = Math.min(Math.max(b.x, wa.x), wa.x + wa.width  - width);
  const y = Math.min(Math.max(b.y, wa.y), wa.y + wa.height - height);
  return { x, y, width, height };
}

// ── Main window ──────────────────────────────────────────────────────────────

function loadMainBounds(): Electron.Rectangle | null {
  const b = readJSON<Electron.Rectangle>(stateFile('main-window-bounds.json'));
  if (!b) return null;
  b.width  = Math.min(Math.max(b.width,  375), 1600);
  b.height = Math.min(Math.max(b.height, 600), 1200);
  return clampToDisplay(b);
}

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

  const saved = loadMainBounds();

  mainWin = new BrowserWindow({
    width:  saved?.width  ?? 460,
    height: saved?.height ?? 820,
    x: saved?.x,
    y: saved?.y,
    minWidth: 375, minHeight: 600,
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

  const saveBounds = () => {
    if (mainWin && !mainWin.isDestroyed()) writeJSON(stateFile('main-window-bounds.json'), mainWin.getBounds());
  };
  mainWin.on('moved',   saveBounds);
  mainWin.on('resized', saveBounds);
  mainWin.on('closed',  () => { mainWin = null; });

  mainWin.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  mainWin.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_URL) && !url.startsWith('http://localhost')) {
      event.preventDefault(); shell.openExternal(url);
    }
  });
  return mainWin;
}

function showMain() {
  if (mainWin && !mainWin.isDestroyed()) { mainWin.show(); mainWin.focus(); }
  else createWindow();
}

// ── Widget window ────────────────────────────────────────────────────────────

function createWidget(style: WidgetStyle = widgetState.style) {
  const cfg = WIDGET_STYLES[style];

  // Restore this style's last position; default to bottom-right of the
  // primary display. Only the mic widget keeps a custom size.
  const wa = screen.getPrimaryDisplay().workArea;
  const margin = 16;
  let bounds: Electron.Rectangle = {
    x: wa.x + wa.width  - cfg.width  - margin,
    y: wa.y + wa.height - cfg.height - margin,
    width: cfg.width,
    height: cfg.height,
  };
  const saved = widgetState.bounds[style];
  if (saved) {
    bounds = clampToDisplay({
      x: saved.x,
      y: saved.y,
      width:  style === 'mic' ? Math.min(Math.max(saved.width,  MIC_MIN.width),  MIC_MAX.width)  : cfg.width,
      height: style === 'mic' ? Math.min(Math.max(saved.height, MIC_MIN.height), MIC_MAX.height) : cfg.height,
    });
  }

  widgetWin = new BrowserWindow({
    ...bounds,
    minWidth:  style === 'mic' ? MIC_MIN.width  : cfg.width,
    minHeight: style === 'mic' ? MIC_MIN.height : cfg.height,
    maxWidth:  style === 'mic' ? MIC_MAX.width  : undefined,
    maxHeight: style === 'mic' ? MIC_MAX.height : undefined,
    resizable: cfg.resizable,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    hasShadow: false,
    skipTaskbar: true,
    fullscreenable: false,
    title: 'JustDilo Widget',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      // The widget must keep ticking (clock + data refresh) while unfocused.
      backgroundThrottling: false,
    },
  });

  // Follow the user across Spaces and over fullscreen apps — a desk widget
  // that stays on one desktop isn't a widget.
  widgetWin.setAlwaysOnTop(true, 'floating');
  widgetWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  widgetWin.loadURL(BASE_URL + cfg.path);

  const save = () => {
    if (!widgetWin || widgetWin.isDestroyed()) return;
    widgetState.bounds[style] = widgetWin.getBounds();
    saveWidgetState();
  };
  widgetWin.on('moved', save);
  widgetWin.on('resized', save);

  widgetWin.on('closed', () => {
    widgetWin = null;
    if (!switchingStyle) {
      widgetState.visible = false;
      saveWidgetState();
      buildTrayMenu();
    }
  });

  widgetState.style = style;
  widgetState.visible = true;
  saveWidgetState();
  return widgetWin;
}

function switchWidgetStyle(style: WidgetStyle) {
  if (widgetWin && !widgetWin.isDestroyed()) {
    switchingStyle = true;
    widgetWin.once('closed', () => {
      switchingStyle = false;
      createWidget(style);
      buildTrayMenu();
    });
    widgetWin.close();
  } else {
    createWidget(style);
    buildTrayMenu();
  }
}

function toggleWidget() {
  if (widgetWin && !widgetWin.isDestroyed()) {
    widgetWin.close(); // 'closed' handler persists visible=false + rebuilds tray
  } else {
    createWidget();
    buildTrayMenu();
  }
}

// ── Tray ─────────────────────────────────────────────────────────────────────

function buildTrayMenu() {
  if (!tray) return;
  const isVisible = !!widgetWin && !widgetWin.isDestroyed();

  const styleItems = (Object.keys(WIDGET_STYLES) as WidgetStyle[]).map(key => ({
    label: WIDGET_STYLES[key].label,
    type: 'radio' as const,
    checked: widgetState.style === key,
    click: () => switchWidgetStyle(key),
  }));

  const menu = Menu.buildFromTemplate([
    { label: 'Open JustDilo', click: () => showMain() },
    { type: 'separator' },
    { label: 'Widget Style', enabled: false },
    ...styleItems,
    { type: 'separator' },
    {
      label: isVisible ? 'Hide Widget' : 'Show Widget',
      accelerator: 'CommandOrControl+Shift+D',
      click: () => toggleWidget(),
    },
    { type: 'separator' },
    { label: 'Quit JustDilo', click: () => app.quit() },
  ]);

  tray.setContextMenu(menu);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '../build/icons/icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('JustDilo');
  buildTrayMenu();
  tray.on('click', () => showMain());
}

// ── IPC ──────────────────────────────────────────────────────────────────────

ipcMain.handle('widget-resize', (event, w: number, h: number) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed() && win === widgetWin) {
    const capped = { w: Math.min(Math.max(w, 100), 480), h: Math.min(Math.max(h, 100), 600) };
    win.setSize(capped.w, capped.h);
    widgetState.bounds[widgetState.style] = win.getBounds();
    saveWidgetState();
  }
});

ipcMain.handle('widget-switch', (_event, style: string) => {
  if (Object.keys(WIDGET_STYLES).includes(style)) switchWidgetStyle(style as WidgetStyle);
});

ipcMain.handle('open-main', () => showMain());

// Tell every window to refetch — fired after sleep/lock, when realtime
// sockets are typically dead and the widget would otherwise show stale tasks.
function broadcastRefresh() {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('widget-refresh');
  }
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showMain());

  app.whenReady().then(async () => {
    // Clear HTTP cache so every launch fetches the latest deploy from the server
    if (!isDev) await session.defaultSession.clearCache();
    loadWidgetState();
    setupPermissions();
    createWindow();
    if (widgetState.visible) createWidget();
    createTray();

    globalShortcut.register('CommandOrControl+Shift+D', toggleWidget);

    powerMonitor.on('resume', broadcastRefresh);
    powerMonitor.on('unlock-screen', broadcastRefresh);

    app.on('activate', () => showMain());
  });
}

app.on('will-quit', () => globalShortcut.unregisterAll());

app.on('window-all-closed', () => { /* keep alive in tray */ });
