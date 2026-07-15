#!/usr/bin/env node
/**
 * Rebrand the local Electron.app for macOS development.
 *
 * Menu bar / Dock / Touch ID / Cmd+Tab read identity from the running .app
 * bundle (name + icon + signature). app.setName() cannot override that.
 * Packaged builds are fine via electron-builder; this fixes `npm start`.
 *
 * Steps:
 *  1. Rename Electron.app → OTPeer Authenticator.app (path.txt updated)
 *  2. Patch CFBundleName / CFBundleDisplayName
 *  3. Replace electron.icns with the OTPeer icon
 *  4. Ad-hoc codesign so LocalAuthentication / Dock pick up the new identity
 *
 * Idempotent. Unlinks before rewrite so package-manager hardlinks stay safe.
 */

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

if (process.platform !== 'darwin') process.exit(0);

const DESIRED_NAME = 'OTPeer Authenticator';
const DESIRED_APP = `${DESIRED_NAME}.app`;
const ICON_SOURCE = path.join(__dirname, '..', 'build', 'icon.icns');

const electron_pkg = path.dirname(require.resolve('electron/package.json'));
const dist_dir = path.join(electron_pkg, 'dist');
const path_txt = path.join(electron_pkg, 'path.txt');
const stock_app = path.join(dist_dir, 'Electron.app');
const branded_app = path.join(dist_dir, DESIRED_APP);

/**
 * Electron 43+ dropped the npm postinstall download — the macOS .app appears
 * only after the first `require('electron')` (or `install-electron`). Branding
 * must trigger that before looking for Electron.app.
 */
function ensureElectronBinaryDownloaded() {
    if (fs.existsSync(stock_app) || fs.existsSync(branded_app)) return;
    // Side effect: downloads + writes path.txt when dist is missing.
    require('electron');
    if (!fs.existsSync(stock_app) && !fs.existsSync(branded_app)) {
        throw new Error(
            `Electron binary download finished but neither ${DESIRED_APP} nor Electron.app exists under ${dist_dir}`,
        );
    }
}

function plistGet(plist_path, key) {
    try {
        return execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist_path], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
    } catch {
        return '';
    }
}

function plistSet(plist_path, key, value) {
    // Break hardlinks first so we don't mutate a shared store inode.
    const original = fs.readFileSync(plist_path);
    try { fs.unlinkSync(plist_path); } catch { /* ignore */ }
    fs.writeFileSync(plist_path, original);
    try {
        execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist_path]);
    } catch {
        execFileSync('/usr/libexec/PlistBuddy', ['-c', `Add :${key} string ${value}`, plist_path]);
    }
}

function replaceFile(target, source_buffer) {
    try { if (fs.existsSync(target)) fs.unlinkSync(target); } catch { /* ignore */ }
    fs.writeFileSync(target, source_buffer);
}

function ensureBrandedAppPath() {
    if (fs.existsSync(branded_app)) return branded_app;
    if (!fs.existsSync(stock_app)) {
        throw new Error(`Neither ${DESIRED_APP} nor Electron.app found under ${dist_dir}`);
    }
    fs.renameSync(stock_app, branded_app);
    return branded_app;
}

function ensurePathTxt(app_path) {
    const desired = `${path.basename(app_path)}/Contents/MacOS/Electron`;
    const current = fs.existsSync(path_txt) ? fs.readFileSync(path_txt, 'utf8').trim() : '';
    if (current === desired && !/\r|\n/.test(fs.readFileSync(path_txt, 'utf8'))) return;
    // Electron's index.js does not trim path.txt — a trailing newline breaks spawn (ENOENT).
    replaceFile(path_txt, Buffer.from(desired, 'utf8'));
}

ensureElectronBinaryDownloaded();
const app_path = ensureBrandedAppPath();
ensurePathTxt(app_path);

const contents_dir = path.join(app_path, 'Contents');
const plist_path = path.join(contents_dir, 'Info.plist');
const resources_dir = path.join(contents_dir, 'Resources');
const electron_icns = path.join(resources_dir, 'electron.icns');

const name_ok =
    plistGet(plist_path, 'CFBundleName') === DESIRED_NAME &&
    plistGet(plist_path, 'CFBundleDisplayName') === DESIRED_NAME;

if (!name_ok) {
    plistSet(plist_path, 'CFBundleName', DESIRED_NAME);
    plistSet(plist_path, 'CFBundleDisplayName', DESIRED_NAME);
}

const CAMERA_USAGE =
    'OTPeer Authenticator uses the camera to scan sync or account setup QR codes.';
const SCREEN_USAGE =
    'OTPeer Authenticator can scan a QR code shown on this screen.';
if (plistGet(plist_path, 'NSCameraUsageDescription') !== CAMERA_USAGE) {
    plistSet(plist_path, 'NSCameraUsageDescription', CAMERA_USAGE);
}
if (plistGet(plist_path, 'NSScreenCaptureDescription') !== SCREEN_USAGE) {
    plistSet(plist_path, 'NSScreenCaptureDescription', SCREEN_USAGE);
}

if (fs.existsSync(ICON_SOURCE)) {
    const icon_buf = fs.readFileSync(ICON_SOURCE);
    replaceFile(electron_icns, icon_buf);
    // Keep the default key → always resolve to Resources/electron.icns
    if (plistGet(plist_path, 'CFBundleIconFile') !== 'electron.icns') {
        plistSet(plist_path, 'CFBundleIconFile', 'electron.icns');
    }
    // Remove prior alternate file if present
    const alt = path.join(resources_dir, 'otpeer.icns');
    try { if (fs.existsSync(alt)) fs.unlinkSync(alt); } catch { /* ignore */ }
}

try {
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', app_path], {
        stdio: ['ignore', 'ignore', 'pipe'],
    });
} catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[brand-electron-dev] codesign warning:', (err.stderr || err.message || err).toString().trim());
}

// eslint-disable-next-line no-console
console.log(`[brand-electron-dev] ${app_path} → "${DESIRED_NAME}" (icon + ad-hoc signature)`);
