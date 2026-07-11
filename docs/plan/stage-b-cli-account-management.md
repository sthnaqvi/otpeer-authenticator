# Stage B — CLI single-account management

## Goal

Close the biggest usability gap in the current CLI: today you can only bulk
import once (blocked if a vault already exists) and delete *everything*
(`--delete` wipes the whole vault). This stage adds per-account operations on
top of the `core` built in A1/A2, validating `core`'s API design against a
real consumer before Electron/RN exist.

## New CLI surface

```
authenticator --add                          interactive prompt: name, issuer, secret, type (totp/hotp)
authenticator --remove <name>                 delete a single account by name
authenticator --rename <name> <new-name>      rename a single account
authenticator --list                          print account names only, no live codes, no refresh loop
authenticator --import "<uri>" --merge        import and merge into existing vault instead of blocking
```

`--import` without `--merge` keeps today's behavior (blocks if a vault
exists) — `--merge` is opt-in so existing scripts/muscle memory don't change
behavior unexpectedly.

## Core API additions (in `@authenticator/core`)

```ts
addAccount(vault, { name, issuer, secret, type }): Vault
removeAccount(vault, id | name): Vault
renameAccount(vault, id | name, newName): Vault
mergeAccounts(existingVault, importedAccounts): Vault   // dedupe by (issuer, name) pair, last-write-wins on conflict
```

All of these operate on the in-memory vault the same way `seed()` does today
— `bin.js` is still responsible for read → mutate → write, `core` just grows
more mutation functions instead of only "replace everything."

## Open design question resolved here

Dedup key for merge: use `(issuer, name)` pair rather than requiring the
imported account to already carry an `id`, since accounts freshly decoded
from a Google Authenticator export URI won't have one yet — `id` gets
assigned at merge/add time if absent (same backfill logic as the A2
migration).

## Non-goals

- No sync yet — this stage is purely local CRUD on a single device's vault
- No TUI/interactive table — `--list` is a plain printed list, the existing
  `--run` live table is untouched
