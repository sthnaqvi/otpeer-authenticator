# Stage B — CLI account management + otplib removal

> **Status: ✅ implemented.** Scope grew substantially from the original
> draft after review + user selection (see "Scope evolution" below): besides
> single-account CRUD it now covers the otplib removal, `--code`/`--copy`,
> encrypted backups, `otpauth://` import, terminal QR, `--list --json`, and
> `--info`. All behavior is covered by core unit tests plus end-to-end CLI
> runs against a sandboxed `$HOME`.

## Scope evolution

The original draft covered add/remove/rename/`--list`/merge only. Two things
expanded it:

1. **otplib deprecation.** `npm install -g authenticator-clui` printed:

   ```
   npm warn deprecated @otplib/plugin-crypto@12.0.1: Please upgrade to v13 of otplib...
   npm warn deprecated @otplib/plugin-thirty-two@12.0.1: Please upgrade to v13 of otplib...
   npm warn deprecated @otplib/preset-default@12.0.1: Please upgrade to v13 of otplib...
   ```

   Options considered: upgrade to otplib v13 (maintained, noble/scure-based)
   vs. self-implement RFC 6238. **User chose self-implementation**: TOTP is
   ~40 lines on top of HMAC-SHA1, and for a security tool a zero-dependency,
   fully auditable implementation tested against the RFC 6238 Appendix B
   vectors beats a dependency. `hmacSha1` joined the `CryptoProvider`
   interface (platform crypto seam — RN implements it via quick-crypto
   later); base32 `decode()` joined `edbase32.ts`. A parity fixture captured
   from otplib v12 before removal proves identical codes.

2. **User-selected features** (all accepted from the review's suggestions):
   `--code` (print once, script-friendly), `--copy` (clipboard via native
   pbcopy/xclip/wl-copy/clip — no dependency), `--export`/backup-file import
   (encrypted portable backups), `--add` via `otpauth://` URI, `--list
   --json`, `--qr` (terminal QR via qrcode-terminal — the one new
   dependency), `--info`.

## Design rules (from the pre-implementation review)

- **Ambiguity:** matchers accept an account `name`, the `issuer(name)`
  display form, or an **id prefix**. Multiple matches → error listing
  candidates with id prefixes (an exact `issuer(name)` match wins over name
  collisions). Implemented in `AccountsStore.matchOne`.
- **`updatedAt` discipline:** every mutation (add/rename/merge-overwrite)
  bumps `updatedAt` — Stage C's last-write-wins merge depends on it.
- **TOTP-only `--add`:** `otpauth://hotp/` URIs are rejected with a clear
  message; the `--run` table can't render counter-based codes yet.
- **Merge rules** (key = `(issuer ?? '', name)`): absent → add; same secret →
  skip; different secret → conflict, kept existing and reported, `--force`
  overwrites while preserving the existing `id`.
- **Secret validation at add time:** base32-decode + test-generate a code
  before writing anything.
- **Backups are always encrypted** with their own password chosen at export
  (double-prompted); the backup file is a standard v2 vault JSON, so
  `decodeAccounts` reads it unchanged.

## CLI surface after Stage B

```
--add [uri]         -a    interactive or otpauth:// URI     --totp <name>   -t
--remove <name>           --rename <old> <new>              --copy <name>   -c
--list              -l    --json modifier                   --qr <name>
--export [file]     -e    --info                            --merge         -m
```

(post-review adjustment: `-c` belongs to `--copy` — the daily-use flow — and
the print-once command is `--totp`/`-t`; the terminal UI was upgraded at the
same time: box-drawn tables via a raw-ANSI `src/ui.js` helper — no color
library — with flicker-free home-and-repaint in `--run`, color-coded expiry
countdown, hidden cursor with restore on exit, and colors auto-disabled when
stdout isn't a TTY. `cli-table` dependency dropped.)

(pre-existing flags unchanged: `-i/--import` — now also accepts `otpauth://`
URIs and backup files — `-en/--encrypt`, `-d/--delete`, `-f/--force`,
`-r/--run`, `-v/--version`)

## Incidental fix

`PasswordPrompt` treated each stdin data event as a single keystroke, so
**pasting** a password (or piping scripted input) appended the whole chunk —
including the trailing newline — as "one character" and Enter never fired.
Fixed to iterate characters within a chunk; also made the prompt reusable
(input reset per `start()`, listener properly removed) since `--export`
prompts twice for confirmation.
