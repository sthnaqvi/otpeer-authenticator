import { BrowserWindow, screen, ipcMain } from 'electron';
import path from 'path';

/** Compact opaque tray popover — last-used OTP only (not full vault). */

export type TrayPopupMode = 'locked' | 'empty' | 'no-recent' | 'ready';

export interface TrayLastUsedView {
    id: string;
    issuer: string;
    email: string;
    code: string | null;
    expiresIn: number | null;
    period: number;
}

export interface TrayPopupState {
    mode: TrayPopupMode;
    lastUsed: TrayLastUsedView | null;
}

export interface TrayPopupActions {
    openApp: () => void;
    unlock: () => void;
    lockVault: () => void;
    about: () => void;
    quit: () => void;
    copyLastUsed: () => Promise<void>;
    close: () => void;
}

const POPUP_WIDTH = 280;

function formatCode(code: string): string {
    if (code.length === 6) return `${code.slice(0, 3)} ${code.slice(3)}`;
    if (code.length === 8) return `${code.slice(0, 4)} ${code.slice(4)}`;
    return code;
}

function ringDash(expiresIn: number | null, period: number): string {
    const p = Math.max(period || 30, 1);
    const remaining = expiresIn == null ? p : Math.max(0, Math.min(expiresIn, p));
    const circ = 2 * Math.PI * 6.8;
    const filled = (remaining / p) * circ;
    return `${filled.toFixed(1)} ${circ.toFixed(1)}`;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function buildHtml(state: TrayPopupState): string {
    const { mode, lastUsed } = state;
    let mid = '';
    if (mode === 'locked') {
        mid = `<div class="hint">Unlock the vault to copy codes.</div>`;
    } else if (mode === 'empty') {
        mid = `<div class="hint">No accounts yet.</div>`;
    } else if (mode === 'no-recent') {
        mid = `<div class="hint">No recent code — open the app to copy one.</div>`;
    } else if (lastUsed) {
        const issuer = escapeHtml(lastUsed.issuer || 'Account');
        const email = escapeHtml(lastUsed.email || '');
        const code = lastUsed.code ? escapeHtml(formatCode(lastUsed.code)) : '••••••';
        const secs = lastUsed.expiresIn != null ? String(lastUsed.expiresIn) : '—';
        const dash = ringDash(lastUsed.expiresIn, lastUsed.period);
        mid = `
      <button type="button" class="otp" id="copy" title="Last used — click to copy">
        <span class="otp-hint">Last used</span>
        <div class="main-row">
          <span class="issuer">${issuer}</span>
          <span class="dash">—</span>
          <span class="digits">${code}</span>
          <span class="timer" aria-hidden="true">
            <svg viewBox="0 0 18 18">
              <circle cx="9" cy="9" r="6.8" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="1.4"/>
              <circle cx="9" cy="9" r="6.8" fill="none" stroke="#4b8bd6" stroke-width="1.4"
                stroke-dasharray="${dash}" stroke-linecap="round"/>
            </svg>
            <span class="secs">${secs}</span>
          </span>
        </div>
        ${email ? `<div class="email">${email}</div>` : ''}
      </button>`;
    }

    const footer = mode === 'locked'
        ? `<button type="button" class="item" data-act="unlock">Unlock…</button>`
        : `<button type="button" class="item" data-act="lock">Lock vault</button>`;

    return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
:root{--bg:#2b2b2b;--fg:#fff;--dim:#9a9a9a;--sep:rgba(255,255,255,.12);--hover:rgba(255,255,255,.08);
--font:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--bg);color:var(--fg);font-family:var(--font);-webkit-font-smoothing:antialiased;overflow:hidden;user-select:none}
.panel{padding:4px 0}
.item{display:block;width:100%;border:0;background:transparent;text-align:left;padding:2px 12px;min-height:20px;
color:var(--fg);font:400 13px/20px var(--font);letter-spacing:-.008em;white-space:nowrap;cursor:default}
.item:hover{background:var(--hover)}
.sep{height:1px;margin:4px 0;background:var(--sep);border:0}
.hint{padding:2px 12px 4px;font:400 12px/16px var(--font);color:var(--dim)}
.otp{display:block;width:100%;border:0;background:transparent;text-align:left;padding:1px 12px 2px;position:relative;cursor:default;color:inherit;font:inherit}
.otp:hover{background:var(--hover)}
.otp-hint{position:absolute;top:3px;right:12px;font:500 9px/1 var(--font);color:var(--dim);opacity:0;pointer-events:none}
.otp:hover .otp-hint{opacity:1}
.main-row{display:flex;align-items:center;gap:5px;min-height:18px;padding-right:48px}
.issuer,.dash,.digits{font:400 13px/18px var(--font);letter-spacing:-.008em;color:var(--fg);white-space:nowrap}
.digits{font-variant-numeric:tabular-nums;letter-spacing:.03em;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.email{font:400 10px/12px var(--font);color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.timer{width:18px;height:18px;position:relative;flex-shrink:0;margin-left:8px}
.timer svg{width:18px;height:18px;transform:rotate(-90deg);display:block}
.timer .secs{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
font:600 7px/1 var(--font);font-variant-numeric:tabular-nums;color:var(--dim)}
</style></head><body>
<div class="panel">
  <button type="button" class="item" data-act="open">Open app</button>
  <hr class="sep"/>
  ${mid}
  <hr class="sep"/>
  ${footer}
  <button type="button" class="item" data-act="about">About OTPeer Authenticator</button>
  <button type="button" class="item" data-act="quit">Quit</button>
</div>
</body></html>`;
}

const TRAY_CLICK_BIND = `(() => {
  if (window.__otpeerTrayBound) return;
  window.__otpeerTrayBound = true;
  document.addEventListener('click', (e) => {
    const t = e.target && e.target.closest && e.target.closest('[data-act], #copy');
    if (!t || !window.otpeerTray) return;
    if (t.id === 'copy') { window.otpeerTray.copyLastUsed(); return; }
    const act = t.getAttribute('data-act');
    if (act === 'open') window.otpeerTray.openApp();
    if (act === 'unlock') window.otpeerTray.unlock();
    if (act === 'lock') window.otpeerTray.lockVault();
    if (act === 'about') window.otpeerTray.about();
    if (act === 'quit') window.otpeerTray.quit();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && window.otpeerTray) window.otpeerTray.close();
  });
})()`;

export class TrayPopup {
    #win: BrowserWindow | null = null;
    #actions: TrayPopupActions;
    #state: TrayPopupState = { mode: 'locked', lastUsed: null };
    #blur_close = true;
    #focus_watch: NodeJS.Timeout | null = null;

    constructor(actions: TrayPopupActions) {
        this.#actions = actions;
        ipcMain.handle('tray-popup:openApp', () => { this.hide(); this.#actions.openApp(); });
        ipcMain.handle('tray-popup:unlock', () => { this.hide(); this.#actions.unlock(); });
        ipcMain.handle('tray-popup:lockVault', () => { this.hide(); this.#actions.lockVault(); });
        ipcMain.handle('tray-popup:about', () => { this.hide(); this.#actions.about(); });
        ipcMain.handle('tray-popup:quit', () => { this.#actions.quit(); });
        ipcMain.handle('tray-popup:close', () => { this.hide(); this.#actions.close(); });
        ipcMain.handle('tray-popup:copyLastUsed', async () => {
            await this.#actions.copyLastUsed();
            this.hide();
        });
    }

    isVisible(): boolean {
        return Boolean(this.#win && this.#win.isVisible());
    }

    hide(): void {
        this.#stopFocusWatch();
        if (!this.#win || this.#win.isDestroyed()) return;
        this.#blur_close = false;
        this.#win.hide();
        this.#blur_close = true;
    }

    async showNear(tray_bounds: Electron.Rectangle): Promise<void> {
        const win = this.#ensureWindow();
        await this.#render(win);
        const height = await this.#measureHeight(win);
        const display = screen.getDisplayNearestPoint({ x: tray_bounds.x, y: tray_bounds.y });
        const work = display.workArea;
        let x = Math.round(tray_bounds.x + tray_bounds.width / 2 - POPUP_WIDTH / 2);
        let y = Math.round(tray_bounds.y + tray_bounds.height + 4);
        if (process.platform !== 'darwin' && tray_bounds.y > work.y + work.height / 2) {
            y = Math.round(tray_bounds.y - height - 4);
        }
        x = Math.min(Math.max(work.x + 4, x), work.x + work.width - POPUP_WIDTH - 4);
        y = Math.min(Math.max(work.y + 4, y), work.y + work.height - height - 4);
        win.setBounds({ x, y, width: POPUP_WIDTH, height });
        // Prefer inactive show so we don't bounce the main window via app 'activate'.
        if (typeof win.showInactive === 'function') win.showInactive();
        else win.show();
        win.focus();
        // Delay focus-watch so initial focus can settle.
        setTimeout(() => {
            if (this.#win && this.#win.isVisible()) this.#startFocusWatch();
        }, 250);
    }

    setState(state: TrayPopupState): void {
        this.#state = state;
        if (this.#win && this.#win.isVisible() && !this.#win.isDestroyed()) {
            void this.#patchVisible(this.#win, state);
        }
    }

    destroy(): void {
        this.#stopFocusWatch();
        for (const channel of [
            'tray-popup:openApp', 'tray-popup:unlock', 'tray-popup:lockVault',
            'tray-popup:about', 'tray-popup:quit', 'tray-popup:copyLastUsed', 'tray-popup:close',
        ]) {
            ipcMain.removeHandler(channel);
        }
        if (this.#win) {
            this.#win.destroy();
            this.#win = null;
        }
    }

    #startFocusWatch(): void {
        this.#stopFocusWatch();
        // Close when another menu-bar app takes over (blur is unreliable on alwaysOnTop trays).
        this.#focus_watch = setInterval(() => {
            if (!this.#win || this.#win.isDestroyed() || !this.#win.isVisible()) return;
            if (!this.#win.isFocused()) this.hide();
        }, 200);
    }

    #stopFocusWatch(): void {
        if (this.#focus_watch) clearInterval(this.#focus_watch);
        this.#focus_watch = null;
    }

    #ensureWindow(): BrowserWindow {
        if (this.#win && !this.#win.isDestroyed()) return this.#win;
        this.#win = new BrowserWindow({
            width: POPUP_WIDTH,
            height: 160,
            show: false,
            frame: false,
            resizable: false,
            maximizable: false,
            minimizable: false,
            fullscreenable: false,
            skipTaskbar: true,
            alwaysOnTop: true,
            transparent: false,
            backgroundColor: '#2b2b2b',
            hasShadow: true,
            focusable: true,
            // Do not use type:'panel' — on macOS that drops the Dock icon while open.
            webPreferences: {
                preload: path.join(__dirname, 'tray_preload.js'),
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: false,
            },
        });
        this.#win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        if (process.platform === 'darwin') {
            this.#win.setAlwaysOnTop(true, 'floating');
        }
        this.#win.on('blur', () => {
            if (this.#blur_close) this.hide();
        });
        this.#win.webContents.on('before-input-event', (_event, input) => {
            if (input.type === 'keyDown' && input.key === 'Escape') this.hide();
        });
        this.#win.on('closed', () => {
            this.#stopFocusWatch();
            this.#win = null;
        });
        return this.#win;
    }

    async #render(win: BrowserWindow): Promise<void> {
        await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildHtml(this.#state))}`);
        await win.webContents.executeJavaScript(TRAY_CLICK_BIND);
    }

    async #patchVisible(win: BrowserWindow, state: TrayPopupState): Promise<void> {
        if (state.mode !== 'ready' || !state.lastUsed) {
            await this.#render(win);
            const height = await this.#measureHeight(win);
            const bounds = win.getBounds();
            win.setBounds({ ...bounds, height });
            return;
        }
        const last = state.lastUsed;
        try {
            await win.webContents.executeJavaScript(`(() => {
              const otp = document.getElementById('copy');
              if (!otp) return false;
              const digits = otp.querySelector('.digits');
              const secs = otp.querySelector('.secs');
              const issuer = otp.querySelector('.issuer');
              const email = otp.querySelector('.email');
              const ring = otp.querySelector('.timer circle:last-of-type');
              const code = ${JSON.stringify(last.code || '')};
              const fmt = code.length === 6 ? code.slice(0,3)+' '+code.slice(3)
                : code.length === 8 ? code.slice(0,4)+' '+code.slice(4)
                : (code || '••••••');
              if (issuer) issuer.textContent = ${JSON.stringify(last.issuer || 'Account')};
              if (email) email.textContent = ${JSON.stringify(last.email || '')};
              if (digits) digits.textContent = fmt;
              if (secs) secs.textContent = ${JSON.stringify(last.expiresIn != null ? String(last.expiresIn) : '—')};
              if (ring) {
                const p = ${JSON.stringify(Math.max(last.period || 30, 1))};
                const remaining = ${JSON.stringify(
                    last.expiresIn != null
                        ? Math.max(0, Math.min(last.expiresIn, last.period || 30))
                        : last.period || 30,
                )};
                const circ = 2 * Math.PI * 6.8;
                ring.setAttribute('stroke-dasharray', ((remaining / p) * circ).toFixed(1) + ' ' + circ.toFixed(1));
              }
              return true;
            })()`);
        } catch {
            // ignore
        }
    }

    async #measureHeight(win: BrowserWindow): Promise<number> {
        try {
            const height = await win.webContents.executeJavaScript(
                'Math.ceil(document.querySelector(".panel").getBoundingClientRect().height)',
            );
            if (typeof height === 'number' && height > 40) return height + 2;
        } catch {
            // fall through
        }
        return 160;
    }
}
