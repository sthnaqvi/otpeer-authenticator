'use strict';

/**
 * Terminal UI helpers: ANSI colors, status symbols, cursor control, and a
 * small box table renderer. Raw escape codes instead of a color library —
 * one less dependency to audit for a security tool. Colors are dropped
 * automatically when stdout isn't a TTY (piped/scripted use).
 */

const ESC = String.fromCharCode(27);
const isTTY = process.stdout.isTTY === true;

const wrap = (open, close) => (text) => (isTTY ? `${ESC}[${open}m${text}${ESC}[${close}m` : `${text}`);

const bold = wrap('1', '22');
const dim = wrap('2', '22');
const red = wrap('31', '39');
const green = wrap('32', '39');
const yellow = wrap('33', '39');
const cyan = wrap('36', '39');

const ok = (message) => console.log(`${green('✔')} ${message}`);
const info = (message) => console.log(`${cyan('ℹ')} ${message}`);
const warn = (message) => console.log(`${yellow('⚠')} ${message}`);
const err = (message) => console.error(`${red('✖')} ${message}`);

const cursor = {
    hide: () => isTTY && process.stdout.write(`${ESC}[?25l`),
    show: () => isTTY && process.stdout.write(`${ESC}[?25h`),
    /** Move home and repaint over the previous frame — smoother than console.clear() */
    home: () => process.stdout.write(`${ESC}[H`),
    clearBelow: () => process.stdout.write(`${ESC}[0J`),
    clearScreen: () => process.stdout.write(`${ESC}[2J${ESC}[H`),
};

/** Visible width of a cell, ignoring any ANSI codes already applied. */
const visibleLength = (text) => String(text).replace(new RegExp(`${ESC}\\[[0-9;]*m`, 'g'), '').length;

const padCell = (text, width) => String(text) + ' '.repeat(Math.max(0, width - visibleLength(text)));

/**
 * Render rows into a box-drawn table. Cells may contain ANSI colors —
 * widths are computed on visible characters.
 *
 * @param {string[]} head column titles
 * @param {Array<string[]>} rows
 * @returns {string}
 */
function renderTable(head, rows) {
    const widths = head.map((title, col) =>
        Math.max(visibleLength(title), ...rows.map((row) => visibleLength(row[col])))
    );
    const line = (left, fill, joint, right) =>
        left + widths.map((w) => fill.repeat(w + 2)).join(joint) + right;
    const renderRow = (cells) =>
        '│ ' + cells.map((cell, col) => padCell(cell, widths[col])).join(' │ ') + ' │';
    const rowSeparator = line('├', '─', '┼', '┤');

    return [
        line('┌', '─', '┬', '┐'),
        renderRow(head.map((title) => bold(title))),
        rowSeparator,
        // separator between every data row — matches the classic cli-table look
        ...rows.flatMap((row, i) => (i === 0 ? [renderRow(row)] : [rowSeparator, renderRow(row)])),
        line('└', '─', '┴', '┘'),
    ].join('\n');
}

module.exports = { bold, dim, red, green, yellow, cyan, ok, info, warn, err, cursor, renderTable, isTTY };
