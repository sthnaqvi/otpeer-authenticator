# Stage D — Desktop deployment channels ("OTPeer Authenticator")

Reference for distributing the desktop app. **Channels are ordered by
expected user gain** — realistic reach × audience fit for a privacy-focused
open-source 2FA app × effort-to-value — not by raw platform size. That's
why free open-source-native channels outrank the paid app stores: they're
where this app's audience actually looks, and their cost is a pull request.

Per the Stage C2 tone rule, this doc evaluates *platforms and stores*, never
other apps.

## Ranked rollout

| # | Channel | Platform | Phase |
|---|---------|----------|-------|
| 1 | GitHub Releases | all | 1 |
| 2 | Homebrew Cask | macOS | 1 |
| 3 | Flathub | Linux | 1 |
| 4 | winget | Windows | 1 |
| 5 | Snap Store | Linux (Ubuntu) | 2 |
| 6 | AppImage | Linux | 2 (free by-product) |
| 7 | Scoop / Chocolatey | Windows | 2 (community) |
| 8 | AUR | Arch Linux | 2 (community) |
| 9 | Microsoft Store | Windows | 3 (optional) |
| 10 | Mac App Store | macOS | 3 (probably never) |

---

### 1. GitHub Releases — all platforms · Phase 1

**How:** `electron-builder --publish` uploads `.dmg`, `.AppImage`, `.deb`,
and NSIS `.exe` plus the update metadata files (`latest*.yml`) to a tagged
release. This is also `electron-updater`'s backend, so shipping here IS the
auto-update infrastructure.

- **Pros:** free; instant; no gatekeeper or review; the default download
  location for open-source/developer audiences; powers auto-update;
  version history + changelogs built in.
- **Cons:** zero discovery — users must already know the repo; macOS build
  still needs notarization (see below) or Sequoia's Gatekeeper puts users
  through a 3-click System Settings dance that reportedly costs 40–60% of
  install-to-first-run conversions; unsigned Windows builds hit SmartScreen
  warnings until reputation accrues.
- **Cost:** $0 (+$99/yr Apple Developer for notarization when ready).
  **Effort:** low — config only. **Updates:** electron-updater.

### 2. Homebrew Cask — macOS · Phase 1

**How:** after the first notarized GitHub release, open a PR to
`Homebrew/homebrew-cask` with a cask formula pointing at the `.dmg` URL +
sha256. Version bumps are automatable (`brew bump-cask-pr`, or Homebrew's
autobump once established).

- **Pros:** THE channel for the terminal-literate audience that already
  uses the CLI (`brew install --cask otpeer-authenticator` next to their
  existing tools); free; searchable via `brew search authenticator`;
  no Apple store fees or review.
- **Cons:** macOS-only; requires the notarized artifact to exist first;
  cask acceptance wants a functioning homepage + real release.
- **Cost:** $0. **Effort:** low (one PR). **Updates:** `brew upgrade`
  (disable electron-updater's auto-install in this build? Not needed —
  cask installs the same GitHub artifact, updater stays coherent).

### 3. Flathub — Linux · Phase 1

**How:** write a Flatpak manifest (`app.otpeer.desktop.yml`,
`org.freedesktop.Platform` runtime + the Electron zip as a module), plus
AppStream metadata (`metainfo.xml` — descriptions, screenshots) and submit
via PR to `flathub/flathub`. After acceptance, updates are PRs to your
app's own Flathub repo (bot-automatable).

- **Pros:** the de-facto Linux app store — ~4.3B downloads across ~3,500
  apps (2026), preinstalled/default on Fedora, Mint, elementary, Steam
  Deck and most non-Ubuntu distros; community-governed, no vendor lock-in;
  real search discovery (`authenticator` queries!); permissions model
  matches our minimal-permission story.
- **Cons:** manifest + AppStream metadata is real up-front work; sandbox
  needs `--share=network` for sync (fine — declared, visible, honest);
  review queue takes days-weeks.
- **Cost:** $0. **Effort:** medium. **Updates:** Flathub's own updater —
  electron-updater must be disabled in this build (build flag).

### 4. winget — Windows · Phase 1

**How:** after the first GitHub release with an NSIS installer, PR a
manifest (identifier `OTPeer.Authenticator`, installer URL + sha256) to
`microsoft/winget-pkgs`. `wingetcreate update` automates bumps.

- **Pros:** ships built into Windows 10/11 (`winget install
  otpeer-authenticator`); free; no store review beyond manifest validation;
  fast-growing default for exactly the technical audience that starts with
  a CLI-adjacent product; largest desktop OS pool unlocked for one
  manifest.
- **Cons:** SmartScreen still warns on the unsigned installer itself until
  a code-signing cert (~$100–400/yr, or reputation slowly accrues);
  non-technical Windows users don't use winget.
- **Cost:** $0 (cert optional/deferred). **Effort:** low. **Updates:**
  `winget upgrade` + electron-updater both work.

### 5. Snap Store — Linux (Ubuntu) · Phase 2

**How:** `snapcraft.yaml` (electron-builder can emit a snap target),
register the name, `snapcraft upload` to Canonical's store.

- **Pros:** default store on stock Ubuntu — big install base that never
  adds Flathub; automatic updates; free.
- **Cons:** Canonical-controlled, closed-source backend, single-vendor
  channel (no self-hosting); strict confinement can fight LAN sync
  (`network` + `network-bind` plugs needed and reviewed); parts of the
  Linux community actively avoid snaps — lower goodwill per install than
  Flathub for a FOSS-audience app.
- **Cost:** $0. **Effort:** medium. **Updates:** snapd (disable
  electron-updater in this build).

### 6. AppImage — Linux · Phase 2 (free by-product)

**How:** already produced by the electron-builder config; attach to GitHub
Releases. Optionally list on AppImageHub.

- **Pros:** zero-install single file, runs on any distro, no daemon,
  beloved by the "just give me a binary" crowd; costs nothing extra.
- **Cons:** no discovery, no auto-update path unless electron-updater
  handles it (it can, via `latest-linux.yml`); no sandboxing story.
- **Cost/Effort:** $0 / none. **Updates:** electron-updater.

### 7. Scoop / Chocolatey — Windows · Phase 2 (community)

**How:** Scoop: PR a JSON manifest to `ScoopInstaller/Extras`. Chocolatey:
`.nuspec` + push to community repo (moderated).

- **Pros:** the Windows dev/power-user package managers; Scoop especially
  overlaps our CLI audience; free.
- **Cons:** smaller reach than winget now; Chocolatey moderation queue;
  two more manifests to bump each release (automatable).
- **Cost:** $0. **Effort:** low each. **Updates:** their own upgrade
  commands.

### 8. AUR — Arch Linux · Phase 2 (community)

**How:** publish a `PKGBUILD` (`otpeer-authenticator-bin` wrapping the
.deb/AppImage). Often the community creates this unprompted — adopt or
bless it rather than duplicate.

- **Pros:** Arch users punch far above their weight in FOSS advocacy and
  bug reports; effectively zero maintenance if flagged out-of-date by bots.
- **Cons:** tiny absolute numbers; AUR trust model means you should own
  the package name early.
- **Cost/Effort:** $0 / low. **Updates:** AUR helpers.

### 9. Microsoft Store — Windows · Phase 3 (optional)

**How:** MSIX packaging (electron-builder `appx` target), one-time $19
individual developer fee, store review.

- **Pros:** real consumer discovery + trusted install path + auto-updates;
  silences SmartScreen entirely.
- **Cons:** MSIX packaging quirks with Electron; review cycles; the
  consumer audience it unlocks mostly overlaps Stage E's mobile launch
  anyway.
- **Cost:** $19 once. **Effort:** medium. **Updates:** Store-managed
  (disable electron-updater in this build).

### 10. Mac App Store — macOS · Phase 3 (probably never)

**How:** MAS build (`mas` target), full App Sandbox entitlements, App
Review, $99/yr (same membership as notarization).

- **Pros:** consumer discovery; the only channel some managed-Mac users
  can install from.
- **Cons (decisive):** App Sandbox restricts exactly what makes this app
  special — LAN sync sockets need temporary-exception entitlements
  reviewers dislike, and Stage G's native-messaging host is effectively
  incompatible with MAS distribution; 30% fee applies only to paid apps
  (ours is free) but review friction is real; Homebrew + notarized direct
  download already serve the mac audience that would find us.
- **Cost:** $99/yr (already paid if notarizing). **Effort:** high.
  **Verdict:** revisit only if user demand appears.

---

## The one unavoidable paid dependency

**Apple Developer Program, $99/yr** — required for notarization, which
Sequoia has made effectively mandatory for direct macOS distribution
(unnotarized = 3-click Settings bypass and a reported 40–60% conversion
loss). It gates channels #1(mac)/#2/#10. Everything else in Phase 1 is $0.
Windows code-signing (~$100–400/yr) is deferrable: winget + SmartScreen
reputation accumulate without it.

## Release pipeline (Stage F wires this into CI)

1. `npm version` bump → tag → CI builds mac/linux/win artifacts
2. electron-builder publishes artifacts + `latest*.yml` to the GitHub
   release (channel #1 live, auto-update live)
3. Bots/PRs bump: cask (#2), Flathub manifest (#3), winget (#4), then
   Phase-2 manifests
4. Store-channel builds (Flathub/Snap/MS Store) built with
   `OTPEER_DISABLE_UPDATER=1` so only the store updates them

Sources gathered during planning: Electron distribution docs,
electron-builder docs, Flathub 2026 statistics and ecosystem reporting,
macOS Sequoia notarization/Gatekeeper friction reporting.
