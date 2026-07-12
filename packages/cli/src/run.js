'use strict';

const core = require('../core');
const ui = require('./ui');

/** Color the countdown: calm green → warning yellow → urgent red. */
const expiryCell = (seconds) => {
    const label = `${String(seconds).padStart(2)}s`;
    if (seconds <= 5) return ui.red(label);
    if (seconds <= 10) return ui.yellow(label);
    return ui.green(label);
};

const formatCode = (code) => ui.bold(String(code ?? ''));

/**
 * Live authenticator view. Repaints in place (cursor home + clear-below)
 * instead of clearing the whole screen each second — no flicker — and
 * restores the cursor on exit.
 *
 * @param {String} password
 */
async function run(password) {
    const accounts = await core.accounts.getActive(password);
    if (!accounts || !accounts.length) {
        throw new Error('No account found');
    }

    core.updateTotp(accounts);

    ui.cursor.clearScreen();
    ui.cursor.hide();
    const restore = () => {
        ui.cursor.show();
        process.stdout.write('\n');
        process.exit(0);
    };
    process.on('SIGINT', restore);
    process.on('SIGTERM', restore);

    const paint = () => {
        const rows = accounts.map((account) => {
            const params = core.getOtpParams(account);
            const isHotp = params.type === 'HOTP';
            return [
                ui.cyan(account.name_with_issuer ?? account.name),
                isHotp ? ui.dim('(use -t to generate)') : formatCode(account.totp),
                isHotp ? ui.dim('—') : expiryCell(core.getTimeout(params.period)),
            ];
        });

        const header = `${ui.bold('authenticator-clui')} ${ui.dim(`· ${accounts.length} account(s) · ${new Date().toLocaleTimeString()} · Ctrl+C to exit`)}`;
        ui.cursor.home();
        process.stdout.write(`${header}\n${ui.renderTable(['Account', 'Code', 'Expires'], rows)}\n`);
        ui.cursor.clearBelow();
    };

    paint();
    setInterval(paint, 1000);
}

module.exports = run;
