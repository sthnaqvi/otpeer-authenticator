'use strict';

const readline = require('readline');

/**
 * Ask a plain (visible) question on the terminal. For masked input use
 * PasswordPrompt instead.
 */
function question(message) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(message, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

module.exports = { question };
