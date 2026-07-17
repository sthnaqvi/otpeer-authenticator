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

Once the repo clears 75 stars, the same cask file can be submitted to
homebrew/cask with only the header changed.

## Publishing the tap

Homebrew resolves `sthnaqvi/otpeer` to the GitHub repo
`sthnaqvi/homebrew-otpeer` — the `homebrew-` prefix is required.

1. Create a public repo named **`homebrew-otpeer`** under the `sthnaqvi` account.
2. Copy `Casks/otpeer-authenticator.rb` into `Casks/` at that repo's root.
3. Commit and push to the default branch.

Users then install with:

```sh
brew tap sthnaqvi/otpeer
brew install --cask --no-quarantine otpeer-authenticator
```

`--no-quarantine` is needed because the build is not Developer ID signed. See
the cask's `caveats` for the alternative `xattr -cr` route.

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
