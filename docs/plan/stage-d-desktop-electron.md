# Stage D — Electron desktop app: "OTPeer Authenticator" (Mac/Ubuntu)

## Goal

Thin UI over `@authenticator/core`. Because Electron's main process *is*
Node.js, this stage reuses the CLI/Node `StorageAdapter` and `CryptoProvider`
implementations directly — no bridging layer needed, unlike mobile.

## Branding (per Stage C2)

The app is **"OTPeer Authenticator"** everywhere the user sees a name: app
bundle (`OTPeer Authenticator.app`), window title, `.dmg`/`.deb`/AppImage
artifact names, and the About dialog. One full name across desktop and
mobile — the established cross-platform pattern — so store and desktop
recognition reinforce each other. Product ID / bundle identifier:
`app.otpeer.desktop` (assumes otpeer.app registered — see the C2 owner
checklist). No telemetry, no update pings without consent — the brand
promise applies to the app shell too.

## Shape

```
packages/desktop/
  package.json          Electron + React
  src/main/              Electron main process — owns the vault (StorageAdapter,
                          CryptoProvider, sync networking), same as the CLI does
  src/renderer/           React UI — account list, live codes, add/remove/rename,
                          sync pairing flow (show/enter the one-time pairing code)
  src/preload.ts          IPC bridge exposing a narrow, typed API from main to
                          renderer (never expose raw fs/crypto to the renderer)
```

Sensitive operations (decrypt, sync networking) stay in the main process;
the renderer only ever sees decrypted account display data over IPC, never
the vault password or raw ciphertext handling.

## Scope for this stage

- Account list view with live-refreshing codes (equivalent of `--run`)
- Add/remove/rename accounts (equivalent of Stage B's CLI flags, as UI)
- Import flow (paste or file-drop the Google Authenticator export URI)
- Sync UI: "Pair with another device" → shows the `authsync://` pairing
  code/QR from Stage C (or accepts a pasted one), then a merge confirmation
  before applying
- Password prompt / vault unlock screen on launch if encrypted

## Non-goals

- No redesign of the vault format or sync protocol — this stage only wires
  UI to APIs that already exist and were proven via the CLI in Stages A-C
- No auto-updater / code signing / notarization setup yet — that's Stage F
