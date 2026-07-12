'use strict';

const readline = require('readline');
const { readLineFromPipe } = require('./stdin-lines');

/**
 * Ask a plain (visible) question on the terminal. For masked input use
 * PasswordPrompt instead. On piped stdin this draws from the same shared
 * line queue as PasswordPrompt, so mixed prompt sequences stay scriptable.
 */
function question(message) {
    if (!process.stdin.isTTY) {
        process.stdout.write(message);
        return readLineFromPipe(process.stdin).then((line) => {
            process.stdout.write('\n');
            return line.trim();
        });
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(message, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

module.exports = { question };
