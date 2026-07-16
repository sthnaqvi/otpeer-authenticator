# Stage D2 — Website (`otpeer.com`)

## Goal

Ship the public marketing site at **https://otpeer.com**: Desktop downloads
from GitHub Releases, CLI via npm, Mobile marked Coming soon — matching the
desktop app's visual language so end users never need to dig through the repo
to install OTPeer.

## Why D2 (after Desktop)

Stage D ships the Electron app and release artifacts. The landing page is the
consumer front door for those artifacts (OS-aware download buttons + CLI
install). It belongs next to desktop, not buried inside Stage F packaging.

## Deliverables

- [`website/`](../../website/) — Vite + vanilla HTML/CSS/JS (not React)
- GitHub Pages deploy: [`.github/workflows/website.yml`](../../.github/workflows/website.yml)
- Custom domain **`otpeer.com`** (`website/public/CNAME`)
- Product screenshots captured from the real renderer
  (`packages/desktop` → `npm run capture:screenshots`) — not design mockups
- Docs/READMEs point at `https://otpeer.com`; no `otpeer.app` references

## Page surface

1. Hero — OTPeer brand, primary Desktop CTA, CLI secondary
2. Surfaces — Desktop / CLI / Mobile (Coming soon)
3. How it works — P2P sync story
4. Download — OS detect + latest `desktop-v*` assets from GitHub API
5. Compare — OTPeer vs other authenticators (honest feature rows)
6. FAQ + footer

## Non-goals

- Mobile app / store listings (Stage E)
- npm `otpeer` alias package (Stage F)
- Blog or full docs site
- Hosting binaries on otpeer.com (files stay on GitHub Releases)

## Status

In progress — site code lives in `website/`; DNS + Pages custom domain are
owner actions (see [`website/README.md`](../../website/README.md)).
