import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('otpeerTray', {
    openApp: () => ipcRenderer.invoke('tray-popup:openApp'),
    unlock: () => ipcRenderer.invoke('tray-popup:unlock'),
    lockVault: () => ipcRenderer.invoke('tray-popup:lockVault'),
    about: () => ipcRenderer.invoke('tray-popup:about'),
    quit: () => ipcRenderer.invoke('tray-popup:quit'),
    close: () => ipcRenderer.invoke('tray-popup:close'),
    copyLastUsed: () => ipcRenderer.invoke('tray-popup:copyLastUsed'),
});
