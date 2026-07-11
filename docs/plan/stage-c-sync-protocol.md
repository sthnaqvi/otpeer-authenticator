# Stage C — Local sync protocol v1

## Goal

Sync vaults across devices with **no backend**, over local Wi-Fi and/or
Bluetooth proximity. This is the riskiest new engineering in the whole plan
(new protocol, security-sensitive, cross-platform networking quirks) — prove
it CLI-to-CLI over a LAN before any Electron/RN UI is built on top of it.

## Pairing: PAKE, not "compare codes visually"

Earlier drafts of this plan suggested showing a code on both devices and
visually confirming a match. Better: a **password-authenticated key
exchange (PAKE)** — SPAKE2 is the concrete candidate, the same family of
idea behind `magic-wormhole`. One short one-time code (e.g. 6-8 characters,
base32), typed into *either* device, cryptographically derives a shared
session key. Properties that matter here:

- Works headless — no camera or display required, so it's uniform across
  CLI (text prompt), Electron (GUI input), and RN (GUI input or QR scan as
  a convenience wrapper around typing the same code)
- Resistant to on-path attackers on the same Wi-Fi — unlike a bare "compare
  these two numbers," a PAKE means an attacker who doesn't know the code
  can't derive the session key even if they can see all the traffic
- QR code (mobile convenience) just encodes { host, port, one-time-code } —
  it is not a separate security mechanism, it's a scan-instead-of-type UX
  wrapper around the same PAKE code

## Transport: Wi-Fi/mDNS primary, BLE for mobile-mobile proximity only

- **Discovery:** mDNS/Bonjour on the local network (`bonjour`/`react-native-zeroconf`)
- **Bulk transfer:** a local TCP/TLS (or WebSocket) connection once paired —
  vault payloads are small (a handful of base32 secrets), so throughput is a
  non-issue; the reason to prefer Wi-Fi over BLE is reliability and platform
  support, not bandwidth
- **Bluetooth's role:** proximity discovery/pairing for phone-to-phone only,
  when two mobile devices aren't necessarily on the same Wi-Fi network.
  Bluetooth support in Node/Electron (`noble`) is unreliable on modern macOS
  and needs BlueZ + permissions on Linux — so desktop devices join sync via
  Wi-Fi/mDNS, never BLE
- **Fallback:** mDNS can be blocked by client isolation on hotel/corporate
  Wi-Fi — provide a manual "enter host:port" path so LAN sync still works
  without discovery

## Payload encryption

The pairing session key encrypts the *transport* — it is layered on top of,
not a replacement for, each account's existing vault-level encryption. If
the receiving vault is itself password-protected, the transferred accounts
still only decrypt with that vault's password.

## Merge / conflict resolution

Each account already carries `id`, `updatedAt`, `deletedAt` (added in Stage
A2 specifically so this stage wouldn't need a schema migration). Merge two
account sets by `id`:

- both present, different `updatedAt` → keep the newer (last-write-wins)
- present only remotely → add locally
- present locally, `deletedAt` set remotely with a newer timestamp → delete
  locally (tombstone)

This is sufficient for a low-write-frequency dataset like 2FA accounts — no
need for full CRDTs.

## Platform permission gotchas to design around up front

- iOS 14+ prompts for "Local Network" access before any LAN discovery — the
  RN app must handle the user denying this gracefully (fall back to manual
  host:port or BLE)
- Android requires *location* permission to do BLE scanning (an OS quirk
  unrelated to actual location use) — needs a clear in-app explanation or
  users will be confused/alarmed
- Electron + `noble` Bluetooth is flaky enough on modern macOS/Linux that
  desktop should not depend on it at all (see Transport section above)

## Build/prove order

1. Implement pairing (SPAKE2) + transport (Wi-Fi/mDNS + manual fallback) +
   merge logic entirely inside `@authenticator/core`
2. Expose it via `authenticator --sync` in the CLI — two machines on the same
   LAN, both running the CLI, pair and merge vaults. This is the real-world
   test bed before investing in any GUI
3. Only after CLI-to-CLI sync is proven reliable does Stage D/E wire the same
   `core` sync APIs into Electron/RN UIs

## Explicit non-goals (v1)

- No relay/internet sync when devices aren't on the same LAN or in BLE range
- No continuous/background sync daemon — sync is an explicit, user-initiated
  action on both ends
- No multi-device "source of truth" server — every device's vault is a
  peer, merges are symmetric
