const RELEASES_API =
  'https://api.github.com/repos/sthnaqvi/otpeer-authenticator/releases';
const RELEASES_PAGE =
  'https://github.com/sthnaqvi/otpeer-authenticator/releases';
const MAX_RELEASE_PAGES = 5;

/**
 * iPadOS Safari often reports as Macintosh; touch points distinguish it.
 * @param {string} ua
 */
function isIpad(ua) {
  if (/iPad/i.test(ua)) return true;
  // iPadOS 13+ desktop UA
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
}

/**
 * @returns {Promise<{ os: 'mac' | 'win' | 'linux' | 'ios' | 'android' | 'unknown', arch: 'arm64' | 'x64' | 'unknown', isPhone: boolean }>}
 */
async function detectPlatform() {
  const ua = navigator.userAgent || '';
  const uaData = navigator.userAgentData;

  if (/iPhone|iPod/i.test(ua) || isIpad(ua)) {
    return { os: 'ios', arch: 'unknown', isPhone: true };
  }
  if (/Android/i.test(ua)) {
    return { os: 'android', arch: 'unknown', isPhone: true };
  }

  let os = 'unknown';
  let arch = 'unknown';

  if (uaData?.platform) {
    const platform = uaData.platform.toLowerCase();
    if (platform.includes('mac')) os = 'mac';
    else if (platform.includes('win')) os = 'win';
    else if (platform.includes('linux')) os = 'linux';
  } else if (/Mac OS X|Macintosh/i.test(ua)) {
    os = 'mac';
  } else if (/Windows/i.test(ua)) {
    os = 'win';
  } else if (/Linux/i.test(ua)) {
    os = 'linux';
  }

  if (typeof uaData?.getHighEntropyValues === 'function') {
    try {
      const values = await uaData.getHighEntropyValues(['architecture', 'bitness']);
      if (/arm/i.test(values.architecture || '')) arch = 'arm64';
      else if (values.architecture) arch = 'x64';
    } catch {
      // fall through
    }
  }

  if (arch === 'unknown') {
    if (/\b(arm|aarch64)\b/i.test(ua)) arch = 'arm64';
    else if (/\b(x86_64|Win64|WOW64|amd64)\b/i.test(ua)) arch = 'x64';
    // macOS: leave unknown when we cannot tell — do not guess arm64 (breaks Intel).
    else if (os === 'win' || os === 'linux') arch = 'x64';
  }

  return { os, arch, isPhone: false };
}

/**
 * @param {Array<{ name: string, browser_download_url: string }>} assets
 */
function mapAssets(assets) {
  const byPlatform = {
    'mac-arm64': null,
    'mac-x64': null,
    win: null,
    'linux-appimage': null,
    'linux-deb': null,
  };

  for (const asset of assets) {
    const name = asset.name.toLowerCase();
    if (!name.includes('otpeer-authenticator')) continue;

    if (name.endsWith('.dmg') && name.includes('arm64')) {
      byPlatform['mac-arm64'] = asset.browser_download_url;
    } else if (name.endsWith('.dmg') && (name.includes('x64') || name.includes('x86_64'))) {
      byPlatform['mac-x64'] = asset.browser_download_url;
    } else if (name.includes('setup') && name.endsWith('.exe')) {
      byPlatform.win = asset.browser_download_url;
    } else if (name.endsWith('.exe') && !byPlatform.win) {
      byPlatform.win = asset.browser_download_url;
    } else if (name.endsWith('.appimage')) {
      byPlatform['linux-appimage'] = asset.browser_download_url;
    } else if (name.endsWith('.deb')) {
      byPlatform['linux-deb'] = asset.browser_download_url;
    }
  }

  return byPlatform;
}

/**
 * @param {{ os: string, arch: string, isPhone: boolean }} platform
 */
function preferredKey(platform) {
  if (platform.isPhone) return null;
  if (platform.os === 'mac') {
    if (platform.arch === 'x64') return 'mac-x64';
    if (platform.arch === 'arm64') return 'mac-arm64';
    return null;
  }
  if (platform.os === 'win') return 'win';
  if (platform.os === 'linux') return 'linux-appimage';
  return null;
}

/**
 * @param {HTMLAnchorElement} el
 * @param {string} url
 */
function setLinkHref(el, url) {
  el.href = url;
  if (/^https?:\/\//i.test(url)) {
    el.target = '_blank';
    el.rel = 'noopener noreferrer';
  } else {
    el.removeAttribute('target');
    el.removeAttribute('rel');
  }
}

/**
 * @param {{ os: string, arch: string, isPhone: boolean }} platform
 * @param {Record<string, string | null>} urls
 * @param {string | null} tag
 */
function wirePrimaryCta(platform, urls, tag) {
  const primary = document.getElementById('primary-cta');
  const hint = document.getElementById('cta-hint');
  if (!primary || !hint) return;

  if (platform.isPhone) {
    primary.textContent = 'Mobile app — Coming soon';
    setLinkHref(primary, '#surfaces');
    primary.classList.add('is-disabled');
    primary.setAttribute('aria-disabled', 'true');
    hint.textContent =
      'Desktop and CLI are available below. The mobile app is not shipping yet.';
    return;
  }

  const key = preferredKey(platform);
  const labels = {
    'mac-arm64': 'Download for macOS',
    'mac-x64': 'Download for macOS',
    win: 'Download for Windows',
    'linux-appimage': 'Download for Linux',
  };

  primary.classList.remove('is-disabled');
  primary.removeAttribute('aria-disabled');

  if (key && urls[key]) {
    primary.textContent = labels[key] || 'Download Desktop';
    setLinkHref(primary, urls[key]);
    hint.textContent = tag
      ? `Latest desktop release: ${tag}`
      : 'Matching installer ready for your system.';
  } else if (platform.os === 'mac') {
    primary.textContent = 'Download Desktop';
    setLinkHref(primary, '#download');
    hint.textContent = tag
      ? `Latest: ${tag} — pick Apple Silicon or Intel below.`
      : 'Pick Apple Silicon or Intel below.';
  } else {
    primary.textContent = 'Download Desktop';
    setLinkHref(primary, RELEASES_PAGE);
    hint.textContent = 'Open GitHub Releases to pick an installer.';
  }
}

/**
 * @param {Record<string, string | null>} urls
 * @param {string | null} preferred
 */
function wirePlatformButtons(urls, preferred) {
  const buttons = document.querySelectorAll('[data-platform]');
  buttons.forEach((btn) => {
    const key = btn.getAttribute('data-platform');
    const url = (key && urls[key]) || RELEASES_PAGE;
    setLinkHref(btn, url);
    btn.classList.toggle('is-preferred', Boolean(preferred && key === preferred));
  });
}

/**
 * Walk release pages until the newest non-draft desktop-v* tag is found.
 * @returns {Promise<object | null>}
 */
async function fetchLatestDesktopRelease() {
  for (let page = 1; page <= MAX_RELEASE_PAGES; page += 1) {
    const res = await fetch(`${RELEASES_API}?per_page=100&page=${page}`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const releases = await res.json();
    if (!Array.isArray(releases) || releases.length === 0) return null;

    const desktop = releases.find(
      (r) => typeof r.tag_name === 'string' && r.tag_name.startsWith('desktop-v') && !r.draft,
    );
    if (desktop) return desktop;
    if (releases.length < 100) return null;
  }
  return null;
}

async function loadReleases() {
  const meta = document.getElementById('release-meta');
  const platform = await detectPlatform();
  const empty_urls = {
    'mac-arm64': null,
    'mac-x64': null,
    win: null,
    'linux-appimage': null,
    'linux-deb': null,
  };

  // Wire OS-aware UI immediately so the hero does not jump after the API returns.
  const preferred = preferredKey(platform);
  wirePrimaryCta(platform, empty_urls, null);
  wirePlatformButtons(empty_urls, preferred);

  let urls = empty_urls;
  let tag = null;

  try {
    const desktop = await fetchLatestDesktopRelease();
    if (desktop) {
      tag = desktop.tag_name;
      urls = mapAssets(desktop.assets || []);
      if (meta) {
        meta.textContent = `Latest: ${tag}${desktop.published_at ? ` · ${new Date(desktop.published_at).toLocaleDateString()}` : ''}`;
      }
    } else if (meta) {
      meta.textContent = 'No desktop release found yet — check GitHub Releases.';
    }
  } catch {
    if (meta) {
      meta.textContent =
        'Could not load release metadata. Use the GitHub Releases page for downloads.';
    }
  }

  wirePrimaryCta(platform, urls, tag);
  wirePlatformButtons(urls, preferred);
}

function setupCopyCli() {
  const btn = document.getElementById('copy-cli');
  const cmd = document.getElementById('cli-cmd');
  if (!btn || !cmd) return;

  btn.addEventListener('click', async () => {
    const text = cmd.textContent?.trim() || '';
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = 'Copied';
      setTimeout(() => {
        btn.textContent = 'Copy';
      }, 1600);
    } catch {
      btn.textContent = 'Select & copy';
    }
  });
}

loadReleases();
setupCopyCli();
