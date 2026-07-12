# authenticator-clui

[![npm version](https://img.shields.io/npm/v/authenticator-clui.svg)](https://www.npmjs.com/package/authenticator-clui)
[![Node version](https://img.shields.io/node/v/authenticator-clui.svg)](https://nodejs.org/en/download/)
[![License: MIT](https://img.shields.io/npm/l/authenticator-clui.svg)](https://github.com/sthnaqvi/authenticator-clui/blob/master/LICENSE)
![Downloads Total](https://img.shields.io/npm/dt/authenticator-clui.svg)
![Downloads Monthly](https://img.shields.io/npm/dm/authenticator-clui.svg)

A simple command-line authenticator with encryption. Import your accounts
once from Google Authenticator, Microsoft Authenticator, or Facebook
Authenticator, then get live two-factor codes right in your terminal —
optionally protected with AES-256 encryption and a password.

![CLI Authenticator](https://github.com/sthnaqvi/authenticator-clui/raw/master/readme_assets/cli_authenticator_v2.png "CLI Authenticator")

# Table of contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Command reference](#command-reference)
- [Export accounts from Google Authenticator](#export-accounts-from-google-authenticator)
- [Import accounts](#import-accounts)
  - [Import without encryption](#import-without-encryption)
  - [Import with encryption](#import-with-encryption)
- [Run the authenticator](#run-the-authenticator)
- [Delete accounts](#delete-accounts)
- [Where your data is stored](#where-your-data-is-stored)
- [Upgrading from v1.1.x](#upgrading-from-v11x)
- [Security notes](#security-notes)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

# Installation

Install globally with npm (Node.js 14 or newer):

```
npm install -g authenticator-clui
```

This gives you two equivalent commands: `authenticator` and its short alias
`auth` — every example below works with either.

If you hit a permission error on macOS/Linux, see
[Troubleshooting](#troubleshooting) below.

# Quick start

```bash
# 1. Import your accounts (get the URI from your phone — see next section)
auth --import "otpauth-migration://offline?data=..."

# 2. Show live codes
auth -r
```

# Command reference

```
auth [options]
```

| Option | Short | Description |
|---|---|---|
| `--import <uri-or-file>` | `-i` | Import from a Google Authenticator export URI (`"otpauth-migration://..."`), a single `otpauth://` / `steam://` URI, a backup made with `--export`, or an **Aegis / 2FAS / andOTP backup file** (auto-detected; password asked only if the file is encrypted). Refuses to overwrite an existing vault unless `--merge` is given. |
| `--merge` | `-m` | With `--import`: merge into the existing vault. Already-present accounts are skipped; same account with a *different* secret is reported as a conflict (add `--force` to overwrite). |
| `--add [uri]` | `-a` | Add one TOTP account — interactively (name, issuer, secret), or from an `otpauth://totp/...` URI (the format under most websites' 2FA QR codes). The secret is validated before saving. |
| `--remove <name>` | | Remove one account by name, `issuer(name)`, or id prefix (from `--list`). |
| `--rename <old> <new>` | | Rename an account. |
| `--list` | `-l` | List accounts (id prefix + name) — never shows secrets. Add `--json` for machine-readable output. |
| `--totp <name>` | `-t` | Print the current TOTP code for one account and exit — handy in scripts. |
| `--copy <name>` | `-c` | Copy the current code to the clipboard (uses pbcopy / xclip / wl-copy / clip). |
| `--qr <name>` | | Show the account as a QR code in the terminal, ready to scan into a phone app. |
| `--export [file]` | `-e` | Write an encrypted backup. Default location is your **home directory** (`~/authenticator-backup.json`), never the current folder — so a backup can't silently land inside a project/repo. An explicit path inside a git repository triggers a warning. You choose a backup password (asked twice); restore anywhere with `--import <file>`. |
| `--paper` | | With `--export`: write a printable HTML sheet (QR codes + text) instead — offline paper recovery. Useless to anyone without the backup password. |
| `--info` | | Show vault location, format version, encryption status, and account count. |
| `--sync [target]` | `-s` | Sync with another device on your local network — no cloud, no account. Without a target: host a session (shows an `authsync://` URI, a QR, and a one-time pairing code). With a target: join one. Both devices see the merge summary and must confirm before anything is written. Deletions sync too. |
| `--encrypt` | `-en` | With `--import`/`--add` into a *new* vault: protect it with AES-256 encryption. You'll enter the password on every use. |
| `--run` | `-r` | Show live codes for all accounts in a table that refreshes every second. Asks for your password if the vault is encrypted. |
| `--delete` | `-d` | Delete **all** imported accounts. Cannot be undone. Requires the password for an encrypted vault (unless `--force`). |
| `--force` | `-f` | Skip the vault validity/password check for `--delete`; with `--merge`, overwrite conflicting secrets. Cannot be combined with `--run`. |
| `--json` | | Modifier for `--list` / `--info`: JSON output. |
| `--version` | `-v` | Print the installed version. |
| `--help` | `-h` | Show usage help with all options. |

Common combinations:

```bash
auth -i "otpauth-migration://offline?data=..."        # bulk import from Google Authenticator
auth -a "otpauth://totp/GitHub:me?secret=ABC234..."   # add one account from a site's QR URI
auth -a                                                # add one account interactively
auth -r                                                # live codes
auth -t GitHub                                         # print GitHub's current code
auth -c GitHub                                         # code straight to clipboard
auth -l                                                # list accounts
auth --rename "GitHub(me)" work-github                 # rename (issuer(name) disambiguates)
auth -e vault-backup.json                              # encrypted backup
auth -e recovery-sheet.html --paper                    # printable paper backup
auth -i vault-backup.json -m                           # restore/merge a backup
auth -i aegis-export.json -m                           # switch from Aegis (or 2FAS/andOTP)
auth --qr GitHub                                       # move an account to a phone app
auth -s                                                # host a sync session (QR + code)
auth -s "authsync://192.168.1.7:52514#ABC..."          # join a sync from another device
auth -d -f                                             # force-delete everything
```

Full OTP compatibility: 6/7/8-digit codes, 15/30/60s periods, SHA-1/SHA-256/
SHA-512, HOTP counter accounts (`otpauth://hotp/...` — generate with `-t`,
the counter advances and persists), and Steam Guard (`steam://SECRET`,
5-character codes).

# Export accounts from Google Authenticator

- Open `Google Authenticator`, tap `...`
- Tap `Export accounts`
- Tap `Continue`, select the account(s) you want to export
- Tap `Export` — you get a QR code
- Decode that QR code to get the `otpauth-migration://...` URI
  (any QR reader app works; the decoded text is the URI)

<p align="center">
<img src="https://github.com/sthnaqvi/authenticator-clui/raw/master/readme_assets/export_authenticator_backup.gif" alt="export URI from Google Authenticator" height="550">
</p>

> ⚠️ The exported URI contains your 2FA secrets. Prefer an **offline** QR
> reader on your own device over pasting the QR into a website.

# Import accounts

## Import without encryption

Copy the URI from your phone, then:

```
auth --import "otpauth-migration://offline?data=CicKFFFFNi94eGM5bGxUUWlQcWxJSjU0EgR0ZXN0GgNvdHAgASgBMAIQARgBIAA%3D"
```

## Import with encryption

Add `--encrypt` to protect the stored accounts with AES-256 encryption and a
password of your choice. You'll be asked for the password on import, and
again every time you run the authenticator:

```
auth --encrypt --import "otpauth-migration://offline?data=CicKFFFFNi94eGM5bGxUUWlQcWxJSjU0EgR0ZXN0GgNvdHAgASgBMAIQARgBIAA%3D"
```

* Don't forget the `"double quotes"` around the URI.

# Run the authenticator

```
auth -r
```
(long form: `auth --run`)

Shows a live table with every account's current code and its expiry
countdown, refreshing automatically:

```
┌───────────────┬───────────┬───────────┐
│ Name          │ Auth Code │ Expire In │
├───────────────┼───────────┼───────────┤
│ GitHub(you)   │ 123456    │ 21        │
└───────────────┴───────────┴───────────┘
```

If your accounts are encrypted, it asks for your password first.

# Delete accounts

```
auth --delete
```

Deletes all imported accounts. **This cannot be undone** — you'd need to
re-import from your phone. If the accounts are encrypted, the password is
required unless you pass `--force`.

# Where your data is stored

Your accounts are stored in a single file:

```
~/.authenticator-clui/accounts.json
```

If you imported with `--encrypt`, the account secrets in this file are
AES-256 encrypted with a key derived from your password (scrypt). Without
`--encrypt`, the file is plain JSON — anyone with access to your user
account can read the secrets, so encryption is strongly recommended.

# Upgrading from v1.1.x

Older versions stored your accounts **inside the npm package folder**, which
npm replaces on every update — so upgrading could silently delete them. From
v1.2.0 the vault lives in your home directory (see above) and survives
updates.

When you first run v1.2.0+:

- If your old vault file survived the upgrade, it is **migrated
  automatically** to the new location — you'll see a one-time notice.
- If npm already removed it during the upgrade, you'll need to re-import
  once from your phone ([export steps](#export-accounts-from-google-authenticator)).
  After that, future updates never touch your data again.

# Security notes

- Prefer `--encrypt`. The vault password is never stored; losing it means
  re-importing your accounts (or restoring an `--export` backup).
- TOTP code generation is implemented in this repository per RFC 6238 and
  tested against the RFC's official test vectors — no third-party OTP
  dependency.
- Encryption uses AES-256-GCM (authenticated encryption) with a random IV
  and salt per encryption, and scrypt for password-based key derivation —
  a tampered or corrupted vault file fails loudly instead of decrypting to
  garbage. Vaults created by older versions are upgraded automatically the
  first time you run.
- Your secrets never leave your machine — this tool has no network access,
  no telemetry, no cloud.

# Troubleshooting

## `EACCES` / permission denied when installing globally

This is an npm setup issue, not specific to this package. The npm docs cover
the fixes: [Resolving EACCES permissions errors](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally).
The short version — either change npm's default directory to one you own:

```bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.profile
source ~/.profile
```

or install Node.js via a version manager
([nvm](https://github.com/nvm-sh/nvm)) or Homebrew (`brew install node`),
both of which set permissions up correctly out of the box.

## Password prompt does nothing / crashes when input is piped

The password prompt needs a real terminal (TTY). Run the command directly in
your terminal rather than piping input into it.

# Contributing

This package is part of an open source monorepo that also hosts the shared
core library (and, in future, desktop and mobile apps). Development setup,
architecture, and contribution guidelines live in the
[repository README](https://github.com/sthnaqvi/authenticator-clui#readme).

Bug reports and feature requests:
[GitHub issues](https://github.com/sthnaqvi/authenticator-clui/issues).

# License

[MIT](https://github.com/sthnaqvi/authenticator-clui/blob/master/LICENSE) © Sayed Tauseef Naqvi
