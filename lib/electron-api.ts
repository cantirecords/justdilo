// Single source of truth for the bridge exposed by electron/preload.ts.
// Widget pages must import from here instead of re-declaring the global,
// so the preload contract only has to change in one place.

export type ElectronAPI = {
  resizeWindow: (w: number, h: number) => Promise<void>;
  switchWidget: (style: string) => Promise<void>;
  openMain: () => Promise<void>;
  onRefresh: (cb: () => void) => () => void;
};

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export function electronAPI(): ElectronAPI | undefined {
  return typeof window === "undefined" ? undefined : window.electronAPI;
}

// Open the main app: focuses the Electron main window, or — when the widget
// runs as a browser popup, or inside an older installed binary whose preload
// predates openMain — falls back to a regular tab.
export function openMainApp() {
  const api = electronAPI();
  if (api?.openMain) api.openMain();
  else window.open("/", "_blank");
}
