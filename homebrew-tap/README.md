# OTPeer Homebrew tap

The `otpeer-authenticator` cask lives here until the project clears
homebrew/cask's notability bar. Everything in this directory is validated but
**not yet published** — publishing is a manual step, described below.

## Why a personal tap and not homebrew/cask

homebrew/cask only accepts software that meets its
[notability requirements](https://docs.brew.sh/Acceptable-Casks#rejected-casks):
**75+ stars, 30+ forks, or 30+ watchers**. The repo currently has 0 stars, so a
PR to homebrew/cask would be closed without review. A personal tap has no such
gate and gives users a real `brew install` today.

This is the *only* reason a tap is involved at all. It is a notability
workaround, not a Homebrew requirement.

Once the repo clears 75 stars, the same cask file can be submitted to
homebrew/cask with only the header changed.

## Publishing the tap

**A separate repo is not strictly required.** The real requirement is that the
cask lives at **`Casks/` in the tap repo's root**. `brew tap user/repo` is only
a shortcut that expands to `https://github.com/user/homebrew-repo`; the
two-argument form `brew tap user/repo <URL>` taps any git URL and makes no such
assumption.

Verified locally, both cases tapped by `file://` URL:

| Cask path in repo      | Result                               |
| ---------------------- | ------------------------------------ |
| `homebrew-tap/Casks/`  | Tapped, but **0 casks found**        |
| `Casks/` (repo root)   | **"Tapped 1 cask"**, `brew info` OK  |

So the directory location is what matters, not the repo count. Two options:

### Option A — dedicated repo (recommended)

1. Create a public repo named **`homebrew-otpeer`** under `sthnaqvi`.
2. Copy `Casks/otpeer-authenticator.rb` to `Casks/` at that repo's root.
3. Commit and push to the default branch.

```sh
brew tap sthnaqvi/otpeer
brew install --cask --no-quarantine otpeer-authenticator
```

Preferred because the tap stays ~10KB, only changes on releases, and the short
`brew tap sthnaqvi/otpeer` is a command you can put on the website and in a
Show HN post without it looking like a workaround.

### Option B — reuse this repo

Move the cask to `Casks/otpeer-authenticator.rb` at the **root** of
`otpeer-authenticator` (not under `homebrew-tap/`, which Homebrew ignores).

```sh
brew tap sthnaqvi/otpeer https://github.com/sthnaqvi/otpeer-authenticator
brew install --cask --no-quarantine otpeer-authenticator
```

No new repo, but Homebrew clones the whole tap: every user pulls **~20MB** of
monorepo instead of ~10KB, and `brew update` re-fetches on every commit to
`master` rather than only on releases.

`--no-quarantine` is needed either way because the build is not Developer ID
signed. See the cask's `caveats` for the alternative `xattr -cr` route.

## Verification already performed

Against `desktop-v0.1.1`:

- `brew style --cask` — passes, no offenses.
- `brew fetch --cask` — SHA-256 verified for both `arm` and `intel`.
- `brew livecheck --cask` — correctly reads `0.1.1` from the `desktop-v0.1.1`
  tag, so future releases are detected automatically.
- Bundle inspected from the DMG: id `app.otpeer.desktop`,
  `LSMinimumSystemVersion` 12.0 (matches `depends_on macos: :monterey`),
  signature `adhoc, linker-signed` (confirms the unsigned caveat is accurate).

`brew audit --cask --new` could not be run locally: it requires up-to-date Xcode
Command Line Tools. Run it before any homebrew/cask submission.

## On each release

Update `version` and both `sha256` values:

```sh
VERSION=0.1.2
for ARCH in arm64 x64; do
  URL="https://github.com/sthnaqvi/otpeer-authenticator/releases/download/desktop-v${VERSION}/OTPeer-Authenticator-${VERSION}-${ARCH}.dmg"
  echo "${ARCH}: $(curl -sSL "$URL" | shasum -a 256 | cut -d' ' -f1)"
done
```

If the desktop build ever gains Developer ID signing + notarization, drop the
`caveats` block and reconsider `auto_updates true` — electron-updater's
Squirrel.Mac backend cannot update an unsigned bundle, which is why Homebrew
currently owns upgrades.
