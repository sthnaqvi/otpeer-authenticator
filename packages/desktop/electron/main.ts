import {
    app, BrowserWindow, ipcMain, dialog, powerMonitor, session,
    Tray, Menu, nativeImage, shell, safeStorage, systemPreferences,
    desktopCapturer, Notification,
} from 'electron';
import path from 'path';
import fs from 'fs';
import { VaultService } from './vault-service';
import { resolveIssuerIconDataUrl } from './issuer_icons';
import { TrayPopup, type TrayPopupState, type TrayLastUsedView } from './tray_popup';
import { clearClipboardRestore, copyOtpPreservingClipboard } from './clipboard_otp';

/**
 * Thin wiring: fixed portrait window, menu-bar tray with last-used quick-copy,
 * hardened webPreferences, IPC → VaultService, auto-lock, settings.
 */

const vault = new VaultService();
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let trayPopup: TrayPopup | null = null;
let isQuitting = false;
let trayRefreshTimer: NodeJS.Timeout | null = null;
/** Skip Dock/'activate' showWindow while opening the tray popover. */
let suppress_activate_show = false;

const APP_DISPLAY_NAME = 'OTPeer Authenticator';
const WINDOW_WIDTH = 400;
const WINDOW_HEIGHT = 680;

// Identity must be set before ready — helps menus / about panel. macOS menu bar
// and Touch ID still need the Electron.app Info.plist patch (brand_electron_dev.js).
app.setName(APP_DISPLAY_NAME);
if (process.platform === 'win32') {
    app.setAppUserModelId('app.otpeer.desktop');
}

// ---------------------------------------------------------------- settings

interface Settings {
    autoUpdate: boolean;
    autoLockMinutes: number;
    biometricUnlock: boolean;
    lastUsedAccountId: string | null;
}
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
const sealedPasswordPath = () => path.join(app.getPath('userData'), 'vault-password.sealed');
const defaultSettings: Settings = {
    autoUpdate: true,
    autoLockMinutes: 15,
    biometricUnlock: false,
    lastUsedAccountId: null,
};

function loadSettings(): Settings {
    try {
        return { ...defaultSettings, ...JSON.parse(fs.readFileSync(settingsPath(), 'utf-8')) };
    } catch {
        return { ...defaultSettings };
    }
}
function saveSettings(settings: Settings): void {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
}

// ---------------------------------------------------------------- biometric (Touch ID → sealed vault password)

function isBiometricHardwareAvailable(): boolean {
    if (process.platform !== 'darwin') return false;
    try {
        return systemPreferences.canPromptTouchID() && safeStorage.isEncryptionAvailable();
    } catch {
        return false;
    }
}

function hasSealedPassword(): boolean {
    try {
        return fs.existsSync(sealedPasswordPath()) && fs.statSync(sealedPasswordPath()).size > 0;
    } catch {
        return false;
    }
}

function sealVaultPassword(password: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('OS secure storage is not available');
    }
    const sealed = safeStorage.encryptString(password);
    fs.mkdirSync(path.dirname(sealedPasswordPath()), { recursive: true });
    fs.writeFileSync(sealedPasswordPath(), sealed);
}

function unsealVaultPassword(): string | null {
    try {
        const sealed = fs.readFileSync(sealedPasswordPath());
        return safeStorage.decryptString(sealed);
    } catch {
        return null;
    }
}

function clearSealedPassword(): void {
    try {
        if (fs.existsSync(sealedPasswordPath())) fs.unlinkSync(sealedPasswordPath());
    } catch {
        // ignore
    }
}

function biometricStatus(): { available: boolean; enabled: boolean; label: string } {
    const available = isBiometricHardwareAvailable();
    const enabled = loadSettings().biometricUnlock && hasSealedPassword() && available;
    return {
        available,
        enabled,
        label: process.platform === 'darwin' ? 'Touch ID' : 'Biometrics',
    };
}

function syncBiometricSealAfterPasswordChange(newPassword: string): void {
    const settings = loadSettings();
    if (!newPassword) {
        clearSealedPassword();
        if (settings.biometricUnlock) saveSettings({ ...settings, biometricUnlock: false });
        return;
    }
    if (settings.biometricUnlock && isBiometricHardwareAvailable()) {
        try {
            sealVaultPassword(newPassword);
        } catch {
            clearSealedPassword();
            saveSettings({ ...settings, biometricUnlock: false });
        }
    }
}

// ---------------------------------------------------------------- assets

function buildAsset(...parts: string[]): string {
    if (app.isPackaged) {
        const unpacked = path.join(process.resourcesPath, 'app.asar.unpacked', 'build', ...parts);
        if (fs.existsSync(unpacked)) return unpacked;
        return path.join(process.resourcesPath, 'app', 'build', ...parts);
    }
    return path.join(__dirname, '..', 'build', ...parts);
}

function resolveAppIcon(): Electron.NativeImage {
    const candidates = process.platform === 'darwin'
        ? ['icon.icns', 'icon.png']
        : process.platform === 'win32'
            ? ['icon.ico', 'icon.png']
            : ['icon.png'];
    for (const name of candidates) {
        const file = buildAsset(name);
        if (fs.existsSync(file)) {
            const image = nativeImage.createFromPath(file);
            if (!image.isEmpty()) return image;
        }
    }
    return nativeImage.createEmpty();
}

function resolveTrayIcon(): Electron.NativeImage {
    if (process.platform === 'darwin') {
        const template = buildAsset('trayTemplate.png');
        if (fs.existsSync(template)) {
            const image = nativeImage.createFromPath(template);
            image.setTemplateImage(true);
            return image;
        }
    }
    const colored = buildAsset('tray.png');
    if (fs.existsSync(colored)) return nativeImage.createFromPath(colored);
    return resolveAppIcon();
}

// ---------------------------------------------------------------- window / Dock (macOS)

function showDockIcon(): void {
    if (process.platform === 'darwin' && app.dock) app.dock.show();
}

function hideDockIcon(): void {
    if (process.platform === 'darwin' && app.dock) app.dock.hide();
}

function showWindow(): void {
    if (!win) {
        createWindow();
        return;
    }
    if (win.isMinimized()) win.restore();
    showDockIcon();
    win.show();
    win.focus();
}

function createWindow(): void {
    const icon = resolveAppIcon();
    win = new BrowserWindow({
        width: WINDOW_WIDTH,
        height: WINDOW_HEIGHT,
        resizable: false,
        maximizable: false,
        fullscreenable: false,
        minimizable: true,
        title: APP_DISPLAY_NAME,
        backgroundColor: '#121212',
        icon: icon.isEmpty() ? undefined : icon,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });

    win.webContents.on('will-navigate', (event) => event.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    win.loadFile(path.join(__dirname, '..', 'dist-renderer', 'index.html'));

    showDockIcon();

    win.on('close', (event) => {
        // Red traffic-light → hide to menu-bar tray and leave Dock until Quit via Open app later.
        if (!isQuitting) {
            event.preventDefault();
            win?.hide();
            trayPopup?.hide();
            hideDockIcon();
        }
    });
    win.on('closed', () => { win = null; });
}

// ---------------------------------------------------------------- about / menus

function showAbout(): void {
    // Keep each line short — native macOS About boxes center-align detail and soft-wrap mid-phrase.
    const detail = [
        `Version ${app.getVersion()}`,
        'MIT License',
        'Author: Sayed Tauseef Naqvi',
        '',
        '2FA serverless peer-to-peer sync',
        'Vault shared with the auth CLI',
        '',
        'No telemetry',
        'Update checks use',
        'GitHub Releases only',
        'Sync is always started by you',
    ].join('\n');

    const options: Electron.MessageBoxOptions = {
        type: 'info',
        title: `About ${APP_DISPLAY_NAME}`,
        message: APP_DISPLAY_NAME,
        detail,
        buttons: ['OK'],
        icon: resolveAppIcon(),
    };
    if (win) void dialog.showMessageBox(win, options);
    else void dialog.showMessageBox(options);
}

function buildAppMenu(): Menu {
    const isMac = process.platform === 'darwin';
    const template: Electron.MenuItemConstructorOptions[] = [
        ...(isMac ? [{
            label: app.name,
            submenu: [
                { label: 'About OTPeer Authenticator', click: () => showAbout() },
                { type: 'separator' as const },
                { role: 'services' as const },
                { type: 'separator' as const },
                { role: 'hide' as const },
                { role: 'hideOthers' as const },
                { role: 'unhide' as const },
                { type: 'separator' as const },
                { role: 'quit' as const },
            ],
        }] : []),
        {
            label: 'File',
            submenu: [
                { label: 'Show Window', click: () => showWindow() },
                { type: 'separator' },
                isMac ? { role: 'close' } : { role: 'quit' },
            ],
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
                { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
            ],
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { label: 'Show OTPeer', click: () => showWindow() },
            ],
        },
        {
            label: 'Help',
            submenu: [
                ...(!isMac ? [{ label: 'About OTPeer Authenticator', click: () => showAbout() }] : []),
                {
                    label: 'Open GitHub',
                    click: () => { void shell.openExternal('https://github.com/sthnaqvi/otpeer-authenticator'); },
                },
            ],
        },
    ];
    return Menu.buildFromTemplate(template);
}

// ---------------------------------------------------------------- tray

function rememberLastUsedAccount(accountId: string): void {
    const settings = loadSettings();
    if (settings.lastUsedAccountId === accountId) return;
    saveSettings({ ...settings, lastUsedAccountId: accountId });
}

function clearLastUsedIfMatch(accountId: string): void {
    const settings = loadSettings();
    if (settings.lastUsedAccountId !== accountId) return;
    saveSettings({ ...settings, lastUsedAccountId: null });
}

function accountEmail(account: { name: string; issuer?: string }): string {
    const name = account.name || '';
    return name.includes('@') ? name : '';
}

function accountIssuerLabel(account: { name: string; issuer?: string }): string {
    return account.issuer || account.name || 'Account';
}

async function buildTrayPopupState(): Promise<TrayPopupState> {
    try {
        const accounts = await vault.listWithCodes();
        const count = accounts.length;
        tray?.setToolTip(count ? `OTPeer — ${count} account${count === 1 ? '' : 's'}` : 'OTPeer — No accounts');
        if (!count) return { mode: 'empty', lastUsed: null };

        const last_id = loadSettings().lastUsedAccountId;
        const account = last_id ? accounts.find((entry) => entry.id === last_id) : undefined;
        if (!account) return { mode: 'no-recent', lastUsed: null };

        const lastUsed: TrayLastUsedView = {
            id: account.id,
            issuer: accountIssuerLabel(account),
            email: accountEmail(account),
            code: account.code,
            expiresIn: account.expiresIn,
            period: account.period || 30,
        };
        return { mode: 'ready', lastUsed };
    } catch {
        tray?.setToolTip('OTPeer — Locked');
        return { mode: 'locked', lastUsed: null };
    }
}

async function refreshTrayPopup(): Promise<void> {
    if (!trayPopup) return;
    trayPopup.setState(await buildTrayPopupState());
}

async function copyLastUsedFromTray(): Promise<void> {
    const state = await buildTrayPopupState();
    if (state.mode !== 'ready' || !state.lastUsed) {
        showWindow();
        return;
    }
    try {
        let code = state.lastUsed.code;
        if (!code) {
            const generated = await vault.generateCode(state.lastUsed.id);
            code = generated.code;
        }
        if (code) {
            copyOtpPreservingClipboard(code);
            rememberLastUsedAccount(state.lastUsed.id);
            armAutoLock();
            void refreshTrayPopup();
        }
    } catch {
        showWindow();
    }
}

async function toggleTrayPopup(): Promise<void> {
    if (!tray || !trayPopup) return;
    if (trayPopup.isVisible()) {
        trayPopup.hide();
        return;
    }
    suppress_activate_show = true;
    try {
        trayPopup.setState(await buildTrayPopupState());
        await trayPopup.showNear(tray.getBounds());
    } finally {
        setTimeout(() => { suppress_activate_show = false; }, 400);
    }
}

function createTray(): void {
    tray = new Tray(resolveTrayIcon());
    tray.setToolTip('OTPeer Authenticator');

    trayPopup = new TrayPopup({
        openApp: () => showWindow(),
        unlock: () => showWindow(),
        lockVault: () => {
            // Lock without opening the main window — tray stays the entry point.
            lockNow();
        },
        about: () => showAbout(),
        quit: () => {
            isQuitting = true;
            app.quit();
        },
        close: () => undefined,
        copyLastUsed: () => copyLastUsedFromTray(),
    });

    // Tray icon toggles the popover only — never the main window.
    tray.on('click', () => { void toggleTrayPopup(); });
    tray.on('right-click', () => { void toggleTrayPopup(); });
    void refreshTrayPopup();
    if (trayRefreshTimer) clearInterval(trayRefreshTimer);
    trayRefreshTimer = setInterval(() => { void refreshTrayPopup(); }, 1000);
}

// ---------------------------------------------------------------- auto-lock

let idleTimer: NodeJS.Timeout | null = null;
function armAutoLock(): void {
    const minutes = loadSettings().autoLockMinutes;
    if (idleTimer) clearTimeout(idleTimer);
    if (minutes > 0) {
        idleTimer = setTimeout(() => lockNow(), minutes * 60 * 1000);
    }
}
function lockNow(): void {
    vault.lock();
    win?.webContents.send('vault:locked');
    void refreshTrayPopup();
}

// ---------------------------------------------------------------- IPC

let pendingSyncConfirm: ((ok: boolean) => void) | null = null;

function registerIpc(): void {
    const touch = <T>(value: T): T => { armAutoLock(); void refreshTrayPopup(); return value; };

    ipcMain.handle('vault:status', () => vault.status());
    ipcMain.handle('vault:unlock', async (_e, password: string) => {
        const ok = await vault.unlock(password);
        if (ok) {
            if (password && loadSettings().biometricUnlock && isBiometricHardwareAvailable()) {
                try { sealVaultPassword(password); } catch { /* keep previous seal */ }
            }
            armAutoLock();
            void refreshTrayPopup();
        }
        return ok;
    });
    ipcMain.handle('vault:lock', () => { lockNow(); });
    ipcMain.handle('vault:setPassword', async (_e, newPassword: string) => {
        await vault.setPassword(newPassword);
        syncBiometricSealAfterPasswordChange(newPassword);
        armAutoLock();
        void refreshTrayPopup();
    });
    ipcMain.handle('accounts:list', async () => {
        try {
            return touch(await vault.listWithCodes());
        } catch (error) {
            const status = await vault.status();
            if (status.locked) {
                win?.webContents.send('vault:locked');
                void refreshTrayPopup();
            }
            throw error;
        }
    });
    ipcMain.handle('accounts:generate', async (_e, id: string) => touch(await vault.generateCode(id)));
    ipcMain.handle('accounts:setLastUsed', (_e, id: string) => {
        if (typeof id === 'string' && id) {
            rememberLastUsedAccount(id);
            void refreshTrayPopup();
        }
    });
    ipcMain.handle('clipboard:copyOtp', (_e, code: string) => {
        if (typeof code === 'string' && code) copyOtpPreservingClipboard(code);
    });
    ipcMain.handle('accounts:add', async (_e, input) => touch(await vault.addAccount(input)));
    ipcMain.handle('accounts:addUri', async (_e, uri: string) => touch(await vault.addFromUri(uri)));
    ipcMain.handle('accounts:remove', async (_e, id: string) => {
        clearLastUsedIfMatch(id);
        return touch(await vault.removeAccount(id));
    });
    ipcMain.handle('accounts:rename', async (_e, id: string, name: string) => touch(await vault.renameAccount(id, name)));
    ipcMain.handle('vault:detectImport', (_e, raw: string) => vault.detectImport(raw));
    ipcMain.handle('vault:import', async (_e, raw: string, filePassword?: string) => touch(await vault.importData(raw, filePassword)));
    ipcMain.handle('vault:export', async (_e, exportPassword: string) => touch(await vault.exportVault(exportPassword)));

    ipcMain.handle('biometric:status', () => biometricStatus());
    ipcMain.handle('biometric:setEnabled', async (_e, enabled: boolean) => {
        const settings = loadSettings();
        if (!enabled) {
            clearSealedPassword();
            saveSettings({ ...settings, biometricUnlock: false });
            return biometricStatus();
        }
        if (!isBiometricHardwareAvailable()) {
            throw new Error('Touch ID is not available on this Mac');
        }
        const status = await vault.status();
        if (!status.encrypted) {
            throw new Error('Set a vault password before enabling Touch ID unlock');
        }
        const password = vault.sessionPassword();
        if (password === null || password === '') {
            throw new Error('Unlock the vault with your password first');
        }
        // Seal without a prompt here — this session is already password-unlocked.
        // Touch ID is required when unlocking later (biometric:unlock).
        sealVaultPassword(password);
        saveSettings({ ...settings, biometricUnlock: true });
        return biometricStatus();
    });
    ipcMain.handle('biometric:unlock', async () => {
        const status = biometricStatus();
        if (!status.enabled) return false;
        try {
            await systemPreferences.promptTouchID('unlock your vault');
        } catch {
            return false;
        }
        const password = unsealVaultPassword();
        if (password == null) return false;
        const ok = await vault.unlock(password);
        if (ok) {
            armAutoLock();
            void refreshTrayPopup();
        }
        return ok;
    });

    ipcMain.handle('vault:pickImportFile', async () => {
        if (!win) return null;
        const result = await dialog.showOpenDialog(win, {
            title: 'Import backup file',
            properties: ['openFile'],
            filters: [{ name: 'Backups', extensions: ['json', '2fas', 'txt'] }, { name: 'All files', extensions: ['*'] }],
        });
        if (result.canceled || !result.filePaths[0]) return null;
        return fs.readFileSync(result.filePaths[0], 'utf-8');
    });

    const syncEvents = {
        onReady: (info: unknown) => win?.webContents.send('sync:ready', info),
        confirm: (summary: unknown) =>
            new Promise<boolean>((resolve) => {
                pendingSyncConfirm = resolve;
                win?.webContents.send('sync:confirm', summary);
            }),
    };
    ipcMain.handle('sync:host', async () => touch(await vault.hostSync(syncEvents)));
    ipcMain.handle('sync:join', async (_e, target: string, code?: string) => touch(await vault.joinSync(target, code, syncEvents)));
    ipcMain.on('sync:confirm-response', (_e, ok: boolean) => {
        pendingSyncConfirm?.(ok);
        pendingSyncConfirm = null;
    });
    ipcMain.handle('sync:ensureCamera', async () => {
        if (process.platform === 'darwin') {
            return systemPreferences.askForMediaAccess('camera');
        }
        return true;
    });
    ipcMain.handle('sync:captureScreen', async () => {
        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            // Higher than 1080p — small browser setup QRs fail at 1920×1080.
            thumbnailSize: { width: 3840, height: 2160 },
        });
        const primary = sources[0];
        if (!primary || primary.thumbnail.isEmpty()) return null;
        return primary.thumbnail.toDataURL();
    });

    ipcMain.handle('settings:get', () => loadSettings());
    ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => {
        const current = loadSettings();
        const {
            biometricUnlock: _ignoredBio,
            lastUsedAccountId: _ignoredLast,
            ...safePatch
        } = patch as Partial<Settings> & { biometricUnlock?: boolean; lastUsedAccountId?: string | null };
        const next = { ...current, ...safePatch };
        saveSettings(next);
        armAutoLock();
        return next;
    });
    ipcMain.handle('app:version', () => app.getVersion());
    ipcMain.handle('app:about', () => { showAbout(); });
    ipcMain.handle('app:confirm', async (_e, options: {
        title?: string;
        message: string;
        detail?: string;
        confirmLabel?: string;
        cancelLabel?: string;
        type?: 'none' | 'info' | 'error' | 'question' | 'warning';
    }) => {
        const icon = resolveAppIcon();
        const box: Electron.MessageBoxOptions = {
            type: options.type ?? 'question',
            title: options.title ?? APP_DISPLAY_NAME,
            message: options.message,
            detail: options.detail,
            buttons: [options.cancelLabel ?? 'Cancel', options.confirmLabel ?? 'OK'],
            defaultId: 1,
            cancelId: 0,
            noLink: true,
            icon: icon.isEmpty() ? undefined : icon,
        };
        const result = win
            ? await dialog.showMessageBox(win, box)
            : await dialog.showMessageBox(box);
        return result.response === 1;
    });
    ipcMain.handle('issuer:icon', async (_e, domain: string) => resolveIssuerIconDataUrl(domain));

    ipcMain.handle('updates:check', async () => {
        if (process.env.OTPEER_DISABLE_UPDATER) return { status: 'disabled-by-build' };
        try {
            const { currentVersion, latestVersion, updateAvailable } = await runUpdateCheck();
            return { status: 'ok', currentVersion, latestVersion, updateAvailable };
        } catch (error) {
            return { status: 'error', message: (error as Error).message, currentVersion: app.getVersion() };
        }
    });
    ipcMain.handle('app:openUpdatePage', (_e, currentVersion: string) => {
        void shell.openExternal(buildUpdatePageUrl(currentVersion));
    });
}

const UPDATE_SITE_ORIGIN = 'https://otpeer.com';

function buildUpdatePageUrl(currentVersion: string): string {
    const params = new URLSearchParams({ update: '1', current: currentVersion });
    return `${UPDATE_SITE_ORIGIN}/?${params.toString()}#download`;
}

interface UpdateCheckResult {
    currentVersion: string;
    latestVersion: string;
    updateAvailable: boolean;
}

/**
 * macOS builds are unsigned (Phase 1) — Squirrel.Mac can't auto-install, so
 * autoDownload stays off there and users are pointed to the website instead.
 * Windows/Linux keep electron-updater's own background download.
 */
async function runUpdateCheck(): Promise<UpdateCheckResult> {
    const currentVersion = app.getVersion();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = process.platform !== 'darwin';
    const result = await autoUpdater.checkForUpdates();
    const latestVersion = result?.updateInfo?.version ?? currentVersion;
    const updateAvailable = Boolean(result?.isUpdateAvailable);
    return { currentVersion, latestVersion, updateAvailable };
}

/** Mac-only: notify-and-redirect-to-website. Never downloads or auto-installs. */
async function checkForUpdatesAndNotifyMac(): Promise<void> {
    if (process.env.OTPEER_DISABLE_UPDATER) return;
    try {
        const { currentVersion, latestVersion, updateAvailable } = await runUpdateCheck();
        if (!updateAvailable) return;
        const url = buildUpdatePageUrl(currentVersion);
        if (Notification.isSupported()) {
            const notification = new Notification({
                title: 'Update available',
                body: `OTPeer Authenticator ${latestVersion} is available (you have ${currentVersion}).`,
            });
            notification.on('click', () => { void shell.openExternal(url); });
            notification.show();
        }
    } catch {
        // updater unavailable (dev build)
    }
}

// ---------------------------------------------------------------- app

app.setAboutPanelOptions({
    applicationName: APP_DISPLAY_NAME,
    applicationVersion: app.getVersion(),
    copyright: 'Copyright © Sayed Tauseef Naqvi',
});

if (process.platform === 'darwin' && app.dock) {
    const dockIcon = resolveAppIcon();
    if (!dockIcon.isEmpty()) app.dock.setIcon(dockIcon);
}

// Spotlight: unsigned / quarantined Mac installs may never register with Launch Services,
// so Spotlight might not find "OTPeer Authenticator" even after copy to /Applications.
// Lasting fix: Developer ID signing + notarization (Stage F). Manual recovery:
// lsregister -f on the .app bundle; search Spotlight for "OTPeer".
app.whenReady().then(() => {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:",
                ],
            },
        });
    });
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
        callback(permission === 'media' || permission === 'display-capture');
    });

    Menu.setApplicationMenu(buildAppMenu());
    registerIpc();
    createWindow();
    createTray();
    armAutoLock();

    powerMonitor.on('lock-screen', lockNow);
    powerMonitor.on('suspend', lockNow);

    if (!process.env.OTPEER_DISABLE_UPDATER && loadSettings().autoUpdate) {
        if (process.platform === 'darwin') {
            void checkForUpdatesAndNotifyMac();
        } else {
            try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const { autoUpdater } = require('electron-updater');
                autoUpdater.autoDownload = true;
                autoUpdater.checkForUpdatesAndNotify().catch(() => undefined);
            } catch {
                // updater unavailable (dev build)
            }
        }
    }

    app.on('activate', () => {
        // Dock click should show the app; tray popover must not reopen the main window.
        if (suppress_activate_show || trayPopup?.isVisible()) return;
        showWindow();
    });
});

app.on('before-quit', () => {
    isQuitting = true;
    if (trayRefreshTimer) clearInterval(trayRefreshTimer);
    clearClipboardRestore();
    trayPopup?.destroy();
    trayPopup = null;
    lockNow();
});

app.on('window-all-closed', () => {
    // Keep process alive for the status-bar tray until Quit (all platforms).
    if (isQuitting) app.quit();
});
