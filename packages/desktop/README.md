# OTPeer Authenticator (Desktop)

Electron desktop app for **OTPeer** — two-factor codes with serverless
peer-to-peer sync. Same encrypted vault as the CLI (`authenticator-clui`).

**Website / downloads:** [https://otpeer.com](https://otpeer.com)

**Release artifacts:** [GitHub Releases](https://github.com/sthnaqvi/otpeer-authenticator/releases)
(`desktop-v*` tags)

## Download

Prefer [otpeer.com](https://otpeer.com) — it detects your OS and links the
matching installer from the latest desktop release.

| Platform | Artifact |
|---|---|
| macOS | `.dmg` (`arm64` / `x64`) |
| Windows | NSIS `-setup.exe` |
| Linux | `.AppImage` and `.deb` |

### macOS (unsigned Phase 1)

After installing an unsigned build:

```bash
xattr -cr "/Applications/OTPeer Authenticator.app"
open "/Applications/OTPeer Authenticator.app"
```

## Build from source

Install dependencies at the **monorepo root** only (`npm install` does not
apply inside this package alone).

From the repo root:

```bash
npm install
npm run desktop    # build + launch Electron app
```

Or from this package (desktop only):

```bash
npm run start      # build + launch (rebuilds core if needed)
npm run dist       # package installers locally
```

See the [root README](../../README.md) for the full command table and monorepo layout.

## Screenshots for otpeer.com

From this package after a build:

```bash
npm run capture:screenshots
```

Writes real-renderer captures to `website/public/assets/screenshot-*.png`.

## Related

- Product site: [otpeer.com](https://otpeer.com)
- CLI: [`authenticator-clui`](https://www.npmjs.com/package/authenticator-clui) / [package README](../cli/README.md)
- Shared engine: [`@authenticator/core`](../core/)
