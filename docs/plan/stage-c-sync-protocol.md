# Stage C — Local sync protocol v1

> **Status: ✅ implemented and merged to master** (PR #12, ships as
> `authenticator-clui@1.5.0`). SYNC/1 shipped as specified:
> 26-char (130-bit) pairing codes, HKDF-SHA256 session keys (RFC 5869
> vectors tested), AES-256-GCM length-prefixed frames (tamper/oversize/
> wrong-code abort tests), symmetric LWW merge with deterministic tie-breaks
> and cross-device dedupe, tombstoned deletes with 90-day GC, one-shot
> listener, mutual confirmation before any write. `remove()` became
> tombstone-based so deletions propagate. 131 tests across 10 suites.
> Verified with real two-process CLI runs over localhost: converging vaults,
> delete propagation, a blank device bootstrapping entirely from a sync, and
> wrong-code aborts on both ends. Desktop/mobile UIs (Stages D/E) wrap these
> same core APIs; mDNS discovery remains an optional future convenience —
> QR/URI pairing needed no discovery at all, exactly as the permissions
> budget intended.

## Goal

Sync vaults across devices with **no backend**, over the local network,
QR-paired, with the smallest possible permission footprint. This is the
riskiest new engineering in the whole plan (new protocol,
security-sensitive, cross-platform networking quirks) — prove it CLI-to-CLI
over a LAN before any Electron/RN UI is built on top of it.

## Why this is the product's differentiator (market research, July 2026)

A survey of the authenticator landscape (July 2026) found that existing
apps cluster into three models: vendor-cloud sync tied to an account,
single-platform local-only vaults with no sync, and self-hosted-server
sync. To our knowledge, no app spans **CLI + desktop + mobile with
serverless, account-less, local-only P2P sync** — codes that never touch
any server, synced directly between a user's own devices. That is this
project's lane, and this stage builds its core. (We describe our own
properties and let users compare — this project doesn't name or criticize
other apps, many of which are excellent volunteer-run open source work.)

## Permissions budget — the hard constraint

Rule: **any feature that would add a permission must justify itself in this
table first, and "convenience" is not a justification.** Current total:

| Platform | Permission | Why | When requested |
|---|---|---|---|
| iOS | Camera | Scan import QR codes + sync pairing QR (already required by Stage E import) | First scan |
| iOS | Local Network (`NSLocalNetworkUsageDescription`) | Unavoidable for *any* LAN connection since iOS 14 — even a direct socket to a QR-supplied IP | Just-in-time, only when the user starts a sync |
| Android | Camera | Same as iOS | First scan |
| Android | — | **Nothing else.** No Bluetooth cluster, no location, no `NEARBY_WIFI_DEVICES` (we use no Wi-Fi scanning APIs — see Transport) | — |

Notably absent, by design:

- **Bluetooth is dropped entirely** (earlier drafts used BLE for
  phone-to-phone proximity). BLE would cost the `BLUETOOTH_SCAN/CONNECT/
  ADVERTISE` cluster on Android 12+, *location* permission on older
  Android, and flaky `noble` support on desktop. QR pairing carries the
  address, so no radio discovery is needed. Phone↔phone without a shared
  network: one phone enables its personal hotspot, the other joins — zero
  extra permissions.
- **No mDNS on mobile.** Discovery is an optional CLI/desktop convenience
  (Node needs no OS permission for it); a phone never browses the network —
  it dials exactly the `ip:port` its camera just scanned.

iOS Local Network denial is handled gracefully: sync cannot work without it
(the OS blocks the socket), so the app explains why and deep-links to
Settings — no workaround, no nagging.

## Pairing: high-entropy one-time code + HKDF (no PAKE needed)

Earlier drafts specified SPAKE2. Review changed this: PAKE protocols exist
to protect *low-entropy* codes from offline guessing, but the JS SPAKE2
ecosystem is a stale npm package (6+ years unmaintained) or a Rust/WASM
build that fights React Native — an unmaintained crypto dependency is
exactly what the otplib removal taught us to avoid. Instead, make the code
high-entropy and the problem disappears:

- Host device generates a **one-time pairing secret ≥130 bits** (26-char
  base32) and starts a one-shot listener.
- **QR encodes `authsync://<ip>:<port>#<code>`** — scanning is the primary
  mobile flow (camera permission only). CLI/desktop print the same URI as
  text for copy/paste; typing 26 chars manually is the worst-case fallback
  and acceptable for a rare pairing action.
- Both sides derive the session key with **HKDF-SHA256(code, salt =
  protocol transcript)** and speak **AES-256-GCM** frames via the existing
  `CryptoProvider` — zero new dependencies, every primitive already in-repo
  and tested.
- An attacker on the same network who sees the traffic but not the QR/code
  cannot derive the key (130 bits ≫ brute force), which is the same
  property SPAKE2 provided for short codes.
- The code is single-use: the listener dies after one session, success or
  failure.

## Transport

- **Framing:** length-prefixed JSON messages, AES-256-GCM encrypted with
  the session key, protocol-versioned (`{"proto":"SYNC/1"}` hello). Vault
  payloads are tiny; throughput is irrelevant.
- **Connection:** direct TCP. The joining side dials the address from the
  QR/pasted URI. No listener runs outside an explicit sync session.
- **Discovery (optional, CLI/desktop only):** mDNS/Bonjour so two
  laptops can find each other without reading IPs aloud. Never on mobile.
- **Universal fallback:** manual `host:port` entry (also covers
  client-isolated hotel/corporate Wi-Fi where mDNS is blocked).

## Payload encryption

The pairing session key encrypts the *transport* — it is layered on top of,
not a replacement for, vault-level encryption. If the receiving vault is
password-protected, transferred accounts still only persist under that
vault's own AES-256-GCM password encryption.

## Merge / conflict resolution

Each account already carries `id`, `updatedAt`, `deletedAt` (added in Stage
A2 for exactly this). Merge two account sets by `id`:

- both present, different `updatedAt` → keep the newer (last-write-wins);
  equal timestamps → deterministic tie-break by lexicographic `id`
- present only remotely → add locally
- present locally, `deletedAt` set remotely with a newer timestamp → delete
  locally (tombstone)

Accepted risk: LWW trusts device clocks. For a low-write dataset like 2FA
accounts this is fine; a skewed clock can at worst resurrect/prefer a stale
edit of a single account, visible in the merge summary. No CRDTs.

**Tombstone GC:** tombstones older than 90 days are purged on write —
long-dead deletions don't ride along forever.

## Hardening rules

- The listener binds only while `--sync` is running, accepts **exactly one
  connection**, and exits after the merge (or on error/timeout).
- **No silent writes:** the receiving side displays the merge summary
  (N added / N updated / N deleted) and requires confirmation before the
  vault is touched — same UX as Stage B's merge conflicts.
- Malformed/oversized frames or a failed GCM tag abort the session
  immediately; nothing partial is ever written.

## Build/prove order

1. Pairing (code + HKDF), transport (framing + one-shot listener), and
   merge logic land in `@authenticator/core` behind the existing adapter
   seams, fully unit-tested (frame round-trip, tamper abort, merge matrix,
   tombstone GC).
2. `authenticator --sync` (host) / `authenticator --sync <uri-or-host:port>`
   (join) in the CLI — two machines on one LAN are the test bed.
3. Only after CLI↔CLI sync is proven do Stages D/E wire the same core APIs
   into Electron/RN UIs (mobile adds only the QR scan wrapper).

## Explicit non-goals (v1)

- No relay/internet sync when devices can't reach each other locally
- No continuous/background sync daemon — sync is an explicit, user-initiated
  action on both ends
- No stored device trust / paired-devices list — every sync session pairs
  fresh with a new code (simplest possible trust model; revisit only if
  re-pairing friction proves real)
- No multi-device "source of truth" — every vault is a peer, merges are
  symmetric
