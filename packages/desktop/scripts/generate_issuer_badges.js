'use strict';
/**
 * White-circle issuer badges for OTPeer design language (otpeer-design-01b).
 * Run: node scripts/generate_issuer_badges.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { Resvg } = require('@resvg/resvg-js');
const { spawnSync } = require('child_process');
const OUT = path.join(__dirname, '..', 'build', 'issuers');
const FILL = 0.74;

function fetchBuf(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'OTPeerAuthenticator/0.1' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchBuf(res.headers.location).then(resolve, reject);
            }
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode} ${url}`));
                res.resume();
                return;
            }
            const chunks = [];
            res.on('data', (d) => chunks.push(d));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', reject);
    });
}

function colorize(svg, color) {
    let text = svg.replace(/fill="[^"]*"/g, `fill="${color}"`);
    if (!/<path[^>]*fill=/.test(text)) text = text.replace(/<path /g, `<path fill="${color}" `);
    return text;
}

const PY = `
from PIL import Image, ImageDraw
import sys
im = Image.open(sys.argv[1]).convert("RGBA")
fill = float(sys.argv[3])
px = im.load(); w, h = im.size
xs, ys = [], []
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if a > 16 and not (r > 245 and g > 245 and b > 245):
            xs.append(x); ys.append(y)
cropped = im.crop((min(xs), min(ys), max(xs) + 1, max(ys) + 1))
SIZE = 512
target = int(SIZE * fill)
scale = target / max(cropped.size)
nw = max(1, int(round(cropped.width * scale)))
nh = max(1, int(round(cropped.height * scale)))
fitted = cropped.resize((nw, nh), Image.Resampling.LANCZOS)
badge = Image.new("RGBA", (SIZE, SIZE), (255, 255, 255, 255))
badge.paste(fitted, ((SIZE - nw) // 2, (SIZE - nh) // 2), fitted)
mask = Image.new("L", (SIZE, SIZE), 0)
ImageDraw.Draw(mask).ellipse((0, 0, SIZE - 1, SIZE - 1), fill=255)
badge.putalpha(mask)
badge.save(sys.argv[2], "PNG")
print(sys.argv[2], nw, nh, "fill", fill)
`;

function makeBadge(rawPng, outFile, fill) {
    const tin = path.join(require('os').tmpdir(), `otpeer-in-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.png`);
    const py = path.join(require('os').tmpdir(), `otpeer-py-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.py`);
    fs.writeFileSync(tin, rawPng);
    fs.writeFileSync(py, PY);
    const r = spawnSync('python3', [py, tin, outFile, String(fill)], { encoding: 'utf8' });
    try { fs.unlinkSync(tin); fs.unlinkSync(py); } catch { /* */ }
    if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'fail');
    process.stdout.write(r.stdout);
}

async function fromSimple(slug, color, file, fill = FILL) {
    const svg = colorize(
        (await fetchBuf(`https://cdn.jsdelivr.net/npm/simple-icons@v13/icons/${slug}.svg`)).toString('utf8'),
        color,
    );
    const png = Buffer.from(new Resvg(svg, {
        fitTo: { mode: 'width', value: 1024 },
        background: 'rgba(0,0,0,0)',
    }).render().asPng());
    makeBadge(png, path.join(OUT, file), fill);
}

async function fromTwoToneSimple(slug, file, fill = FILL, smileSplit = 0.62) {
    let svg = colorize(
        (await fetchBuf(`https://cdn.jsdelivr.net/npm/simple-icons@v13/icons/${slug}.svg`)).toString('utf8'),
        '#111111',
    );
    const png = Buffer.from(new Resvg(svg, {
        fitTo: { mode: 'width', value: 1024 },
        background: 'rgba(0,0,0,0)',
    }).render().asPng());
    const tin = path.join(require('os').tmpdir(), `otpeer-${slug}-${Date.now()}.png`);
    const mid = path.join(require('os').tmpdir(), `otpeer-${slug}-mid-${Date.now()}.png`);
    fs.writeFileSync(tin, png);
    const py = `
from PIL import Image
im = Image.open(${JSON.stringify(tin)}).convert("RGBA")
px = im.load(); w, h = im.size
xs, ys = [], []
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if a > 40 and r < 80:
            xs.append(x); ys.append(y)
if xs:
    y0, y1 = min(ys), max(ys)
    split = y0 + int((y1 - y0) * ${smileSplit})
    for y in range(split, h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 40 and r < 80:
                px[x, y] = (255, 153, 0, a)
im.save(${JSON.stringify(mid)})
`;
    const pyf = path.join(require('os').tmpdir(), `otpeer-${slug}-${Date.now()}.py`);
    fs.writeFileSync(pyf, py);
    const r = spawnSync('python3', [pyf], { encoding: 'utf8' });
    try { fs.unlinkSync(pyf); fs.unlinkSync(tin); } catch { /* */ }
    if (r.status !== 0) throw new Error(r.stderr || r.stdout || `${slug} tone failed`);
    makeBadge(fs.readFileSync(mid), path.join(OUT, file), fill);
    try { fs.unlinkSync(mid); } catch { /* */ }
}

async function main() {
    fs.mkdirSync(OUT, { recursive: true });
    const amazon_keep = path.join(OUT, 'amazon.png');
    const amazon_bak = path.join(require('os').tmpdir(), 'otpeer-amazon-keep.png');
    if (fs.existsSync(amazon_keep)) fs.copyFileSync(amazon_keep, amazon_bak);

    await fromSimple('openvpn', '#EA7E20', 'openvpn.png', 0.70);
    await fromTwoToneSimple('amazon', 'amazon.png');
    await fromTwoToneSimple('amazonwebservices', 'aws.png', 0.72, 0.55);
    await fromSimple('github', '#181717', 'github.png', 0.74);
    await fromSimple('dropbox', '#0061FF', 'dropbox.png');
    makeBadge(
        await fetchBuf('https://www.google.com/images/branding/googleg/2x/googleg_standard_color_128dp.png'),
        path.join(OUT, 'google.png'),
        FILL,
    );
    const ms = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <rect fill="#F25022" x="1" y="1" width="10" height="10"/>
      <rect fill="#7FBA00" x="13" y="1" width="10" height="10"/>
      <rect fill="#00A4EF" x="1" y="13" width="10" height="10"/>
      <rect fill="#FFB900" x="13" y="13" width="10" height="10"/></svg>`;
    makeBadge(
        Buffer.from(new Resvg(ms, {
            fitTo: { mode: 'width', value: 1024 },
            background: 'rgba(0,0,0,0)',
        }).render().asPng()),
        path.join(OUT, 'microsoft.png'),
        0.70,
    );

    // Additional brands
    await fromSimple('instagram', '#E4405F', 'instagram.png');
    await fromSimple('heroku', '#430098', 'heroku.png');
    await fromSimple('zerodha', '#387ED1', 'zerodha.png');
    await fromSimple('auth0', '#EB5424', 'auth0.png');
    await fromSimple('okta', '#007DC1', 'okta.png');
    await fromSimple('facebook', '#0866FF', 'facebook.png');
    await fromSimple('x', '#000000', 'x.png');
    await fromSimple('linkedin', '#0A66C2', 'linkedin.png');
    await fromSimple('reddit', '#FF4500', 'reddit.png');
    // Yellow Snapchat ghost is invisible on white — use black silhouette
    await fromSimple('snapchat', '#111111', 'snapchat.png');
    await fromSimple('discord', '#5865F2', 'discord.png');

    if (fs.existsSync(amazon_bak)) {
        fs.copyFileSync(amazon_bak, amazon_keep);
        try { fs.unlinkSync(amazon_bak); } catch { /* */ }
        console.log('restored amazon.png');
    }
    console.log('done', OUT);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
