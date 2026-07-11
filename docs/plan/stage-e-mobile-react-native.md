# Stage E — React Native mobile app (iOS/Android)

## Goal

UI over `@authenticator/core`, using mobile-specific `StorageAdapter` and
`CryptoProvider` implementations, plus native modules for BLE proximity
pairing (Stage C).

## Platform adapters needed

```ts
// storage
react-native-mmkv-based StorageAdapter implementation

// crypto
react-native-quick-crypto (or equivalent) CryptoProvider implementation —
must support AES-256-GCM + scrypt to match core's expectations exactly

// BLE (mobile-to-mobile pairing only, per Stage C)
a native BLE module (e.g. react-native-ble-plx) wired to core's pairing
handshake — BLE carries the PAKE handshake bytes only, not bulk vault data
```

## Permission handling (see Stage C for why these exist)

- iOS: request Local Network permission before mDNS discovery; if denied,
  fall back to manual host:port entry or BLE (phone-to-phone)
- Android: request location permission before BLE scanning, with a clear
  in-app explanation (this is an OS requirement unrelated to actual location
  use — users will be confused if it's not explained)

## Scope for this stage

- Account list with live-refreshing codes
- Add/remove/rename accounts
- Import via camera QR scan of a Google Authenticator export QR code
  (a genuine mobile advantage over the CLI's current "decode the QR on a
  third-party website" instruction)
- Sync UI: scan a QR (wrapping the same PAKE code from Stage C) or BLE
  proximity pairing with another phone
- Biometric unlock (Face ID/Touch ID/Android biometric) as a convenience
  layer in front of the vault password, not a replacement for it

## Non-goals

- No App Store/Play Store submission process yet — that's Stage F
- No redesign of vault format/sync protocol — same core APIs proven in
  Stages A-C
