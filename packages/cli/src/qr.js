'use strict';

/**
 * QR rendering for both surfaces the CLI needs: terminal (--qr) and SVG
 * (--export --paper). Built on qrcode-generator's public API — a direct,
 * declared dependency (never reach into another package's internals).
 */

const qrcodeGenerator = require('qrcode-generator');

/** @param {'L'|'M'|'Q'|'H'} errorCorrection */
function buildQr(text, errorCorrection = 'M') {
    const qr = qrcodeGenerator(0 /* auto-size */, errorCorrection);
    qr.addData(text);
    qr.make();
    return qr;
}

/** Render as inline SVG (for the printable paper backup). */
function toSvg(text, moduleSize = 4) {
    const qr = buildQr(text);
    const count = qr.getModuleCount();
    const size = count * moduleSize;
    const rects = [];
    for (let row = 0; row < count; row++) {
        for (let col = 0; col < count; col++) {
            if (qr.isDark(row, col)) {
                rects.push(`<rect x="${col * moduleSize}" y="${row * moduleSize}" width="${moduleSize}" height="${moduleSize}"/>`);
            }
        }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><g fill="#000">${rects.join('')}</g></svg>`;
}

/**
 * Render for a dark terminal using half-block characters (two QR rows per
 * text line). Light modules are drawn as filled (bright) blocks so the
 * code reads dark-on-light to a camera, with a quiet-zone border.
 */
function toTerminal(text) {
    const qr = buildQr(text, 'L');
    const count = qr.getModuleCount();
    const BORDER = 2;
    const total = count + BORDER * 2;
    // isLight with border: outside the symbol everything is light
    const isLight = (row, col) => {
        const r = row - BORDER;
        const c = col - BORDER;
        if (r < 0 || c < 0 || r >= count || c >= count) return true;
        return !qr.isDark(r, c);
    };

    const lines = [];
    for (let row = 0; row < total; row += 2) {
        let line = '';
        for (let col = 0; col < total; col++) {
            const top = isLight(row, col);
            const bottom = row + 1 < total ? isLight(row + 1, col) : true;
            line += top && bottom ? '█' : top ? '▀' : bottom ? '▄' : ' ';
        }
        lines.push(line);
    }
    return lines.join('\n');
}

module.exports = { toSvg, toTerminal };
