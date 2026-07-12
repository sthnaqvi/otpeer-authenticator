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
- ~~Drop `node-schedule`~~ ✅ done early (Stage A1 publish-readiness review);
  ~~otplib~~ ✅ removed in Stage B; ~~protobufjs audit~~ ✅ fixed in the
  post-B hotfix (PR #8)
- Bump `commander` (currently pinned old) and any remaining stale deps in
  the CLI package
- Electron: code signing + notarization (macOS), packaging for
  `.dmg`/`.deb`/AppImage — artifacts named **"OTPeer Authenticator"** per
  Stage C2
- React Native: App Store + Play Store submission as **"OTPeer
  Authenticator"**, using the exact title/subtitle/keyword-field/short-
  description text specified in [stage-c2-rebranding.md](stage-c2-rebranding.md)
  (privacy manifest, permission justifications for camera + iOS
  local-network usage per Stage C's permissions budget — reviewers will ask
  why a 2FA app wants local network access, so the local-sync purpose needs
  to be clearly stated; the deliberately tiny permission set is itself a
  review-friendliness and marketing point). F-Droid submission alongside
  Play (Stage E branding section).
- ~~Decide on a shared product name/branding~~ ✅ decided in **Stage C2:
  OTPeer** — this stage executes the remaining branding mechanics: publish
  the `otpeer` npm alias package (thin wrapper re-exporting
  `authenticator-clui` so both names install the same CLI), point
  `otpeer.app` at the repo/landing page, alternativeto.net + GitHub topics
  (`authenticator`, `totp`, `2fa`, `otp`) listings per the C2 marketing plan

## Non-goals

- Nothing functional changes in this stage — it's packaging, CI, and
  dependency hygiene on top of already-working functionality from Stages A-E
