# Step 8 — Add account

Target: [`../otpeer-design-06-add.png`](../otpeer-design-06-add.png)

## Implemented

| Piece | Notes |
|-------|--------|
| Modal | **Add account** + ✕ over Accounts |
| Scan UX | Camera · QR image · scan this screen |
| QR kinds | `otpauth://` / `steam://` (new setup) and `otpauth-migration://` (export from Google / Microsoft Authenticator) |
| Verify | After a single-account add: live code panel for website dual-code checks |
| Paste / manual | URI textarea or name / issuer / secret |
| Backup path | **Import a backup instead** → Import dialog (OTPeer file export/import) |

Status: **approved** (scan flows updated for enrollment + migration).
