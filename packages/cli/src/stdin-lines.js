'use strict';

const readline = require('readline');

/**
 * Shared line dispenser for piped/non-TTY stdin. Every prompt in the CLI
 * (masked passwords AND plain questions) must draw lines from this single
 * reader — if each prompt created its own readline interface, the first
 * one would swallow all buffered lines and later prompts would hang. This
 * is what makes multi-prompt runs scriptable:
 *
 *   printf "vaultpw\ny\n" | auth --sync <uri>
 */

let sharedReader = null;
const bufferedLines = [];
const lineWaiters = [];

function readLineFromPipe(input) {
    if (!sharedReader) {
        sharedReader = readline.createInterface({ input });
        sharedReader.on('line', (line) => {
            const waiter = lineWaiters.shift();
            if (waiter) waiter(line);
            else bufferedLines.push(line);
        });
        sharedReader.on('close', () => {
            // stdin ended: unblock any waiting prompt with empty input
            while (lineWaiters.length) lineWaiters.shift()('');
        });
    }
    return new Promise((resolve) => {
        if (bufferedLines.length) resolve(bufferedLines.shift());
        else lineWaiters.push(resolve);
    });
}

module.exports = { readLineFromPipe };
