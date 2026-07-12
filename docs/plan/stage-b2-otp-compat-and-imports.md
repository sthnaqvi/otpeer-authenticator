# Stage B2 — Full OTP compatibility + competitor imports + paper backup

> **Status: ✅ implemented.** 111 tests across 9 suites (RFC 4226 Appendix D
> HOTP vectors, RFC 6238 SHA-1/SHA-256/SHA-512 vectors, Google-enum
> normalization, all three competitor parsers incl. real encrypted Aegis/2FAS
> fixtures, HOTP counter persistence). Verified end to end via CLI:
> 8-digit/60s/SHA-256 accounts render correctly (the params bug is fixed),
> HOTP `-t` calls produce the RFC vector sequence with a persisted counter,
> `steam://` accounts produce 5-char Steam codes, Aegis/2FAS/andOTP files
> import+merge with params intact, and a paper backup exported → wiped →
> restored recovers every account. One design note: HOTP generation lives on
> `AccountsStore.generateCodeFor` (not totp.ts) because it must persist the
> counter increment; the `--run` table shows HOTP rows as "(use -t to
> generate)" rather than burning counters on a timer.
>
> **Post-implementation hygiene review** (user-requested) fixed four gaps:
> the paper sheet's HTML moved from an inline string to
> `src/templates/paper-backup.html`; QR generation switched from reaching
> into `qrcode-terminal/vendor/…` internals to the *declared*
> `qrcode-generator` dependency (public API; qrcode-terminal dropped, a
> ~20-line half-block terminal renderer in `src/qr.js` replaces it); dead
> `src/log.js` (with its phantom commented `jetty` require) deleted; and
> password prompts now work on piped/non-TTY stdin via one shared line
> reader — multi-prompt flows like `printf "vaultpw\nbackuppw\nbackuppw\n" |
> auth -e sheet.html --paper` are fully scriptable (previously crashed on
> setRawMode). A fifth gap surfaced by real-world use: `--export`'s default
> filename landed in the CWD — which, when run from a checkout, put a real
> vault backup inside the open-source repo. Defaults now write to the home
> directory; an explicit path inside any git working tree gets a ⚠ warning;
> `.gitignore` additionally blocks `authenticator-backup.*` as a backstop.

Slots between B and C: independent of sync, smaller in scope, and it
strengthens core (and the market position) before the sync work begins.
Born out of the July 2026 competitor research — these are the gaps that
make switching to (or fully onto) this app hard today.

## 1. Full OTP compatibility

**Bug being fixed:** Google Authenticator imports carry `digits`,
`algorithm`, and (in otpauth URIs) `period` — but `updateTotp`/`--run`/
`--totp` currently hardcode 6 digits / 30s / SHA-1. An 8-digit or 60-second
account imports "successfully" and then renders wrong codes. Table stakes
in Aegis/Ente/2FAS.

- Honor per-account `digits` (6/7/8), `period` (15/30/60), `algorithm`
  (SHA-1/SHA-256/SHA-512) end to end: `generateTotp` already accepts
  options — the fix is plumbing account fields through `updateTotp`, the
  run view, `--totp`, `--copy`, and the otpauth importer (parse `digits=`,
  `period=`, `algorithm=` query params).
- `CryptoProvider` gains `hmac(algorithm, key, data)`; `hmacSha1` becomes a
  deprecated alias until Stage E's RN provider lands.
- **HOTP (RFC 4226):** accept `otpauth://hotp/` (currently rejected),
  persist the per-account `counter`, increment on generation.
  `--run` shows HOTP accounts with a "press to generate" hint rather than a
  countdown; `--totp <name>` generates and bumps the counter.
- **Steam Guard:** 5-character alphanumeric alphabet mode
  (`steam://` secrets / `type: STEAM`), as Aegis and Ente support.
- Per-interval expiry display: the run view's countdown currently assumes
  30s for all rows (`getTimeout()` global) — becomes per-account.

Tests: RFC 6238 SHA-256/512 vectors, RFC 4226 HOTP vectors, Steam known
pairs, importer parsing of digits/period/algorithm.

## 2. Competitor imports (kill the lock-in pain)

Parsers in `packages/core/src/importers/`, auto-detected by
`--import <file>` (same detection chain that today distinguishes backup
files from URIs), merged through the existing `merge()` machinery:

- **Aegis** JSON export — plain and encrypted (scrypt + AES-256-GCM; our
  CryptoProvider already speaks both primitives)
- **2FAS** backup file (plain + encrypted variants)
- **andOTP** JSON export

Each parser maps to `OtpAccount` and goes through the same merge/conflict
rules as Stage B. Import from Authy is deliberately out of scope (no
sanctioned export exists — that's *their* lock-in, and exactly why users
switch to apps like this one).

## 3. Paper backup sheet

`auth --export --paper [file.html]`: renders the **encrypted** backup
(same format as `--export`) as QR code(s) in a printable self-contained
HTML file — offline, fireproof-safe disaster recovery that no competitor
CLI offers. Restore: scan with the mobile app (Stage E) or point
`--import` at the decoded payload. Reuses `qrcode-terminal`'s underlying
QR generation or embeds the QR as SVG; the backup password chosen at
export time remains the only key — a found sheet without the password is
useless.

## Non-goals

- No permission additions on any platform (see Stage C's permissions
  budget — camera-based restore already exists in the Stage E scope)
- No new dependencies beyond what's already shipped; encrypted competitor
  formats are decoded with in-repo crypto
