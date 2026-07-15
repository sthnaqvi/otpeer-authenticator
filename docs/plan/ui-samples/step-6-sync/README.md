# Step 6 — Sync devices

Target: [`../otpeer-design-04-sync.png`](../otpeer-design-04-sync.png)

## Implemented

| Piece | Notes |
|-------|--------|
| Drawer | Press flash only — click opens dialog and closes drawer |
| Choice | Host / Join cards (OTPeer primary + outline) |
| Host | QR, **IP:port**, pairing code, copy sync link |
| Join | Camera · QR image · screen capture · paste `authsync://` |
| Footer | Same-network note (OTPeer wording) |

Deep-link open of `authsync://` from browsers is deferred.

Status: **approved**.
