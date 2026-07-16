# Stage C2 — Rebranding: OTPeer

> **Status: ✅ decided and applied in-repo** (July 2026). Brand: **OTPeer**.
> The GitHub repo rename to `otpeer-authenticator` is a one-click owner
> action (checklist below); everything else in this doc is done.

## Why rebrand, and why now

`authenticator-clui` names a *CLI implementation detail*, not a product —
meaningless on an App Store listing and invisible to store search. With
desktop (Stage D) and mobile (Stage E) coming, the family needs one brand,
decided *before* store assets, URI schemes, and marketing surfaces exist.

## Naming research (July 2026)

**Market pattern:** virtually every significant authenticator app uses a
short distinctive brand + the "Authenticator" keyword suffix, and at least
one well-known project renamed *away* from a purely generic name — generic
names are unsearchable and cannot be trademarked. The suffix is not lack of
imagination: **the app title is the heaviest-weighted field in both
stores' search ranking**, and "authenticator" is the query every user
types.

**Candidates audited** (npm registry, GitHub users/repos, web/product
search, .app/.com DNS):

| Name | npm | GitHub | Domains | Product collisions |
|---|---|---|---|---|
| **OTPeer** | ✓ free | ✓ free | ✓ otpeer.com free | none found |
| Keyfold | ✓ free | — | ✓ free | none found |
| Vaultkin | ✓ free | — | ✗ .app taken | none |
| Tessera | ✗ taken | — | — | data-privacy co. |
| Authmesh | ✗ taken | — | — | identity-space usage |

**Decision: OTPeer** — the only candidate whose brand half *contains a
searched keyword* (OTP, with Play-store prefix matching on title tokens)
and whose second half names the differentiator (peer-to-peer sync).
Runner-up was Keyfold (warmer, zero keyword value).

## The naming stack

| Surface | Name |
|---|---|
| Product family / repo | **OTPeer** · `github.com/sthnaqvi/otpeer-authenticator` |
| App Store title | `OTPeer Authenticator` (20 chars of the 30 limit) |
| Apple subtitle (30 ch) | `2FA codes · offline P2P sync` |
| Apple hidden keyword field | `totp,otp,two factor,2fa,backup,offline,no account,sync` |
| Play short description | two-factor authentication, TOTP, offline, no account, sync without cloud |
| Desktop app | `OTPeer Authenticator` — app bundle "OTPeer Authenticator.app", `.dmg`/`.deb` artifacts and window title carry the same full name (one identical name across desktop + mobile is the established cross-platform pattern; recognition compounds) |
| npm CLI package | **stays `authenticator-clui`** — 5+ years of installs/history don't transfer across npm renames; publish `otpeer` as a thin alias package in Stage F, deprecate-in-favor much later if ever |
| CLI binaries | stay `auth` / `authenticator` |
| Sync URI scheme | `authsync://` stays for SYNC/1; revisit `otpeer://` only with SYNC/2 (no protocol churn for branding) |

Repo name includes the `-authenticator` suffix deliberately: GitHub repo
search weights names the way store search weights titles, and the bare
`otpeer` name is kept free for a future GitHub **organization**.

## Marketing / ASO strategy (the "auto-sell" plan)

Reality check first: title keywords alone don't outrank Google/Microsoft
Authenticator for the head term — ranking = keywords × downloads × ratings.
The zero-budget growth channel is the **long-tail searches where this
product is genuinely the best answer**, plus open-source surfaces:

- Long-tail keywords to own (title/subtitle/description placement):
  "authenticator offline", "2fa no account", "authenticator sync without
  cloud", "authenticator with desktop app", "authenticator import backup"
- **F-Droid listing** for Android (the proven organic channel for
  open-source authenticators), GitHub topics (`authenticator`, `totp`,
  `2fa`, `otp`), alternativeto.net entries
- **Tone rule for every public surface: describe our own properties, never
  name or criticize other apps.** Negative-comparative marketing damages
  an open-source project's standing in the community (and store keyword
  fields prohibit competitor names anyway). Import compatibility may name
  formats factually — "imports Aegis/2FAS/andOTP backup files" is interop
  documentation, not comparison — and that is the only context other
  projects appear in.
- The differentiators to repeat verbatim on every surface: *no cloud, no
  account, no tracking; CLI + desktop + mobile; syncs peer-to-peer on your
  own network; imports your existing backups; printable paper backup*
- Store-listing screenshots = the live terminal table, the sync QR pairing
  moment, and the paper backup sheet — features nobody else can screenshot

## Owner checklist (account actions only you can do)

1. **Register `otpeer.com` immediately** — verified unregistered July 2026;
   clean names get sniped once public. Canonical product domain is
   **https://otpeer.com** only.
2. **Rename the repo**: GitHub → `authenticator-clui` → Settings → rename to
   `otpeer-authenticator`. GitHub redirects the old URL, clones, and remotes
   forever. Then locally:
   `git remote set-url origin https://github.com/sthnaqvi/otpeer-authenticator.git`
3. **Trademark sanity**: USPTO/IP-India search for "OTPeer" before store
   submission (npm/GitHub/DNS/store checks done; trademark DBs not).
4. **npm**: next `npm publish` picks up the updated `repository`/`homepage`
   URLs from this stage automatically — no other npm action needed now.
5. When Stage E nears submission: register the store developer accounts and
   claim the app name early (both stores allow name reservation).
