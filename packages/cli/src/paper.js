'use strict';

/**
 * Paper backup: render the encrypted backup JSON as a printable,
 * self-contained HTML sheet — QR chunks for scanning (mobile restore) plus
 * the raw text (authoritative copy: retype/OCR it into a file and
 * `auth --import <file>` restores it). The payload is the standard
 * encrypted backup, so a found sheet without the backup password is
 * useless.
 *
 * Presentation lives in templates/paper-backup.html; this module only
 * fills the placeholders.
 */

const fs = require('fs');
const path = require('path');
const { toSvg } = require('./qr');

const TEMPLATE_PATH = path.join(__dirname, 'templates', 'paper-backup.html');

/** Keep chunks well inside byte-mode QR capacity so scans stay easy. */
const CHUNK_SIZE = 1000;
const CHUNK_PREFIX = 'ACLUIPB'; // authenticator-clui paper backup

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/**
 * Split the backup payload into self-describing chunks:
 * "ACLUIPB:<index>/<total>:<data>" — order-independent reassembly.
 */
function chunkPayload(payload) {
    const chunks = [];
    const total = Math.ceil(payload.length / CHUNK_SIZE);
    for (let i = 0; i < total; i++) {
        chunks.push(`${CHUNK_PREFIX}:${i + 1}/${total}:${payload.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)}`);
    }
    return chunks;
}

/** Reassemble chunk strings (any order) back into the payload. */
function assembleChunks(chunkStrings) {
    const parsed = chunkStrings.map((chunk) => {
        const match = /^ACLUIPB:(\d+)\/(\d+):([\s\S]*)$/.exec(chunk.trim());
        if (!match) throw new Error('Not a paper-backup chunk');
        return { index: Number(match[1]), total: Number(match[2]), data: match[3] };
    });
    const total = parsed[0].total;
    if (parsed.length !== total) throw new Error(`Expected ${total} chunks, got ${parsed.length}`);
    return parsed
        .sort((a, b) => a.index - b.index)
        .map((c) => c.data)
        .join('');
}

function renderPaperBackupHtml(backupJson, accountCount) {
    const qrBlocks = chunkPayload(backupJson)
        .map((chunk, i, all) => `      <figure>\n        ${toSvg(chunk)}\n        <figcaption>Part ${i + 1} of ${all.length}</figcaption>\n      </figure>`)
        .join('\n');

    return fs.readFileSync(TEMPLATE_PATH, 'utf-8')
        .replace('{{GENERATED}}', new Date().toISOString())
        .replace('{{ACCOUNT_COUNT}}', String(accountCount))
        .replace('{{QR_BLOCKS}}', qrBlocks)
        .replace('{{PAYLOAD}}', escapeHtml(backupJson));
}

module.exports = { renderPaperBackupHtml, chunkPayload, assembleChunks };
