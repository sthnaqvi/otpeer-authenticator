import { contextBridge, ipcRenderer, clipboard } from 'electron';

/**
 * The complete surface the renderer can reach. Nothing else crosses the
 * bridge — no fs, no crypto, no vault password, no raw account secrets.
 */
const api = {
    status: () => ipcRenderer.invoke('vault:status'),
    unlock: (password: string) => ipcRenderer.invoke('vault:unlock', password),
    lock: () => ipcRenderer.invoke('vault:lock'),
    setPassword: (newPassword: string) => ipcRenderer.invoke('vault:setPassword', newPassword),
    biometricStatus: () => ipcRenderer.invoke('biometric:status') as Promise<{
        available: boolean;
        enabled: boolean;
        label: string;
    }>,
    setBiometricUnlock: (enabled: boolean) => ipcRenderer.invoke('biometric:setEnabled', enabled) as Promise<{
        available: boolean;
        enabled: boolean;
        label: string;
    }>,
    unlockWithBiometric: () => ipcRenderer.invoke('biometric:unlock') as Promise<boolean>,
    onLocked: (cb: () => void) => {
        const listener = () => cb();
        ipcRenderer.on('vault:locked', listener);
        return () => ipcRenderer.removeListener('vault:locked', listener);
    },
    listAccounts: () => ipcRenderer.invoke('accounts:list'),
    generateCode: (accountId: string) => ipcRenderer.invoke('accounts:generate', accountId),
    setLastUsedAccount: (accountId: string) => ipcRenderer.invoke('accounts:setLastUsed', accountId),
    addAccount: (input: { name: string; issuer?: string; secret: string }) => ipcRenderer.invoke('accounts:add', input),
    addFromUri: (uri: string) => ipcRenderer.invoke('accounts:addUri', uri),
    removeAccount: (accountId: string) => ipcRenderer.invoke('accounts:remove', accountId),
    renameAccount: (accountId: string, newName: string) => ipcRenderer.invoke('accounts:rename', accountId, newName),
    pickImportFile: () => ipcRenderer.invoke('vault:pickImportFile'),
    importData: (raw: string, filePassword?: string) => ipcRenderer.invoke('vault:import', raw, filePassword),
    detectImport: (raw: string) => ipcRenderer.invoke('vault:detectImport', raw),
    exportVault: (exportPassword: string) => ipcRenderer.invoke('vault:export', exportPassword),
    copyToClipboard: (text: string) => clipboard.writeText(text),
    copyOtp: (code: string) => ipcRenderer.invoke('clipboard:copyOtp', code),

    startSyncHost: () => ipcRenderer.invoke('sync:host'),
    joinSync: (target: string, code?: string) => ipcRenderer.invoke('sync:join', target, code),
    ensureCameraAccess: () => ipcRenderer.invoke('sync:ensureCamera') as Promise<boolean>,
    captureScreenForQr: () => ipcRenderer.invoke('sync:captureScreen') as Promise<string | null>,
    respondSyncConfirm: (ok: boolean) => ipcRenderer.send('sync:confirm-response', ok),
    onSyncReady: (cb: (info: { uri: string; code: string; qrSvg: string }) => void) => {
        ipcRenderer.on('sync:ready', (_e, info) => cb(info));
    },
    onSyncConfirm: (cb: (summary: { added: number; updated: number; deleted: number; unchanged: number }) => void) => {
        ipcRenderer.on('sync:confirm', (_e, summary) => cb(summary));
    },

    getSettings: () => ipcRenderer.invoke('settings:get'),
    setSettings: (patch: Record<string, unknown>) => ipcRenderer.invoke('settings:set', patch),
    checkForUpdates: () => ipcRenderer.invoke('updates:check'),
    appVersion: () => ipcRenderer.invoke('app:version'),
    showAbout: () => ipcRenderer.invoke('app:about'),
    confirm: (options: {
        title?: string;
        message: string;
        detail?: string;
        confirmLabel?: string;
        cancelLabel?: string;
        type?: 'none' | 'info' | 'error' | 'question' | 'warning';
    }) => ipcRenderer.invoke('app:confirm', options) as Promise<boolean>,
    resolveIssuerIcon: (domain: string) => ipcRenderer.invoke('issuer:icon', domain) as Promise<string | null>,
};

contextBridge.exposeInMainWorld('otpeer', api);

export type OtpeerApi = typeof api;
