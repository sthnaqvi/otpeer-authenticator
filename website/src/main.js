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

let pending_mac_dmg_url = RELEASES_PAGE;

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
 * @param {string} href
 */
function isMacDmgUrl(href) {
  try {
    const path = new URL(href, window.location.href).pathname.toLowerCase();
    return path.endsWith('.dmg');
  } catch {
    return false;
  }
}

function syncMacDownloadEnabled() {
  const ack = document.getElementById('mac-ack');
  const download = document.getElementById('mac-dialog-download');
  if (!(download instanceof HTMLAnchorElement) || !(ack instanceof HTMLInputElement)) return;
  const ok = ack.checked;
  download.classList.toggle('is-disabled', !ok);
  download.setAttribute('aria-disabled', ok ? 'false' : 'true');
  if (ok) {
    download.removeAttribute('tabindex');
  } else {
    download.setAttribute('tabindex', '-1');
  }
}

/**
 * Start the installer download in the hidden named frame (keeps this tab alive).
 * @param {string} url
 */
function startInstallerDownload(url) {
  const frame = document.getElementById('otpeer-download-frame');
  if (frame instanceof HTMLIFrameElement) {
    frame.removeAttribute('src');
    frame.src = url;
    return;
  }

  // Fallback if the frame is missing — still avoid a visible blank tab.
  const a = document.createElement('a');
  a.href = url;
  a.target = 'otpeer-download';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * @param {string} downloadUrl
 */
function openMacUnsignedDialog(downloadUrl) {
  const dialog = document.getElementById('mac-unsigned-dialog');
  const download = document.getElementById('mac-dialog-download');
  const ack = document.getElementById('mac-ack');
  const status = document.getElementById('mac-dialog-status');
  const copyBtn = document.getElementById('mac-copy-xattr');
  if (!(dialog instanceof HTMLDialogElement) || !download) {
    startInstallerDownload(downloadUrl);
    return;
  }
  pending_mac_dmg_url = downloadUrl;
  download.href = downloadUrl;
  download.target = 'otpeer-download';
  download.textContent = 'Download installer';
  if (ack instanceof HTMLInputElement) ack.checked = false;
  if (status instanceof HTMLElement) status.hidden = true;
  if (copyBtn) copyBtn.textContent = 'Copy commands';
  syncMacDownloadEnabled();
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function setupMacUnsignedGate() {
  const dialog = document.getElementById('mac-unsigned-dialog');
  const copyBtn = document.getElementById('mac-copy-xattr');
  const cmd = document.getElementById('mac-xattr-cmd');
  const download = document.getElementById('mac-dialog-download');
  const cancel = document.getElementById('mac-dialog-cancel');
  const ack = document.getElementById('mac-ack');
  const status = document.getElementById('mac-dialog-status');

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest('a');
    if (!(link instanceof HTMLAnchorElement)) return;
    if (link.id === 'mac-dialog-download') return;

    const wants_mac_flow =
      link.hasAttribute('data-mac-install')
      || link.getAttribute('data-platform') === 'mac-arm64'
      || link.getAttribute('data-platform') === 'mac-x64'
      || isMacDmgUrl(link.href);

    if (!wants_mac_flow) return;

    const url = isMacDmgUrl(link.href) ? link.href : pending_mac_dmg_url;
    event.preventDefault();
    openMacUnsignedDialog(url);
  });

  if (ack instanceof HTMLInputElement) {
    ack.addEventListener('change', syncMacDownloadEnabled);
  }

  if (copyBtn && cmd) {
    copyBtn.addEventListener('click', async () => {
      const text = cmd.textContent?.replace(/\n+/g, '\n').trim() || '';
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = 'Copied';
        setTimeout(() => {
          copyBtn.textContent = 'Copy commands';
        }, 1600);
      } catch {
        copyBtn.textContent = 'Select & copy';
      }
    });
  }

  if (download instanceof HTMLAnchorElement) {
    download.addEventListener('click', (event) => {
      if (download.getAttribute('aria-disabled') === 'true') {
        event.preventDefault();
        return;
      }
      // Native navigation into #otpeer-download-frame starts the .dmg download
      // without opening a blank tab or unloading this page.
      download.textContent = 'Download started';
      if (status instanceof HTMLElement) status.hidden = false;
    });
  }

  if (cancel) {
    cancel.addEventListener('click', () => {
      if (dialog instanceof HTMLDialogElement) dialog.close();
    });
  }

  if (dialog instanceof HTMLDialogElement) {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  }
}

function emphasizeMacInstallNote(isMac) {
  const card = document.getElementById('mac-unsigned-note');
  if (card instanceof HTMLElement) card.classList.toggle('is-emphasized', isMac);
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

  // Keep hint to one reserved line (min-height + ellipsis) so version never shifts layout.

  if (platform.isPhone) {
    primary.textContent = 'Mobile app — Coming soon';
    primary.removeAttribute('data-mac-install');
    setLinkHref(primary, '#surfaces');
    primary.classList.add('is-disabled');
    primary.setAttribute('aria-disabled', 'true');
    hint.textContent = 'Desktop and CLI are below. Mobile app coming soon.';
    return;
  }

  const key = preferredKey(platform);
  const labels = {
    'mac-arm64': 'Download for macOS',
    'mac-x64': 'Download for macOS',
    win: 'Download for Windows',
    'linux-appimage': 'Download for Linux',
  };
  const version_label = tag ? `Latest: ${tag}` : null;

  primary.classList.remove('is-disabled');
  primary.removeAttribute('aria-disabled');

  if (platform.os === 'mac') {
    primary.textContent = labels[key] || 'Download for macOS';
    primary.setAttribute('data-mac-install', '1');
    const dmg = (key && urls[key]) || urls['mac-arm64'] || urls['mac-x64'] || RELEASES_PAGE;
    pending_mac_dmg_url = dmg;
    setLinkHref(primary, '#download');
    hint.textContent = version_label
      ? `${version_label} · confirm install note, then download`
      : 'Confirm install note, then download.';
    return;
  }

  primary.removeAttribute('data-mac-install');

  if (key && urls[key]) {
    primary.textContent = labels[key] || 'Download Desktop';
    setLinkHref(primary, urls[key]);
    hint.textContent = version_label || 'Matching installer ready for your system.';
  } else {
    primary.textContent = 'Download Desktop';
    setLinkHref(primary, RELEASES_PAGE);
    hint.textContent = version_label || 'Open GitHub Releases to pick an installer.';
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
  emphasizeMacInstallNote(platform.os === 'mac');
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
setupMacUnsignedGate();
