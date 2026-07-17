# SEO & distribution playbook

Status as of **2026-07-17**.

## The actual problem

On-page SEO is essentially done — title, description, canonical, OG/Twitter,
`SoftwareApplication` + `FAQPage` JSON-LD, sitemap, robots, static prerendered
HTML. None of that is the bottleneck.

`site:otpeer.com` returned **zero results** when this work started. The site went
live 2026-07-16 and was invisible for three reasons, in priority order:

1. **No inbound links.** Google discovers new sites by following links. The
   GitHub repo — the highest-authority page in our control — set no homepage, no
   topics, and carried a stale description. npm was the only link to otpeer.com
   anywhere. **Fixed 2026-07-17, see below.**
2. **One URL, one keyword target.** A single page realistically ranks for one
   cluster. Deliberately accepted for now; revisit if traffic plateaus.
3. **Nothing submitted anywhere.** No Search Console, no Bing, no directories.
   **Still open — now the top priority.**

Nothing below matters until the site is indexed.

---

## DONE — GitHub repo metadata (2026-07-17)

Applied via the GitHub web UI and verified against the REST API. This was the
highest-priority item: otpeer.com now renders as a real link in the repo sidebar,
which is the first genuine inbound link the site has ever had. The repo is
crawled regularly, so it is the fastest route to discovery.

Live values:

- **homepage** — `https://otpeer.com`. Note that GitHub auto-enabled *"Use your
  GitHub Pages website"* because the URL matches the Pages custom domain. Same
  result, and it self-updates if the domain changes. Uncheck it in the About
  dialog to pin the URL literally.
- **description** — `OTPeer Authenticator — free, open-source 2FA (TOTP) app for
  macOS, Windows, Linux, and the terminal. Encrypted local vault, serverless
  peer-to-peer sync. No cloud, no account, no telemetry.` This is what Google
  shows as the repo's snippet.
- **topics** (20) — `2fa`, `authenticator`, `authy-alternative`, `cli`,
  `electron`, `encryption`, `google-authenticator`, `linux`, `macos`,
  `offline-first`, `open-source`, `otp`, `p2p`, `peer-to-peer`, `privacy`,
  `security`, `totp`, `two-factor-authentication`, `typescript`, `windows`.

**20 is GitHub's hard cap** — adding a topic means removing one. `google-
authenticator` and `authy-alternative` are the highest-intent of the set.

Re-verify any time with:

```sh
curl -sS https://api.github.com/repos/sthnaqvi/otpeer-authenticator \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['description']);print(d['homepage']);print(d['topics'])"
```

---

## 1. Get indexed — now the top priority

Both require account access — yours to do.

- **Google Search Console** (https://search.google.com/search-console) — add
  `otpeer.com`, verify via DNS TXT or by dropping an HTML file in
  `website/public/`. Then submit `https://otpeer.com/sitemap.xml` and use
  **URL Inspection → Request Indexing** on `https://otpeer.com/`. This is the
  fastest path from zero to indexed.
- **Bing Webmaster Tools** (https://www.bing.com/webmasters) — can import
  directly from Search Console. Feeds Bing, DuckDuckGo, and increasingly
  ChatGPT-style answers.

## 2. Homebrew — the real Mac discovery channel

The Mac app cannot do App Store Optimization: it is unsigned and not on the App
Store. Homebrew is the substitute.

Cask is written and validated at `homebrew-tap/Casks/otpeer-authenticator.rb`.
See `homebrew-tap/README.md` for publishing steps and the notability explanation
(homebrew/cask needs 75+ stars; the personal tap needs nothing).

## 3. Directory + community submissions

Draft copy below. **None of these have been submitted** — each is a public post
under your name and should go out when you decide, not automatically.

Sequence matters: land AlternativeTo and the awesome-lists first (they build the
link profile quietly), then Show HN, then Product Hunt once there is something
to convert onto.

### AlternativeTo — https://alternativeto.net

Highest-leverage directory: it ranks on page 1 for "google authenticator
alternative" and "authy alternative", which is exactly the intent we want.
Submit as an alternative to **Google Authenticator**, **Authy**, **Microsoft
Authenticator**, **Aegis**, and **2FAS**.

> OTPeer Authenticator is a free, open-source 2FA app that keeps your TOTP
> codes on your own devices. Instead of syncing through a vendor cloud, paired
> devices merge their encrypted vaults directly over your local network — no
> relay, no backend, no account, no telemetry. Available for macOS, Windows and
> Linux, plus a terminal CLI. Imports from Google Authenticator, Microsoft
> Authenticator, Facebook, Aegis, 2FAS and andOTP.

Tags: `2fa`, `totp`, `authenticator`, `open-source`, `privacy`, `peer-to-peer`,
`offline`, `no-account`

### Awesome lists

Each is a PR against a high-authority, heavily-crawled repo.

- `awesome-selfhosted` — Software → Authentication
- `awesome-privacy` — Authentication → 2FA
- `awesome-electron` — Apps
- `awesome-security` / `awesome-opensource-apps`

Suggested line:

```md
- [OTPeer Authenticator](https://otpeer.com/) - 2FA/TOTP codes with an encrypted local vault and serverless peer-to-peer sync; desktop + CLI, no account or telemetry. ([Source Code](https://github.com/sthnaqvi/otpeer-authenticator)) `MIT` `TypeScript/Electron`
```

Read each list's CONTRIBUTING first — most require alphabetical order and a
specific trailing format.

### Show HN

Title:

> Show HN: OTPeer – Open-source 2FA that syncs peer-to-peer instead of via a cloud

Body:

> Every authenticator I tried wanted my secrets in someone's cloud — Authy on
> their servers, Google Authenticator behind a Google Account. I wanted sync
> without the middleman, so I built OTPeer.
>
> Your vault is AES-encrypted and stays on your device. To sync, you pair two
> devices with a QR code and they merge vaults directly over your LAN. There is
> no relay and no backend — nothing to breach, nothing to sign up for, nothing
> phoned home.
>
> It started as a terminal CLI (on npm as `authenticator-clui`) and now shares
> one TypeScript core with an Electron desktop app for macOS, Windows and
> Linux. Mobile is next. It imports from Google Authenticator, Microsoft
> Authenticator, Facebook, Aegis, 2FAS and andOTP.
>
> Honest caveat: the macOS builds are not Developer ID signed yet, so Gatekeeper
> will call the app "damaged" on first open — `xattr -cr` clears it. Signing is
> on the list.
>
> Code: https://github.com/sthnaqvi/otpeer-authenticator

Lead with the caveat rather than letting HN find it — that audience rewards it,
and burying it is how threads go sideways. Post Tue–Thu, ~9am ET, and be around
to answer for the first few hours.

### Product Hunt

Tagline (60 char max):

> Open-source 2FA that syncs peer-to-peer, not through a cloud

Description:

> OTPeer Authenticator generates your TOTP two-factor codes and keeps them
> where they belong — on your devices. Pair two devices with a QR code and they
> merge encrypted vaults directly over your local network. No cloud, no
> account, no telemetry. macOS, Windows, Linux and a terminal CLI, all MIT
> licensed.

Worth doing **after** Search Console and the repo metadata — PH links are
`rel="nofollow"`, so the SEO value is indirect. It is a traffic and stars play,
and stars are what unlock homebrew/cask.

### Also worth a submission

- **npm** — `homepage` already points to otpeer.com. Consider widening
  `keywords` to include `2fa`, `two-factor`, `authenticator-cli`, `otpeer`.
- **Slant**, **SaaSHub**, **Openbase** — low effort, real crawled links.
- **r/selfhosted**, **r/privacy**, **r/opensource** — read each subreddit's
  self-promotion rules first; several will remove the post otherwise.

---

## What was changed in this pass

- **GitHub repo metadata** — homepage, description, 20 topics. Live and
  API-verified. See the DONE section above.
- `website/index.html` — enriched `SoftwareApplication` JSON-LD with
  `softwareVersion`, `screenshot`, `featureList`, `applicationSubCategory`,
  `isAccessibleForFree`; added `og:locale` and `og:image:alt`; added
  `fetchpriority="high"` to the LCP hero image.
- `homebrew-tap/` — validated cask + publishing README.
- This document.

## Keeping this doc honest

This file drifts the moment a step is completed elsewhere. When you finish
something here, move it into a DONE section with the **verified live values**
rather than deleting it — the values are what let the next person confirm the
step still holds without redoing the research.

Deliberately **not** changed: no new pages were added, capping the ranking
ceiling to roughly one keyword cluster. If traffic stalls after indexation, the
highest-value next step is splitting the existing comparison table and FAQ into
their own URLs (`/vs/google-authenticator`, `/vs/authy`, `/mac`,
`/import/google-authenticator`) — the content is already written, it just needs
addressable URLs.

## Known gaps

- `website/public/sitemap.xml` has a hardcoded `lastmod` (`2026-07-16`) that
  will drift. Only worth automating once there is more than one URL.
- The unsigned macOS build costs real conversions and forces the
  `--no-quarantine` caveat. Developer ID signing (~$99/yr) is the fix.
