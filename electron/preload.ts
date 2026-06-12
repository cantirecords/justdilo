import { contextBridge, ipcRenderer } from 'electron';

// Keep in sync with lib/electron-api.ts (the renderer-side type).
contextBridge.exposeInMainWorld('electronAPI', {
  resizeWindow: (w: number, h: number) => ipcRenderer.invoke('widget-resize', w, h),
  switchWidget: (style: string) => ipcRenderer.invoke('widget-switch', style),
  openMain: () => ipcRenderer.invoke('open-main'),
  onRefresh: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('widget-refresh', handler);
    return () => ipcRenderer.removeListener('widget-refresh', handler);
  },
});
