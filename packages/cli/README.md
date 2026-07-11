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

![CLI Authenticator](https://github.com/sthnaqvi/authenticator-clui/raw/master/readme_assets/cli_authenticator.png "CLI Authenticator")

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
| `--import <uri>` | `-i` | Import account(s) from an authenticator export URI (`"otpauth-migration://offline?data=..."` — keep the double quotes). Refuses to overwrite an existing vault; `--delete` first if you want to re-import. |
| `--encrypt` | `-en` | Use together with `--import` to protect the vault with AES-256 encryption. You choose a password at import and enter it on every run. |
| `--run` | `-r` | Show live codes for all accounts in a table that refreshes every second. Asks for your password if the vault is encrypted. |
| `--delete` | `-d` | Delete **all** imported accounts. Cannot be undone. Requires the password for an encrypted vault (unless `--force`). |
| `--force` | `-f` | Skip the vault validity/password check for `--delete`. Cannot be combined with `--run`. |
| `--version` | `-v` | Print the installed version. |
| `--help` | `-h` | Show usage help with all options. |

Common combinations:

```bash
auth -i "otpauth-migration://offline?data=..."        # plain import
auth -en -i "otpauth-migration://offline?data=..."    # encrypted import
auth -r                                                # live codes
auth -d                                                # delete all accounts
auth -d -f                                             # force-delete (no password check)
auth -v                                                # version
```

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
  re-importing your accounts.
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
