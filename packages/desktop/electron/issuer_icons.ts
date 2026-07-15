import path from 'path';
import fs from 'fs';
import https from 'https';
import { spawnSync } from 'child_process';
import { app } from 'electron';

/**
 * Issuer icons (OTPeer design language — otpeer-design-01b):
 * Prefer bundled white-circle badges in build/issuers/ (crisp, consistent fill).
 * Fall back to network SVG/PNG for unknown issuers.
 */

const CACHE_VERSION = 'v12';

/** Domain → filename under build/issuers/ */
const BUNDLED: Record<string, string> = {
    'openvpn.net': 'openvpn.png',
    'amazon.com': 'amazon.png',
    'aws.amazon.com': 'aws.png',
    'google.com': 'google.png',
    'github.com': 'github.png',
    'microsoft.com': 'microsoft.png',
    'dropbox.com': 'dropbox.png',
    'instagram.com': 'instagram.png',
    'heroku.com': 'heroku.png',
    'zerodha.com': 'zerodha.png',
    'kite.zerodha.com': 'zerodha.png',
    'auth0.com': 'auth0.png',
    'okta.com': 'okta.png',
    'facebook.com': 'facebook.png',
    'x.com': 'x.png',
    'twitter.com': 'x.png',
    'linkedin.com': 'linkedin.png',
    'reddit.com': 'reddit.png',
    'snapchat.com': 'snapchat.png',
    'discord.com': 'discord.png',
};

const SIMPLE_ICONS: Record<string, { slug: string; color: string }> = {
    'amazon.com': { slug: 'amazon', color: 'FF9900' },
    'aws.amazon.com': { slug: 'amazonwebservices', color: '232F3E' },
    'github.com': { slug: 'github', color: '181717' },
    'dropbox.com': { slug: 'dropbox', color: '0061FF' },
    'slack.com': { slug: 'slack', color: '4A154B' },
    'apple.com': { slug: 'apple', color: '000000' },
    'discord.com': { slug: 'discord', color: '5865F2' },
    'gitlab.com': { slug: 'gitlab', color: 'FC6D26' },
    'bitbucket.org': { slug: 'bitbucket', color: '0052CC' },
    'openvpn.net': { slug: 'openvpn', color: 'EA7E20' },
    'x.com': { slug: 'x', color: '000000' },
    'twitter.com': { slug: 'x', color: '000000' },
    'facebook.com': { slug: 'facebook', color: '0866FF' },
    'instagram.com': { slug: 'instagram', color: 'E4405F' },
    'digitalocean.com': { slug: 'digitalocean', color: '0080FF' },
    'cloudflare.com': { slug: 'cloudflare', color: 'F38020' },
    'atlassian.com': { slug: 'atlassian', color: '0052CC' },
    'steampowered.com': { slug: 'steam', color: '000000' },
    'proton.me': { slug: 'protonmail', color: '6D4AFF' },
    'bitwarden.com': { slug: 'bitwarden', color: '175DDC' },
    '1password.com': { slug: '1password', color: '0094F5' },
    'adobe.com': { slug: 'adobe', color: 'FF0000' },
    'linkedin.com': { slug: 'linkedin', color: '0A66C2' },
    'reddit.com': { slug: 'reddit', color: 'FF4500' },
    'snapchat.com': { slug: 'snapchat', color: '000000' },
    'netflix.com': { slug: 'netflix', color: 'E50914' },
    'heroku.com': { slug: 'heroku', color: '430098' },
    'zerodha.com': { slug: 'zerodha', color: '387ED1' },
    'kite.zerodha.com': { slug: 'zerodha', color: '387ED1' },
    'npmjs.com': { slug: 'npm', color: 'CB3837' },
    'docker.com': { slug: 'docker', color: '2496ED' },
    'okta.com': { slug: 'okta', color: '007DC1' },
    'auth0.com': { slug: 'auth0', color: 'EB5424' },
};

const BRAND_PNG: Record<string, string> = {
    'google.com':
        'https://www.google.com/images/branding/googleg/2x/googleg_standard_color_128dp.png',
};

const MICROSOFT_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <rect fill="#F25022" x="1" y="1" width="10" height="10"/>
  <rect fill="#7FBA00" x="13" y="1" width="10" height="10"/>
  <rect fill="#00A4EF" x="1" y="13" width="10" height="10"/>
  <rect fill="#FFB900" x="13" y="13" width="10" height="10"/>
</svg>`;

function cacheDir(): string {
    const dir = path.join(app.getPath('userData'), 'issuer-icons');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function cachePath(domain: string, ext: string): string {
    const safe = domain.replace(/[^a-z0-9.-]/gi, '_').toLowerCase();
    return path.join(cacheDir(), `${safe}.${CACHE_VERSION}.${ext}`);
}

function bundledFile(domain: string): string | null {
    const name = BUNDLED[domain];
    if (!name) return null;
    const file = path.join(__dirname, '..', 'build', 'issuers', name);
    return fs.existsSync(file) ? file : null;
}

function fetchBuffer(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'OTPeerAuthenticator/0.1',
                Accept: 'image/svg+xml,image/png,image/*,*/*',
            },
        }, (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                fetchBuffer(res.headers.location).then(resolve, reject);
                return;
            }
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                res.resume();
                return;
            }
            const chunks: Buffer[] = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
}

function isSvg(buf: Buffer): boolean {
    const head = buf.slice(0, 400).toString('utf8');
    return head.includes('<svg') || (head.includes('<?xml') && head.includes('svg'));
}

function looksLikeRaster(buf: Buffer): boolean {
    if (buf.length < 64) return false;
    if (buf[0] === 0x89 && buf[1] === 0x50) return true;
    if (buf[0] === 0xff && buf[1] === 0xd8) return true;
    if (buf[0] === 0x47 && buf[1] === 0x49) return true;
    if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01) return true;
    if (buf.toString('ascii', 0, 4) === 'RIFF') return true;
    return buf.length > 400;
}

function colorizeSvg(text: string, color: string): string {
    let out = text.replace(/fill="[^"]*"/g, `fill="${color}"`);
    out = out.replace(/fill='[^']*'/g, `fill='${color}'`);
    if (!/<path[^>]*fill=/.test(out)) {
        out = out.replace(/<path /g, `<path fill="${color}" `);
    }
    if (!/\swidth=/.test(out)) {
        out = out.replace('<svg', '<svg width="128" height="128"');
    }
    return out;
}

function svgDataUrl(svg_text: string): string {
    return `data:image/svg+xml;base64,${Buffer.from(svg_text, 'utf8').toString('base64')}`;
}

/** Trim + place mark on transparent square (~78% fill). CSS supplies white circle + pad. */
function refineRaster(buf: Buffer): Buffer {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const tmpIn = path.join(app.getPath('temp'), `otpeer-in-${stamp}.png`);
    const tmpOut = path.join(app.getPath('temp'), `otpeer-out-${stamp}.png`);
    const py = path.join(app.getPath('temp'), `otpeer-refine-${stamp}.py`);
    const script = `
from PIL import Image
import sys
im = Image.open(sys.argv[1]).convert("RGBA")
px = im.load(); w, h = im.size
def empty(x, y):
    r, g, b, a = px[x, y]
    return a < 16 or (r > 245 and g > 245 and b > 245)
xs, ys = [], []
for y in range(h):
    for x in range(w):
        if not empty(x, y):
            xs.append(x); ys.append(y)
if not xs:
    Image.new("RGBA", (256, 256), (0, 0, 0, 0)).save(sys.argv[2], "PNG")
    raise SystemExit
cropped = im.crop((min(xs), min(ys), max(xs) + 1, max(ys) + 1))
SIZE, FILL = 256, 0.78
target = int(SIZE * FILL)
scale = target / max(cropped.width, cropped.height)
nw = max(1, int(round(cropped.width * scale)))
nh = max(1, int(round(cropped.height * scale)))
fitted = cropped.resize((nw, nh), Image.Resampling.LANCZOS)
out = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
out.paste(fitted, ((SIZE - nw) // 2, (SIZE - nh) // 2), fitted)
out.save(sys.argv[2], "PNG")
`;
    try {
        fs.writeFileSync(tmpIn, buf);
        fs.writeFileSync(py, script);
        const result = spawnSync('python3', [py, tmpIn, tmpOut], { encoding: 'utf8' });
        if (result.status === 0 && fs.existsSync(tmpOut)) return fs.readFileSync(tmpOut);
    } catch {
        // fall through
    } finally {
        for (const f of [tmpIn, tmpOut, py]) {
            try { fs.unlinkSync(f); } catch { /* ignore */ }
        }
    }
    return buf;
}

function candidateUrls(domain: string): string[] {
    const urls: string[] = [];
    if (BRAND_PNG[domain]) urls.push(BRAND_PNG[domain]);
    const simple = SIMPLE_ICONS[domain];
    if (simple) {
        urls.push(`https://cdn.jsdelivr.net/npm/simple-icons@v13/icons/${simple.slug}.svg`);
    }
    urls.push(`https://logo.clearbit.com/${encodeURIComponent(domain)}`);
    urls.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`);
    urls.push(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`);
    return urls;
}

export async function resolveIssuerIconDataUrl(domain: string): Promise<string | null> {
    const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
    if (!clean || clean.length < 3) return null;

    const local = bundledFile(clean);
    if (local) {
        return `data:image/png;base64,${fs.readFileSync(local).toString('base64')}`;
    }

    const svgFile = cachePath(clean, 'svg');
    const pngFile = cachePath(clean, 'png');
    try {
        if (fs.existsSync(svgFile) && fs.statSync(svgFile).size > 40) {
            return svgDataUrl(fs.readFileSync(svgFile, 'utf8'));
        }
        if (fs.existsSync(pngFile) && fs.statSync(pngFile).size > 200) {
            return `data:image/png;base64,${fs.readFileSync(pngFile).toString('base64')}`;
        }
    } catch {
        // fetch
    }

    if (clean === 'microsoft.com') {
        fs.writeFileSync(svgFile, MICROSOFT_SVG);
        return svgDataUrl(MICROSOFT_SVG);
    }

    for (const url of candidateUrls(clean)) {
        try {
            const buf = await fetchBuffer(url);
            if (isSvg(buf)) {
                const meta = SIMPLE_ICONS[clean];
                const color = meta ? `#${meta.color}` : '#111111';
                const colored = colorizeSvg(buf.toString('utf8'), color);
                fs.writeFileSync(svgFile, colored);
                return svgDataUrl(colored);
            }
            if (!looksLikeRaster(buf)) continue;
            const refined = refineRaster(buf);
            fs.writeFileSync(pngFile, refined);
            return `data:image/png;base64,${refined.toString('base64')}`;
        } catch {
            // next
        }
    }
    return null;
}
