'use strict';

const { spawn } = require('child_process');

/**
 * Copy text to the system clipboard using the platform's native tool —
 * no npm dependency. Tries each candidate in order (Linux has several,
 * depending on X11/Wayland setup).
 */
function copyToClipboard(text) {
    const candidates =
        process.platform === 'darwin' ? [['pbcopy', []]]
        : process.platform === 'win32' ? [['clip', []]]
        : [['wl-copy', []], ['xclip', ['-selection', 'clipboard']], ['xsel', ['--clipboard', '--input']]];

    return new Promise((resolve, reject) => {
        const tryNext = (index) => {
            if (index >= candidates.length) {
                return reject(new Error(
                    'No clipboard tool found. Install xclip, xsel, or wl-clipboard, or use --code to print instead.'
                ));
            }
            const [cmd, args] = candidates[index];
            const child = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'ignore'] });
            child.on('error', () => tryNext(index + 1));
            child.on('close', (code) => (code === 0 ? resolve() : tryNext(index + 1)));
            child.stdin.on('error', () => undefined); // EPIPE when the tool is missing
            child.stdin.end(text);
        };
        tryNext(0);
    });
}

module.exports = { copyToClipboard };
