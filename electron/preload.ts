import { contextBridge, ipcRenderer } from "electron";
import type { ReisDesktopBridge } from "./contracts";

const bridge: ReisDesktopBridge = {
  auth: {
    login: (input) => ipcRenderer.invoke("auth:login", input),
    logout: () => ipcRenderer.invoke("auth:logout"),
    session: () => ipcRenderer.invoke("auth:session"),
  },
  api: {
    request: (input) => ipcRenderer.invoke("api:request", input),
    upload: (input) => ipcRenderer.invoke("api:upload", input),
  },
  system: {
    platform: () => ipcRenderer.invoke("system:platform"),
    appVersion: () => ipcRenderer.invoke("system:version"),
    openExternal: (url) => ipcRenderer.invoke("system:open-external", url),
  },
  deepLinks: {
    subscribe: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, path: string) =>
        callback(path);
      ipcRenderer.on("deep-link", listener);
      return () => ipcRenderer.removeListener("deep-link", listener);
    },
  },
};

contextBridge.exposeInMainWorld("reisDesktop", bridge);
