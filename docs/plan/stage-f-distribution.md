# Stage F — Distribution polish

## Goal

Take the three working clients (CLI, Electron, RN) from "runs from source"
to "installable by a normal user," and fix the credibility gaps in the
current repo along the way.

## Items

- Fix or remove the README's misleading badges (coverage/build-status badges
  currently reference CI that doesn't reflect the actual (lack of) test
  suite) — wire up real CI now that `core` has meaningful test coverage from
  Stage A2 onward
- Drop `node-schedule` for a plain `setInterval` in the TOTP refresh loop —
  one less dependency for what's a one-line interval timer
- Bump `commander` (currently pinned old) and other stale deps in the CLI
  package
- Electron: code signing + notarization (macOS), packaging for
  `.dmg`/`.deb`/AppImage
- React Native: App Store + Play Store submission (privacy manifest, permission
  justifications for local network/Bluetooth/camera usage — reviewers will
  ask why a 2FA app wants Bluetooth/local network access, so the sync
  feature's purpose needs to be clearly stated in store listings)
- Decide on a shared product name/branding across CLI + desktop + mobile if
  they're meant to feel like one product family (open question, not blocking
  any earlier stage)

## Non-goals

- Nothing functional changes in this stage — it's packaging, CI, and
  dependency hygiene on top of already-working functionality from Stages A-E
