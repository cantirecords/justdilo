import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  resizeWindow: (w: number, h: number) => ipcRenderer.invoke('widget-resize', w, h),
  switchWidget: (style: string) => ipcRenderer.invoke('widget-switch', style),
});
