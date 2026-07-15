/**
 * Resolve issuer → website domain for favicon fetch (from issuer side).
 * No hand-drawn brand SVGs — icons are loaded from the issuer's own site
 * (via Google favicon of that domain) and cached by the main process.
 */

const ISSUER_DOMAINS: Record<string, string> = {
    github: 'github.com',
    google: 'google.com',
    microsoft: 'microsoft.com',
    amazon: 'amazon.com',
    aws: 'aws.amazon.com',
    amazonwebservices: 'aws.amazon.com',
    amazonaws: 'aws.amazon.com',
    amazonweb: 'aws.amazon.com',

    dropbox: 'dropbox.com',
    slack: 'slack.com',
    apple: 'apple.com',
    discord: 'discord.com',
    twitter: 'x.com',
    x: 'x.com',
    facebook: 'facebook.com',
    meta: 'facebook.com',
    instagram: 'instagram.com',
    ig: 'instagram.com',
    snapchat: 'snapchat.com',
    snap: 'snapchat.com',
    gitlab: 'gitlab.com',
    bitbucket: 'bitbucket.org',
    openvpn: 'openvpn.net',
    digitalocean: 'digitalocean.com',
    cloudflare: 'cloudflare.com',
    atria: 'atlassian.com',
    atlassian: 'atlassian.com',
    jira: 'atlassian.com',
    steam: 'steampowered.com',
    proton: 'proton.me',
    protonmail: 'proton.me',
    bitwarden: 'bitwarden.com',
    lastpass: 'lastpass.com',
    onepassword: '1password.com',
    '1password': '1password.com',
    adobe: 'adobe.com',
    linkedin: 'linkedin.com',
    reddit: 'reddit.com',
    netflix: 'netflix.com',
    heroku: 'heroku.com',
    zerodha: 'zerodha.com',
    kite: 'zerodha.com',
    npm: 'npmjs.com',
    docker: 'docker.com',
    okta: 'okta.com',
    auth0: 'auth0.com',
};

export function normalizeIssuerKey(issuer?: string, name?: string): string {
    const raw = (issuer || name || '').toLowerCase().trim();
    return raw.replace(/[^a-z0-9]+/g, '');
}

/** Best-effort domain for this account's issuer (null → letter fallback). */
export function resolveIssuerDomain(issuer?: string, name?: string): string | null {
    const key = normalizeIssuerKey(issuer, name);
    if (!key) return null;
    if (ISSUER_DOMAINS[key]) return ISSUER_DOMAINS[key];
    for (const [k, domain] of Object.entries(ISSUER_DOMAINS)) {
        if (key.includes(k) || k.includes(key)) return domain;
    }
    // "Something Inc" → try something.com from issuer words
    const label = (issuer || name || '').toLowerCase().trim();
    const token = label.split(/[\s/@._-]+/).find((t) => t.length > 2 && /^[a-z0-9]+$/.test(t));
    if (token && !['com', 'org', 'net', 'io', 'www', 'mail'].includes(token)) {
        return `${token}.com`;
    }
    return null;
}

export function fallbackLetter(issuer?: string, name?: string): string {
    const raw = (issuer || name || '?').trim();
    return (raw.charAt(0) || '?').toUpperCase();
}

export function letterBg(seed: string): string {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
    const hues = [199, 205, 190, 210, 185];
    const hue = hues[Math.abs(hash) % hues.length];
    return `hsl(${hue} 38% 32%)`;
}
