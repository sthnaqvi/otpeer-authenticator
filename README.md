# authenticator-clui

[![npm version](https://img.shields.io/npm/v/authenticator-clui.svg)](https://www.npmjs.com/package/authenticator-clui)
[![License: MIT](https://img.shields.io/npm/l/authenticator-clui.svg)](LICENSE)
![Downloads Monthly](https://img.shields.io/npm/dm/authenticator-clui.svg)

An open source TOTP authenticator you fully own: import your two-factor
accounts once from Google/Microsoft/Facebook Authenticator, keep them in an
encrypted local vault, and read live codes from your terminal. No cloud, no
telemetry — your secrets never leave your machine.

**👉 If you just want to use the CLI, see the
[package README](packages/cli/README.md) or the
[npm page](https://www.npmjs.com/package/authenticator-clui).** This page is
about the project as a whole: architecture, building from source, and
contributing.

![CLI Authenticator](readme_assets/cli_authenticator.png "CLI Authenticator")

## Table of contents

- [Vision](#vision)
- [Repository structure](#repository-structure)
- [Architecture](#architecture)
- [Building from source](#building-from-source)
- [Running the CLI from a checkout](#running-the-cli-from-a-checkout)
- [Testing](#testing)
- [Publishing](#publishing)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## Vision

Today this repo ships one product: the `authenticator-clui` npm package.
The goal is one authenticator, three surfaces, all sharing the same vault
logic:

| Surface | Status | Distribution |
|---|---|---|
| **CLI** (Node.js) | ✅ published | [npm](https://www.npmjs.com/package/authenticator-clui) |
| **Desktop** (Electron, macOS/Ubuntu) | 🔜 planned | GitHub Releases (`.dmg`/`.deb`) |
| **Mobile** (React Native, iOS/Android) | 🔜 planned | App Store / Play Store |

Devices will sync **peer-to-peer over local Wi-Fi/Bluetooth — no backend
server**. Each device keeps its own encrypted vault; sync is an explicit,
local, device-to-device merge.

## Repository structure

This is an npm-workspaces monorepo. The root is private and never published
— only individual packages ship to users, each through its own channel.

```
authenticator-clui/
├── package.json            workspace root (private — publishes nothing)
├── packages/
│   ├── core/                @authenticator/core — shared engine (TypeScript)
│   │   └── src/
│   │       ├── accounts.ts           vault load/save orchestration
│   │       ├── totp.ts                TOTP code generation, window timing
│   │       ├── edbase32.ts             RFC 3548 base32 encoding
│   │       ├── importers/              Google Authenticator export decoding
│   │       ├── adapters/               StorageAdapter / CryptoProvider interfaces
│   │       └── node/                    Node.js implementations of the adapters
│   └── cli/                 authenticator-clui — the published npm package
│       ├── bin.js                    command-line entry (`authenticator`, `auth`)
│       ├── core.js                    wires the vendored core to CLI storage paths
│       ├── src/                       terminal-only code (password prompt, table render)
│       └── vendor/core/               build-generated copy of core (gitignored)
├── docs/plan/               in-depth design docs, one per roadmap stage
└── readme_assets/           images used by the READMEs
```

## Architecture

The design rule that everything else follows from: **`@authenticator/core`
contains all logic that must behave identically on every platform, and it
never touches a platform API directly.** It talks to the outside world only
through two injected interfaces:

```ts
interface StorageAdapter {          // where the vault blob lives
  read(): Promise<string | null>;
  write(data: string): Promise<void>;
  delete(): Promise<void>;
  exists(): Promise<boolean>;
}

interface CryptoProvider {          // how the vault is encrypted
  encrypt(plaintext: string, password: string): string;
  decrypt(ciphertext: string, password: string): string;
}
```

Each client supplies its own implementations:

| | Storage | Crypto |
|---|---|---|
| CLI / Electron | `fs` → `~/.authenticator-clui/` | Node built-in `crypto` |
| React Native (planned) | `react-native-mmkv` | `react-native-quick-crypto` |

This is why React Native support is feasible without rewriting the engine:
RN can't run Node's `fs`/`crypto`, but it can implement these two
interfaces.

**Why core is vendored, not a published dependency:** `@authenticator/core`
is `private: true` and exists only inside this repo. The CLI's build step
copies core's compiled output into `packages/cli/vendor/core`, so the
published npm tarball is fully self-contained. This keeps core's API free
to change rapidly during early development. Once it stabilizes, it may be
published as its own package.

## Building from source

Requirements: Node.js ≥ 14, npm ≥ 7 (for workspaces support).

```bash
git clone https://github.com/sthnaqvi/authenticator-clui.git
cd authenticator-clui
npm install        # installs all workspace deps, links core into cli
npm run build      # compiles core (tsc) + vendors it into packages/cli
```

`npm run build` at the root does two things, in order:

1. `packages/core`: TypeScript → `packages/core/dist/`
2. `packages/cli`: copies `core/dist` → `packages/cli/vendor/core`

Both output directories are gitignored; they're always regenerated.

## Running the CLI from a checkout

```bash
cd packages/cli
node bin.js --help
node bin.js --import "otpauth-migration://offline?data=..."
node bin.js --run
```

The vault is written to `~/.authenticator-clui/accounts.json` — same
location as an installed copy, so be aware they share state.

## Testing

Core's test suite (Jest) is being introduced alongside the vault-format
migration work — see the [roadmap](#roadmap). Until then, the smoke test is
running the CLI flows above against a throwaway import URI.

```bash
npm test           # runs core's tests (once they land)
```

## Publishing

Only `packages/cli` is published, and only from that directory:

```bash
cd packages/cli
npm publish
```

`prepublishOnly` automatically runs the full root build first, so a publish
can never ship a stale or missing `vendor/core`. Publishing from the repo
root is blocked by design (`private: true`).

Release checklist:

1. Bump the version: `cd packages/cli && npm version minor` (or
   `patch`/`major`). Note: npm does **not** auto-commit or tag in a monorepo
   subfolder — that's step 4, and why it's listed separately.
2. `npm install` at the repo root to resync `package-lock.json`, and update
   the [package README](packages/cli/README.md) if user-facing behavior
   changed; commit.
3. `cd packages/cli && npm publish`
4. Tag the release: `git tag v<version> && git push --tags`

## Roadmap

Development is staged; each stage has an in-depth design doc in
[`docs/plan/`](docs/plan/):

| Stage | Scope | Doc |
|---|---|---|
| A1 ✅ | Extract shared core, monorepo restructure, publish hardening | [doc](docs/plan/stage-a1-extract-core.md) |
| A2 | Vault format versioning, AES-GCM upgrade, migrations, test suite | [doc](docs/plan/stage-a2-vault-migration.md) |
| B | CLI: add/remove/rename single accounts, `--list`, merge-import | [doc](docs/plan/stage-b-cli-account-management.md) |
| C | P2P sync v1: PAKE pairing, Wi-Fi/mDNS transport, LWW merge | [doc](docs/plan/stage-c-sync-protocol.md) |
| D | Electron desktop app (macOS/Ubuntu) | [doc](docs/plan/stage-d-desktop-electron.md) |
| E | React Native mobile app (iOS/Android) | [doc](docs/plan/stage-e-mobile-react-native.md) |
| F | CI, packaging, store submissions | [doc](docs/plan/stage-f-distribution.md) |

## Contributing

Contributions are welcome — bug reports, fixes, and stage work alike.

**Where things go:**

- Platform-independent logic (vault, crypto orchestration, TOTP, import
  parsing, future sync) → `packages/core`, in TypeScript, behind the
  adapter interfaces. Core must never `require` `fs`, `crypto`, or any
  platform module outside `src/node/`.
- Terminal-specific code (argument parsing, prompts, table rendering) →
  `packages/cli`.
- New platform (e.g. a new client) → new `packages/<name>` workspace that
  consumes core; don't fork core logic into a client.

**Workflow:**

1. Fork and branch from `master`
2. `npm install && npm run build`, make your change
3. Verify the CLI flows still work (`--import`, `--run`, `--delete`,
   `--encrypt` round-trip) — behavior changes to existing flags need a
   strong reason
4. Open a PR describing what changed and why; link the roadmap stage if
   your change is part of one

**Ground rules:**

- Existing users' vaults are sacred: any change to the storage location or
  file format must ship with an automatic migration (see
  [stage-a2 doc](docs/plan/stage-a2-vault-migration.md) for the pattern).
- No network calls anywhere in the codebase until Stage C, and then only
  the explicit local sync path. This project's core promise is that
  secrets stay on-device.
- Keep the published tarball auditable: `packages/cli/package.json` uses a
  `files` whitelist; if you add a runtime file, add it there deliberately.

**Reporting issues:**
[github.com/sthnaqvi/authenticator-clui/issues](https://github.com/sthnaqvi/authenticator-clui/issues)

## Security

This project handles 2FA secrets, so the bar is deliberately conservative:

- Vault encryption: AES-256 with random IV + salt per encryption, scrypt
  key derivation (an upgrade to AES-256-GCM authenticated encryption, with
  transparent re-encryption of existing vaults, is planned in Stage A2)
- No network, no telemetry, no analytics
- Found a vulnerability? Please open an issue asking for a private contact
  channel rather than posting exploit details publicly.

## License

[MIT](LICENSE) © Sayed Tauseef Naqvi
