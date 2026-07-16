# OTPeer website (`otpeer.com`)

Marketing landing page for **OTPeer Authenticator**: Desktop downloads from
GitHub Releases, CLI via npm, Mobile marked Coming soon.

Canonical domain: **https://otpeer.com**.

## Local development

From the repo root:

```bash
npm install
npm run website:dev
```

Build:

```bash
npm run website:build
```

Output: `website/dist/` (includes `CNAME` → `otpeer.com`).

## Deploy (GitHub Pages)

Workflow: [`.github/workflows/website.yml`](../.github/workflows/website.yml).

### One-time GitHub settings

1. Repo → **Settings → Pages**
2. Source: **GitHub Actions**
3. Custom domain: `otpeer.com`
4. Enable **Enforce HTTPS** (after DNS propagates)

### DNS at your registrar

Point the apex domain at GitHub Pages:

| Type | Host | Value |
|------|------|-------|
| `A` | `@` | `185.199.108.153` |
| `A` | `@` | `185.199.109.153` |
| `A` | `@` | `185.199.110.153` |
| `A` | `@` | `185.199.111.153` |

Optional www:

| Type | Host | Value |
|------|------|-------|
| `CNAME` | `www` | `sthnaqvi.github.io` |

`website/public/CNAME` contains `otpeer.com` and is copied into the Pages
artifact on each deploy.

## Screenshots

Product shots (`public/assets/screenshot-*.png`) are captured from the
**shipping Electron renderer**, not design mockups:

```bash
cd packages/desktop
npm run capture:screenshots
```
