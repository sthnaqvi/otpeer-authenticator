# Stage E — React Native mobile app: "OTPeer Authenticator" (iOS/Android)

## Goal

UI over `@authenticator/core`, using mobile-specific `StorageAdapter` and
`CryptoProvider` implementations. No Bluetooth, no discovery — sync joins
by dialing the address scanned from the host's pairing QR (see Stage C's
permissions budget).

## Branding & store listings (per Stage C2's ASO plan)

- **Title (both stores): `OTPeer Authenticator`** (20 of 30 chars) — the
  title is the heaviest-weighted store-search field, and the brand half
  itself contains the searched keyword (OTP, with Play prefix matching).
- Apple subtitle: `2FA codes · offline P2P sync`; Apple hidden keyword
  field: `totp,otp,two factor,2fa,backup,offline,no account,sync`.
- Play short description: two-factor authentication, TOTP, offline, no
  account, sync without cloud.
- Long-tail keywords to own (where a new app can actually rank):
  "authenticator offline", "2fa no account", "authenticator sync without
  cloud", "authenticator with desktop app", "authenticator import backup".
- **F-Droid listing** alongside Play (the proven organic channel for
  open-source authenticators) — the build must stay reproducible/FOSS-clean
  for acceptance: no proprietary SDKs, which the no-telemetry stance
  already guarantees.
- Tone rule from Stage C2 applies to the listing text: describe our own
  properties only; other apps appear solely as factual import-format
  compatibility.
- Bundle/application id: `app.otpeer.mobile` (iOS) / `app.otpeer.android`.
- Store screenshots = three uniquely ours moments: live
  terminal + phone side by side, the QR pairing moment, the paper backup
  sheet. Reserve the app name in both consoles as soon as developer
  accounts exist (see C2 owner checklist).

## Platform adapters needed

```ts
// storage
react-native-mmkv-based StorageAdapter implementation

// crypto
react-native-quick-crypto (or equivalent) CryptoProvider implementation —
must support AES-256-GCM, scrypt, HKDF-SHA256, and hmac(algo) to match
core's expectations exactly
```

That's the whole list — the QR/direct-connect sync design (Stage C) means
no BLE module, no zeroconf module, no Wi-Fi scanning API.

## Permission handling (see Stage C's permissions budget)

- **Camera** (iOS + Android): import QR scanning and sync-pairing QR
  scanning. Requested on first scan.
- **iOS Local Network**: prompted by the OS the moment the sync socket
  opens (unavoidable since iOS 14, even for a direct connection to a
  QR-supplied IP). Requested just-in-time during sync only; on denial,
  explain why sync can't work and deep-link to Settings — no workaround.
- **Android: nothing further.** No Bluetooth cluster, no location, no
  NEARBY_WIFI_DEVICES. This is a deliberate product stance, not an
  accident — see the budget table in
  [stage-c-sync-protocol.md](stage-c-sync-protocol.md).

## Scope for this stage

- Account list with live-refreshing codes (per-account digits/period from
  Stage B2)
- Add/remove/rename accounts; add via camera scan of a site's QR
- Import via camera QR scan of a Google Authenticator export QR code
  (a genuine mobile advantage over the CLI flow)
- Restore from a paper backup sheet (Stage B2) by scanning it
- Sync UI: scan the host device's pairing QR (`authsync://…`), or host a
  sync session showing that QR; phone↔phone without shared Wi-Fi uses the
  personal-hotspot path
- Biometric unlock (Face ID/Touch ID/Android biometric) as a convenience
  layer in front of the vault password, not a replacement for it

## Non-goals

- No App Store/Play Store submission process yet — that's Stage F
- No redesign of vault format/sync protocol — same core APIs proven in
  Stages A–C
- No push notifications, no analytics, no account system — nothing that
  would grow the permission budget or contradict the no-backend promise
