export interface AccountView {
    id: string;
    name: string;
    issuer?: string;
    type: string;
    digits: number;
    period: number;
    code: string | null;
    expiresIn: number | null;
}

export interface SyncSummary {
    added: number;
    updated: number;
    deleted: number;
    unchanged: number;
}

export interface OtpeerApi {
    platform: NodeJS.Platform;
    status(): Promise<{ exists: boolean; encrypted: boolean; locked: boolean; location?: string; count?: number }>;
    unlock(password: string): Promise<boolean>;
    lock(): Promise<void>;
    setPassword(newPassword: string): Promise<void>;
    biometricStatus(): Promise<{ available: boolean; enabled: boolean; label: string }>;
    setBiometricUnlock(enabled: boolean): Promise<{ available: boolean; enabled: boolean; label: string }>;
    unlockWithBiometric(): Promise<boolean>;
    onLocked(cb: () => void): () => void;
    listAccounts(): Promise<AccountView[]>;
    generateCode(accountId: string): Promise<{ code: string; expiresIn: number | null }>;
    setLastUsedAccount(accountId: string): Promise<void>;
    addAccount(input: { name: string; issuer?: string; secret: string }): Promise<{ id: string }>;
    addFromUri(uri: string): Promise<{ id: string }>;
    removeAccount(accountId: string): Promise<void>;
    renameAccount(accountId: string, newName: string): Promise<void>;
    pickImportFile(): Promise<string | null>;
    importData(raw: string, filePassword?: string): Promise<{ added: number; skipped: number; conflicts: string[] }>;
    detectImport(raw: string): Promise<{ format: string; encrypted: boolean } | null>;
    exportVault(exportPassword: string): Promise<string>;
    copyToClipboard(text: string): void;
    /** Copy OTP and restore prior clipboard after a short delay (if still unchanged). */
    copyOtp(code: string): Promise<void>;
    startSyncHost(): Promise<{ applied: boolean; summary: SyncSummary }>;
    joinSync(target: string, code?: string): Promise<{ applied: boolean; summary: SyncSummary }>;
    ensureCameraAccess(): Promise<boolean>;
    captureScreenForQr(): Promise<
        | { ok: true; dataUrl: string }
        | { ok: false; reason: 'permission' | 'empty' | 'unavailable' }
    >;
    respondSyncConfirm(ok: boolean): void;
    onSyncReady(cb: (info: { uri: string; code: string; qrSvg: string }) => void): void;
    onSyncConfirm(cb: (summary: SyncSummary) => void): void;
    getSettings(): Promise<{ autoUpdate: boolean; autoLockMinutes: number; biometricUnlock: boolean }>;
    setSettings(patch: Record<string, unknown>): Promise<{ autoUpdate: boolean; autoLockMinutes: number; biometricUnlock: boolean }>;
    checkForUpdates(): Promise<{
        status: string;
        currentVersion?: string;
        latestVersion?: string;
        updateAvailable?: boolean;
        message?: string;
    }>;
    openUpdatePage(currentVersion: string): Promise<void>;
    appVersion(): Promise<string>;
    showAbout(): Promise<void>;
    confirm(options: {
        title?: string;
        message: string;
        detail?: string;
        confirmLabel?: string;
        cancelLabel?: string;
        type?: 'none' | 'info' | 'error' | 'question' | 'warning';
    }): Promise<boolean>;
    resolveIssuerIcon(domain: string): Promise<string | null>;
}

declare global {
    interface Window {
        otpeer: OtpeerApi;
    }
}

export {};
