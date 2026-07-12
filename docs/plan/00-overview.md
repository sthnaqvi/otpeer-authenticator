# authenticator-clui — multi-platform evolution plan

## Vision

Today: a single npm CLI package (`authenticator-clui`) that imports TOTP accounts
from a Google/Microsoft/Facebook Authenticator export URI, optionally encrypts
them with a password, and displays live-refreshing codes in a terminal table.

Future: the same account vault, usable from three surfaces —

- CLI (current, Node.js)
- Desktop app for Mac/Ubuntu (Electron)
- Mobile app for iPhone/Android (React Native)

— kept in sync **peer-to-peer over the local network, QR-paired, with no backend
server**. Each device holds its own encrypted vault; sync is an explicit,
local, device-to-device operation, not a hosted service.

## Why a monorepo with a shared core

React Native cannot use Node's `fs` or `crypto` modules or `protobufjs`
directly. If account storage, encryption, TOTP generation, and the Google
Authenticator import logic stay embedded in `bin.js` the way they are today,
every future client (Electron, RN) would end up re-implementing — and
re-securing — the same logic independently. Instead:

```
packages/
  core/      TypeScript, platform-agnostic: accounts, encryption, TOTP/HOTP,
             import, sync protocol. No direct fs/crypto/BLE calls — only
             through injected interfaces.
  cli/       today's authenticator-clui, refactored to consume @authenticator/core
  desktop/   Electron + React UI, Mac/Ubuntu
  mobile/    React Native UI, iOS/Android
```

`core` depends on two seams supplied by each platform:

- **`StorageAdapter`** — read/write the vault blob. `fs-extra` on CLI/Electron,
  `react-native-mmkv` on mobile.
- **`CryptoProvider`** — AES-256-GCM encrypt/decrypt + scrypt key derivation.
  Node's built-in `crypto` on CLI/Electron; a portable or natively-bridged
  implementation (e.g. `react-native-quick-crypto`) on mobile.

Get these two interfaces right once and all three UIs share the exact same
account model, encryption, TOTP/HOTP generation, and sync logic — only
rendering and adapter wiring differ per platform.

Tooling: **npm workspaces**. The project is small enough that Nx/Turborepo
would be premature — revisit only if build orchestration actually becomes
painful.

## Stage list

| Stage | One-line scope | Depth doc |
|---|---|---|
| A1 ✅ | Extract current logic into `packages/core`, zero behavior change | [stage-a1-extract-core.md](stage-a1-extract-core.md) |
| A2 ✅ | Vault versioning + migrations (storage path, GCM upgrade, id/timestamps) | [stage-a2-vault-migration.md](stage-a2-vault-migration.md) |
| B ✅ | CLI: single-account CRUD, code/copy/qr/export, otplib removal | [stage-b-cli-account-management.md](stage-b-cli-account-management.md) |
| B2 ✅ | Full OTP compatibility (8-digit/60s/SHA-256/HOTP/Steam), backup imports, paper backup | [stage-b2-otp-compat-and-imports.md](stage-b2-otp-compat-and-imports.md) |
| C ✅ | Sync v1: QR-paired high-entropy code, direct TCP, LWW merge, minimal permissions | [stage-c-sync-protocol.md](stage-c-sync-protocol.md) |
| C2 ✅ | Rebranding: OTPeer product family, ASO/store naming, marketing plan | [stage-c2-rebranding.md](stage-c2-rebranding.md) |
| D | Electron desktop app "OTPeer Authenticator" | [stage-d-desktop-electron.md](stage-d-desktop-electron.md) |
| E | React Native mobile app "OTPeer Authenticator" | [stage-e-mobile-react-native.md](stage-e-mobile-react-native.md) |
| F | Distribution polish, CI, packaging | [stage-f-distribution.md](stage-f-distribution.md) |
| G | Browser extension via desktop-app native messaging (outline) | [stage-g-browser-extension.md](stage-g-browser-extension.md) |

## Cross-cutting non-goals (v1)

- No relay/internet sync when devices can't reach each other on a local
  network — pure local-first, matching the explicit "no backend" requirement.
- No multi-user / shared-vault concept — one vault per device identity, synced
  copies, not a shared server-side record.
- No changes to the public CLI command surface in Stage A — `--import`,
  `--encrypt`, `--delete`, `--run`, `--force` keep working exactly as they do
  today until Stage B adds new flags alongside them.

## Existing-user compatibility

`authenticator-clui` is a published npm package with real installs. Every
stage that touches on-disk format or storage location must ship a transparent
migration (see Stage A2) — never a silent break for people already using it.
