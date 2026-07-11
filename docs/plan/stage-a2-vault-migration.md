# Stage A2 — Vault versioning + migration

## Goal

Land the breaking changes the future stages need, with a transparent,
automatic migration for anyone running an older version of the CLI. Nothing
in this stage should require a user to take manual action beyond running the
new version once.

## Changes bundled in this stage

1. **Vault file format version.** Add `"version": 2` to the vault JSON now
   (today's implicit format becomes `version: 1`, undeclared). Every future
   format change gets a version bump and a migration function keyed off it,
   instead of duck-typing field presence.

2. **Storage location.** ✅ DONE EARLY — shipped as part of the A1
   publish-readiness review (see the addendum in
   [stage-a1-extract-core.md](stage-a1-extract-core.md)): the vendored
   package layout broke the old relative path outright, so the move to
   `~/.authenticator-clui/accounts.json` with `legacyFilePaths` migration
   in `node-storage-adapter.ts` couldn't wait. Nothing left to do here in
   A2 except cover the migration in the test suite (item 5 below... i.e.
   the "Test coverage introduced here" section).

3. **Encryption: AES-256-CBC → AES-256-GCM.** Current scheme
   (`iv + ciphertext + salt`, CBC, no authentication tag) provides
   confidentiality but not integrity — a corrupted or tampered ciphertext
   decrypts to garbage silently rather than failing loudly. GCM adds an auth
   tag so tampering/corruption is detected.

   Migration: `is_encrypted` accounts get decrypted with the legacy CBC
   routine (kept around as `decryptLegacy()`) on next successful `--run`,
   then re-encrypted with GCM and rewritten. Track this via the vault's
   `version` field — `version: 1` payloads run through `decryptLegacy`,
   `version: 2+` through the current GCM path. Unencrypted vaults just get
   the version bump, no crypto migration needed.

4. **Account schema: add `id`, `updatedAt`, `deletedAt`.** Needed by Stage
   C's merge logic. Backfill on load: any account missing `id` gets a fresh
   uuid; missing `updatedAt` gets the migration timestamp. `deletedAt` stays
   absent until Stage C introduces tombstones — don't add delete-as-tombstone
   semantics in A2, that's premature until sync exists (in A2, delete still
   means "removed from the file," full stop).

## Why bundle these four together

They're independent changes, but all four are "touch the vault file's
on-disk shape, need a migration, want a version bump" — reviewing and
shipping them as one migration pass avoids three separate migration
routines each guessing at what shape they might encounter.

## What does NOT change in A2

- No new CLI flags (that's Stage B)
- No sync-related networking code — `id`/`updatedAt`/`deletedAt` fields exist
  in the schema but nothing reads them yet outside migration bookkeeping
- Public CLI behavior stays the same: `--import`/`--run`/`--delete`/`--encrypt`
  work exactly as before, just against the new file location/format under
  the hood

## Test coverage introduced here

This is where `core` gets its first real test suite (Jest), specifically
targeting the migration paths since they're the highest-risk part of this
stage:

- fresh install (no existing vault) → writes `version: 2` directly, no
  migration path exercised
- existing `version`-less vault at the old path, unencrypted → migrates path
  + adds version + backfills ids, content unchanged
- existing `version`-less vault at the old path, CBC-encrypted → migrates
  path + decrypts via `decryptLegacy` + re-encrypts via GCM + adds version +
  backfills ids
- corrupted/tampered GCM ciphertext → decrypt throws a clear "vault appears
  corrupted or tampered" error instead of silently returning garbage

## Rollback consideration

Because this changes the on-disk format, keep `decryptLegacy()` in the
codebase indefinitely (or at minimum for a few minor versions) rather than
deleting it once migration ships — someone reinstalling an old vault backup
from before A2 still needs to be readable.
