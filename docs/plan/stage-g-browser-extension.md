# Stage G — Browser extension (outline)

> Future stage, strictly **after Stage D** (it needs the desktop app as its
> local backend). Recorded now because the July 2026 competitor research
> identified it as 2FAS's stand-out feature and a natural fit here.

## Concept

A browser extension (Chrome/Firefox) that fills the current TOTP code for
the site you're on, by asking the **desktop app** — never by holding
secrets itself.

- **Transport: native messaging host**, not a network port. The browser
  launches/talks to a registered helper binary over stdio — no listener, no
  localhost socket to firewall, nothing another process on the LAN can
  reach. This is the same minimal-permission philosophy as Stage C's
  permissions budget applied to the desktop.
- The extension holds zero secrets and zero vault state; every code is
  requested per use, and the desktop app can require its vault to be
  unlocked (and optionally re-prompt) before answering.
- Domain matching: extension sends the page origin; desktop matches it
  against account issuer/name and returns *only* the matching code —
  the extension never sees the account list.
- Explicit non-goals: no autofill without a user click, no background
  polling, no cloud component, no Manifest V3 remote code.

## Prior art

2FAS Browser Extension (pairs with the phone app; ours pairs with the
desktop app instead — no push infrastructure needed, which keeps the
no-backend promise).

Detailed design happens when Stage D is done and its IPC surface is known.
