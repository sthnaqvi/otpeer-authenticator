# OTPeer Desktop design reference

**OTPeer design language locked (July 2026)**

- Accent: `#5B9FD4` / `#4b8bd6` on charcoal `#121212`–`#1A1D21`
- Logo: A5 shield → `packages/desktop/build/` (icons, tray) + `src/renderer/assets/` (mark, favicon)
- Full Stage D write-up: [`../stage-d-desktop-electron.md`](../stage-d-desktop-electron.md)

## Product screenshots (source of truth)

Early design mockup PNGs were removed — they drifted from the shipping UI
(wrong unlock mark, outdated sync copy including non-OTPeer sample text).

Marketing / website screenshots are captured from the **real Electron
renderer**:

- Files: [`website/public/assets/screenshot-*.png`](../../../website/public/assets/)
- Regenerate: from `packages/desktop` after `npm run build`, run
  `npm run capture:screenshots`

## Implementation steps (shipped)

| Step | Surface | Status |
|------|---------|--------|
| 1 Logo | A5 lockup → brand assets | ✅ |
| 2 Accounts | Live app / screenshot-accounts | ✅ |
| 3 Drawer | Live app | ✅ |
| 4 Unlock | Live app / screenshot-unlock | ✅ |
| 5 Empty | Live app | ✅ |
| 6 Sync | Live app / screenshot-sync | ✅ |
| 7 Settings | Live app | ✅ |
| 8 Add | Live app | ✅ |

Step notes (acceptance criteria, no mockup PNGs): `step-2-accounts/`,
`step-4-unlock/`, `step-5-empty/`, `step-6-sync/`, `step-7-settings/`,
`step-8-add/`.

Brand masters: [`logos/`](logos/). Issuer badges:
`packages/desktop/build/issuers/` + letter-circle fallback.
