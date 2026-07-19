'use strict';

/**
 * Capture real product screenshots from the built desktop renderer
 * (not design mockups). Writes PNGs for the marketing site.
 *
 * Usage (from packages/desktop after npm run build):
 *   npx electron scripts/capture_marketing_screenshots.js
 */

const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

// Keep marketing captures at 1× CSS pixels (no Retina doubling).
const { app, BrowserWindow, ipcMain } = require('electron');
app.commandLine.appendSwitch('force-device-scale-factor', '1');

const ROOT = path.join(__dirname, '..');
const RENDERER = path.join(ROOT, 'dist-renderer', 'index.html');
const OUT_DIR = path.join(ROOT, '..', '..', 'website', 'public', 'assets');
const SIZE = { width: 400, height: 680 };

const SAMPLE_ACCOUNTS = [
    { id: '1', name: 'alice', issuer: 'GitHub', type: 'totp', digits: 6, period: 30, code: '482913', expiresIn: 18 },
    { id: '2', name: 'work', issuer: 'Google', type: 'totp', digits: 6, period: 30, code: '019447', expiresIn: 18 },
    { id: '3', name: 'corp', issuer: 'Microsoft', type: 'totp', digits: 6, period: 30, code: '771205', expiresIn: 18 },
    { id: '4', name: 'community', issuer: 'Discord', type: 'totp', digits: 6, period: 30, code: '338661', expiresIn: 18 },
];

const SYNC_URI = 'authsync://192.168.1.42:47821?c=7K4M';
const SYNC_CODE = '7K4M';

function qrModules(text) {
    const qrcodeGenerator = require('qrcode-generator');
    const qr = qrcodeGenerator(0, 'M');
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    const modules = [];
    for (let r = 0; r < count; r++) {
        const row = [];
        for (let c = 0; c < count; c++) row.push(qr.isDark(r, c));
        modules.push(row);
    }
    return modules;
}

/** Same builder as vault-service.ts — real scannable QR. */
function qrSvg(text) {
    const modules = qrModules(text);
    const cell = 4;
    const size = modules.length * cell;
    let rects = '';
    for (let r = 0; r < modules.length; r++) {
        for (let c = 0; c < modules.length; c++) {
            if (modules[r][c]) {
                rects += `<rect x="${c * cell}" y="${r * cell}" width="${cell}" height="${cell}"/>`;
            }
        }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
}

let current_scene = 'unlock';

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function installMockApiOnce() {
    const channels = [
        'vault:status', 'vault:unlock', 'vault:lock', 'accounts:list',
        'biometric:status', 'settings:get', 'app:version', 'issuer:icon',
        'sync:host', 'clipboard:copyOtp', 'accounts:setLastUsed',
    ];
    for (const channel of channels) {
        try { ipcMain.removeHandler(channel); } catch { /* ignore */ }
    }

    ipcMain.handle('vault:status', async () => {
        if (current_scene === 'unlock') {
            return { exists: true, encrypted: true, locked: true, count: 4 };
        }
        return { exists: true, encrypted: false, locked: false, count: SAMPLE_ACCOUNTS.length };
    });
    ipcMain.handle('vault:unlock', async () => true);
    ipcMain.handle('vault:lock', async () => {});
    ipcMain.handle('accounts:list', async () => (current_scene === 'unlock' ? [] : SAMPLE_ACCOUNTS));
    ipcMain.handle('biometric:status', async () => ({ available: false, enabled: false, label: 'Touch ID' }));
    ipcMain.handle('settings:get', async () => ({ autoUpdate: true, autoLockMinutes: 0, biometricUnlock: false }));
    ipcMain.handle('app:version', async () => '0.1.3');
    ipcMain.handle('issuer:icon', async (_e, domain) => {
        const map = {
            'github.com': 'github.png',
            'google.com': 'google.png',
            'microsoft.com': 'microsoft.png',
            'discord.com': 'discord.png',
        };
        const file = map[domain];
        if (!file) return null;
        const full = path.join(ROOT, 'build', 'issuers', file);
        if (!fs.existsSync(full)) return null;
        return `data:image/png;base64,${fs.readFileSync(full).toString('base64')}`;
    });
    ipcMain.handle('clipboard:copyOtp', async () => {});
    ipcMain.handle('accounts:setLastUsed', async () => {});
    ipcMain.handle('sync:host', async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        setTimeout(() => {
            win?.webContents.send('sync:ready', {
                uri: SYNC_URI,
                code: SYNC_CODE,
                qrSvg: qrSvg(SYNC_URI),
            });
        }, 50);
        await sleep(60_000);
        return { applied: false, summary: { added: 0, updated: 0, deleted: 0, unchanged: 0 } };
    });
}

async function paintQrCanvas(win) {
    const modules = qrModules(SYNC_URI);
    const ok = await win.webContents.executeJavaScript(`
        (() => {
            const modules = ${JSON.stringify(modules)};
            const box = document.querySelector('.qr');
            if (!box) return false;
            const css = Math.round(box.clientWidth - 20) || 180;
            const n = modules.length;
            const cell = Math.max(1, Math.floor(css / n));
            const px = n * cell;
            const canvas = document.createElement('canvas');
            canvas.width = px;
            canvas.height = px;
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.imageRendering = 'pixelated';
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, px, px);
            ctx.fillStyle = '#000000';
            for (let r = 0; r < n; r++) {
                for (let c = 0; c < n; c++) {
                    if (modules[r][c]) ctx.fillRect(c * cell, r * cell, cell, cell);
                }
            }
            box.innerHTML = '';
            box.appendChild(canvas);
            return true;
        })()
    `);
    if (!ok) throw new Error('QR canvas paint failed — .qr not found');
}

async function captureScene(win, scene, outName) {
    current_scene = scene;
    await win.loadURL(`${pathToFileURL(RENDERER).href}?scene=${scene}&t=${Date.now()}`);
    await sleep(1000);

    if (scene === 'sync') {
        await win.webContents.executeJavaScript(`
            (() => {
                const menu = document.querySelector('[aria-label="Menu"]');
                if (menu) menu.click();
            })()
        `);
        await sleep(250);
        await win.webContents.executeJavaScript(`
            (() => {
                const items = [...document.querySelectorAll('.drawer-item')];
                const sync = items.find((el) => /Sync/i.test(el.textContent || ''));
                if (sync) sync.click();
            })()
        `);
        await sleep(350);
        await win.webContents.executeJavaScript(`
            (() => {
                const host = document.querySelector('.sync-choice.primary-choice');
                if (host) host.click();
            })()
        `);
        await sleep(1000);
        await paintQrCanvas(win);
        await sleep(200);
    }

    await sleep(300);
    const image = await win.webContents.capturePage();
    const outPath = path.join(OUT_DIR, outName);
    fs.writeFileSync(outPath, image.toPNG());
    console.log(`Wrote ${outPath} (${image.getSize().width}x${image.getSize().height})`);
}

app.whenReady().then(async () => {
    if (!fs.existsSync(RENDERER)) {
        console.error('Missing dist-renderer. Run: npm run build (in packages/desktop)');
        app.exit(1);
        return;
    }
    fs.mkdirSync(OUT_DIR, { recursive: true });
    installMockApiOnce();

    const win = new BrowserWindow({
        ...SIZE,
        show: false,
        resizable: false,
        backgroundColor: '#121212',
        webPreferences: {
            preload: path.join(ROOT, 'dist-electron', 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });

    try {
        await captureScene(win, 'unlock', 'screenshot-unlock.png');
        await captureScene(win, 'accounts', 'screenshot-accounts.png');
        await captureScene(win, 'sync', 'screenshot-sync.png');
        console.log('Marketing screenshots captured from real renderer UI.');
        app.exit(0);
    } catch (err) {
        console.error(err);
        app.exit(1);
    }
});
