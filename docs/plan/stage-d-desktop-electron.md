# Stage D — Electron desktop app: "OTPeer Authenticator" (Mac/Ubuntu/Windows)

> **Status: ✅ desktop app + OTPeer design language complete (July 2026).**
> `packages/desktop` is a working Electron + React app over the vendored
> core. Vault, sync, import/export, tray, auto-lock, opt-out updates, and
> the locked OTPeer theme (accounts → Add) are implemented and smoke-tested.
> Next: packaging channels per
> [stage-d-deployment-channels.md](stage-d-deployment-channels.md)
> (Stage F handles signed store distribution). Packaging config
> (dmg/AppImage/deb/nsis) is written; notarization and store PRs remain
> deferred.

## Goal

Thin GUI over `packages/core` (vendored at build time into `vendor/core`,
same pattern as the CLI). Because Electron's main process is Node.js, this
stage reuses the CLI/Node `StorageAdapter`, `CryptoProvider`, and sync
(`node-sync.ts`) implementations directly — no bridging layer needed,
unlike mobile. Windows is included (user decision, July 2026): Electron
makes the third platform nearly free from one codebase, and it's the
largest desktop pool. Distribution strategy lives in
[stage-d-deployment-channels.md](stage-d-deployment-channels.md).

## Branding

The app is **"OTPeer Authenticator"** everywhere the user sees a name: app
bundle, window title, `.dmg`/`.deb`/AppImage/NSIS artifact names, About
dialog, and (after the macOS **dev** brand patch) the menu bar / Touch ID
host. Product ID / bundle identifier: `app.otpeer.desktop`.

**Logo:** A5 shield + three bars (authenticator mark) with OTPeer /
AUTHENTICATOR lockup. Production assets: `packages/desktop/build/`
(app icon, tray) and `src/renderer/assets/` (mark, favicon). OTPeer accent
`#5B9FD4` / `#4b8bd6` on charcoal (`#121212` / `#1A1D21`). No
telemetry; the brand promise applies to the app shell (see Updates for the
one disclosed exception).

Dev-only: `scripts/brand_electron_dev.js` renames/patches the local
`Electron.app` → `OTPeer Authenticator.app`, swaps the icon, and ad-hoc
codesigns so menu bar / Touch ID / dock don't say "Electron" during
`npm start`. Packaged builds get identity from electron-builder.

## Shape

```
packages/desktop/
  package.json                 "OTPeer Authenticator" · electron-builder
  electron/
    main.ts                    window, tray, IPC, auto-lock, biometric seal,
                               branded native dialogs, issuer-icon IPC
    vault-service.ts           ALL vault/sync logic — pure Node (smoke-tested)
    preload.ts                 contextBridge typed API surface
    issuer_icons.ts            bundled badge resolve + optional network fill
  src/renderer/
    App.tsx                    React UI (shell, unlock, accounts, dialogs)
    IssuerAvatar.tsx           white-circle issuer badges
    styles.css                 OTPeer theme + drawer / unlock / empty
    qr_scan.ts                 QR decode (camera / image / screen)
    assets/                    mark, favicon
  build/                       icons, tray, issuer PNG badges
  scripts/
    brand_electron_dev.js      macOS Info.plist + icon rebrand for npm start
    generate_brand_assets.py   A5 → build/ icons + renderer mark/favicon
    generate_issuer_badges.js  Simple Icons → build/issuers/*.png
    smoke.js                   headless VaultService smoke
  vendor/core/                 build-copied from packages/core (gitignored)
```

UI reference mockups + step reviews: [`docs/plan/ui-samples/`](ui-samples/).

## Architecture rules

- **Main process owns everything sensitive**: vault password (in memory,
  post-unlock), decrypt, file I/O, sync sockets, Touch ID sealed secret
  (`safeStorage`). `contextIsolation: true`, `nodeIntegration: false`,
  strict CSP, external navigation blocked.
- **`vault-service.ts` has zero electron imports** — headless smoke can
  drive the exact production engine.
- **Renderer sees display data only**: names/ids/codes/expiry — never
  secrets, vault password, or ciphertext. Confirms use
  `dialog.showMessageBox` with the app icon (not `window.confirm`).
- **Shared vault**: same `~/.authenticator-clui/accounts.json` (+ legacy
  path migration) as the CLI. CLI and desktop are one vault, two views.
- **Auto-lock**: OS lock/suspend (`powerMonitor`) + idle timeout; tray and
  renderer listen for `vault:locked`.

## Feature scope (v1) — implemented

### Vault & security

- Unlock screen for encrypted vaults (A5 mark + OTPeer / Authenticator,
  lock + eye field, Unlock button). Soft session lock for plaintext vaults.
- **Set / change / remove vault password** (encrypt or clear on-disk AES
  via `AccountsStore.setPassword` in `packages/core`). First Lock on a
  plaintext vault prompts set-password first.
- **Touch ID unlock** (macOS): password sealed with `safeStorage`; enable
  from Settings or the set-password dialog checkbox; unlock UI prefers
  fingerprint with password fallback; enable seals without an extra Touch ID
  prompt (prompt only when unlocking).
- Auto-lock on idle / screen lock / suspend; lock clears session password.

### Accounts UI (OTPeer theme)

- Fixed portrait window **400×680** (not resizable / maximizable /
  fullscreenable)
- Left hamburger, centered **Accounts**, search
- Account cards: issuer avatar, name / email, accent OTP, ring timer, ⋮ menu
- Floating accent **＋** FAB for Add
- Empty vault: illustration + “No accounts yet — tap ＋ to add or open menu
  to import or sync.” ([`otpeer-design-07-empty.png`](ui-samples/otpeer-design-07-empty.png))
- **Issuer badges**: white-circle PNGs under `build/issuers/` (Simple Icons
  pipeline); Amazon vs AWS marks; letter-circle fallback. Prefer bundled
  files; network fetch only to fill cache when needed

### Drawer (otpeer-design-09)

- ~150px left drawer (push layout — main column shifts; no dim overlay)
- Compact account cards while open
- Items: Sync, Import, Export, Settings, Lock, About (press flash only — no sticky active)
- Brand row: mark + OTPeer / AUTHENTICATOR

### Add / Import / Export / Sync / Settings

- Add: camera / image / screen QR scan for `otpauth://` (new 2FA setup,
  then verify panel with live codes) and `otpauth-migration://` (other
  authenticator export); paste URI or manual name / issuer / secret;
  link to Import for OTPeer / competitor backups
- Remove / rename (tombstones intact for sync)
- Import: file picker (OTPeer / Aegis / 2FAS / andOTP) + URI paste;
  password when backup encrypted
- Export: always-encrypted JSON backup (double password)
- Sync: host QR + IP:port + pairing code; join via camera / image / screen
  scan or URI / host:port; merge-summary confirm before write.
  Opening `authsync://` from a browser is deferred (no OS protocol handler yet).
- Settings: full-page OTPeer theme list — auto-update toggle, auto-lock minutes,
  Check now, vault password + Touch ID, About (version / MIT / chevron)

### Tray / menus

- Close hides to tray (macOS Dock icon retained)
- Unlocked: up to five accounts for one-click code copy
- Locked: Show / Unlock… / Quit
- App menu + About with OTPeer icon

## OTPeer design mockup plan (step review)

Locked references in [`ui-samples/`](ui-samples/):

| Step | Target | Status |
|------|--------|--------|
| 1 Logo | A5 shield lockup | ✅ |
| 2 Accounts | `otpeer-design-01b-accounts.png` | ✅ |
| 3 Drawer | `otpeer-design-09-drawer-full.png` | ✅ |
| 4 Unlock | `otpeer-design-03-unlock.png` | ✅ (+ Touch ID / password flows) |
| 5 Empty | `otpeer-design-07-empty.png` | ✅ |
| 6 Sync | `otpeer-design-04-sync.png` | ✅ |
| 7 Settings | `otpeer-design-05-settings.png` | ✅ |
| 8 Add | `otpeer-design-06-add.png` | ✅ |

## Updates (user decision: auto-check with opt-out)

`electron-updater` checks GitHub Releases on launch, installs on consent;
Settings toggle disables it. **Disclosure**: this is the app's only
automatic outbound connection (sync is user-initiated); stated in Settings,
About, and README. Store-channel builds use `OTPEER_DISABLE_UPDATER=1`.

## Verification

- `npm run smoke` (desktop): unlock → add TOTP/HOTP/8-digit → HOTP RFC-4226
  vectors → rename → tombstone remove → export/import → localhost sync
  converge → **encrypt / lock password gate / clear password**
- `npm start`: build + `brand_electron_dev` + Electron
- Core: `AccountsStore.setPassword` encrypt + clear covered by unit tests
- Manual: CLI + desktop on the same vault; Lock / Touch ID / empty / drawer

## Non-goals

- No redesign of vault format or sync protocol — GUI over proven APIs only
- No code signing / notarization / store submissions here — Stage F
  executes the [deployment-channels plan](stage-d-deployment-channels.md)
- No global shortcuts or browser-extension host yet (Stage G)
- Paper backup HTML remains CLI-only in v1
