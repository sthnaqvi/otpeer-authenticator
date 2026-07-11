# Stage A1 — Extract core (no behavior change)

> **Status: ✅ implemented, merged to master, and published to npm as
> `authenticator-clui@1.2.0`.** Shipped as planned plus the publish-readiness
> addendum below (storage-location move pulled forward from A2, TOTP
> boundary-alignment fix, packaging hardening, README split). All manual
> acceptance flows verified; the automated test suite landed in Stage A2.

## Goal

Move all non-CLI-specific logic out of `src/` into a new `packages/core`
package, with the exact same runtime behavior as today. This is a pure
refactor: if it changes what the CLI prints or does, it's out of scope for
A1 — save it for A2.

## Target layout

```
authenticator-clui/
  package.json                 (root, npm workspaces config)
  packages/
    core/
      package.json              name: "@authenticator/core"
      src/
        index.ts                 public exports
        accounts.ts               vault load/save, orchestrates storage+crypto
        encryption.ts             AES-256 encrypt/decrypt (still CBC in A1 — no change yet)
        totp.ts                    generate2FACode / getTimeout (from lib.js)
        importers/
          google-auth.ts           protobuf decode + base32 conversion (from accounts.js + edbase32.js)
          google_auth.proto
        adapters/
          storage.ts               StorageAdapter interface
          crypto-provider.ts        CryptoProvider interface (wraps encryption.ts fns)
        node/
          node-storage-adapter.ts   fs-extra implementation of StorageAdapter
      package.json deps: protobufjs, fs-extra (only used by node/ adapter)
    cli/
      package.json               name: "authenticator-clui" (keeps existing published name + bin entries)
      bin.js                      unchanged CLI surface, now requires("@authenticator/core")
      src/
        PasswordPrompt.js          stays CLI-specific (terminal I/O)
        log.js                     stays CLI-specific (console.clear + cli-table rendering)
```

## Why `StorageAdapter` / `CryptoProvider` as interfaces now, even though A1 has one consumer

Stage A2 will change *what* gets stored and *how* it's encrypted. Stage E
(React Native) will need a completely different storage backend and crypto
implementation. Defining the seam now — even while A1's only implementation
is "the same fs-extra code, just moved" — means A2 only touches
`node-storage-adapter.ts`/`encryption.ts` internals, not every call site.

Concretely:

```ts
// adapters/storage.ts
export interface StorageAdapter {
  read(): Promise<string | null>;   // raw vault file contents, or null if absent
  write(data: string): Promise<void>;
  delete(): Promise<void>;
  exists(): Promise<boolean>;
}

// adapters/crypto-provider.ts
export interface CryptoProvider {
  encrypt(plaintext: string, password: string): string;
  decrypt(ciphertext: string, password: string): string;
}
```

`core`'s `accounts.ts` takes both as constructor/factory arguments — it never
imports `fs` or `crypto` directly.

## Migration mechanics (moving files, not rewriting logic)

1. `git mv src/accounts.js packages/core/src/accounts.ts` (and similarly for
   `encryption.js`, `edbase32.js`, `google_auth.proto`, the TOTP-generation
   half of `lib.js`) — preserve history, then adapt imports/exports.
2. Introduce `StorageAdapter`/`CryptoProvider` as thin wrappers around the
   *existing* `fs-extra` calls and the *existing* CBC encrypt/decrypt — do
   not change the encryption algorithm or file path yet. That's A2.
3. `packages/cli` keeps `bin.js`, `PasswordPrompt.js`, `log.js` — anything
   that does terminal I/O or process-argv parsing stays CLI-side.
4. Root `package.json` gains `"workspaces": ["packages/*"]`; `packages/cli`'s
   `package.json` keeps the existing `name`, `version`, `bin` fields so the
   published package identity (`npm install -g authenticator-clui`, `auth`/
   `authenticator` commands) is unchanged.
5. Convert `core` to TypeScript (`.ts` + a build step emitting `dist/`) since
   it's the part that benefits most from typed interfaces shared across three
   consumers. `cli` can stay plain JS for now — it's a thin shell.

## Acceptance check for A1

Run the existing manual flows against the restructured repo and confirm
byte-identical behavior:

```
authenticator --import "otpauth-migration://offline?data=..."
authenticator --run
authenticator --delete --force
authenticator --encrypt --import "otpauth-migration://offline?data=..."
authenticator --run   # prompts for password, same as before
```

No new flags, no new files created anywhere except the (identical-content)
vault file at its *current* location — location changes are explicitly
deferred to A2 so this stage has nothing to migrate and nothing to break.

## Publishing: core must be vendored, not left as a real dependency

Missed on the first pass, worth recording: `@authenticator/core` is
`private: true` and never published to npm — it only resolves locally via
the workspace symlink. If `packages/cli/package.json` lists it as a normal
`"@authenticator/core": "^0.1.0"` dependency, `npm publish` still packs fine
(publishing only looks at the package's own files), but the published
tarball is silently broken: anyone running `npm install -g authenticator-clui`
gets a `require('@authenticator/core')` that can't resolve to anything on
the registry.

Fix: `packages/cli` vendors core's compiled `dist/` into
`packages/cli/vendor/core` as part of the build (`npm run build` at the
root runs core's `tsc` build, then `vendor-core` copies the output;
`prepublishOnly` guarantees this runs before every publish). `bin.js`/`run.js`
require a small indirection module, `packages/cli/core.js`
(`module.exports = require('./vendor/core')`), instead of the package name
directly. `@authenticator/core` is removed from `packages/cli`'s
`dependencies`; its actual runtime deps (`fs-extra`, `otplib`, `protobufjs`)
move to `packages/cli/package.json` directly, since core itself is never
installed as a package for the end user.

Verified via `npm pack --dry-run` inside `packages/cli`: the tarball now
contains `vendor/core/**` and has no dependency on an unresolvable package.

## Explicit non-goals for A1

- No storage path change *(superseded — see publish-readiness addendum below)*
- No CBC → GCM change
- No new account fields (`id`, `updatedAt`, `deletedAt`)
- No new CLI flags
- No test suite yet beyond whatever smoke-checks verify the move (real test
  coverage lands as part of A2, once the interfaces it needs to test exist)

## Publish-readiness addendum (post-A1 review)

An end-to-end review of the publishable package before the first monorepo
publish found issues that changed the A1 scope:

1. **Storage-location move pulled forward from A2.** The vendored layout
   broke the "same path" plan: `__dirname/../../../../local_data` resolves
   to the repo root in dev but *outside the package* in the published
   tarball (`vendor/core/node/` is one level deeper than
   `packages/core/dist/node/` relative to the package root). Rather than
   patch the relative path, the A2 storage move shipped early:
   `NodeStorageAdapter` now defaults to `~/.authenticator-clui/accounts.json`
   and accepts `legacyFilePaths` — the CLI passes its old
   `<pkg>/local_data/accounts.txt` location so a surviving pre-1.2.0 vault
   is auto-migrated on first use. This also permanently fixes the
   "npm upgrade deletes your vault" trap. (A2 still owns: version field,
   CBC→GCM, id/timestamps, test suite.)
2. **TOTP boundary alignment regression fixed.** The original code used a
   cron firing at wall-clock :00/:30, matching TOTP's epoch-aligned windows.
   The A1 rewrite used a free-running `setInterval`, which could display
   stale codes for up to a full window. `generate2FACode` now aligns its
   timer to the interval boundary. `node-schedule` is fully dropped as a
   dependency (its Stage F removal item is done early as a side effect).
3. **Packaging hardening:** `files` whitelist in `packages/cli/package.json`
   (prevents ever publishing a dev vault or stray files — the root
   `.npmignore` does NOT apply to workspace publishes and was removed);
   `README.md` + `LICENSE` added to `packages/cli` so the npm page renders
   and the tarball carries its license; `repository.directory` set;
   `engines` corrected to `>=14` (deps require ≥12, TS output is ES2020);
   version bumped to 1.2.0; `index.js` exports the core API for
   programmatic use.
4. **README split:** root README is the monorepo/contributor document;
   `packages/cli/README.md` is the end-user document npm displays.
