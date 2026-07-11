'use strict';

const Table = require('cli-table');
const core = require('../core');

const log = require('./log');

/**
 * Run authenticator on CMD: fetch accounts, keep their TOTP codes updating,
 * and redraw the table once a second. Rendering/display concerns live here
 * in the CLI package — @authenticator/core only generates codes, it never
 * prints anything.
 *
 * @param {String} password
 */
async function run(password) {
    console.log('Starting authenticator ...');
    const tr_timeout = 1000; // Table refresh timeout for expiry timer
    const _accounts = await core.accounts.get(password);
    if (_accounts && Object.keys(_accounts).length) {
        console.log(`${Object.keys(_accounts).length} account(s) found`);
        core.updateTotp(_accounts);
        setInterval(function () {
            const table = new Table({
                head: ['Name', 'Auth Code', 'Expire In'],
            });
            for (const account of _accounts) {
                table.push([account.name_with_issuer, account.totp, core.getTimeout()]);
            }
            log(table);
        }, tr_timeout);
    } else {
        throw new Error('No account found');
    }
}

module.exports = run;
