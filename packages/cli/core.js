'use strict';

const path = require('path');

/**
 * packages/core is private workspace code, never published to npm. It's
 * vendored into vendor/core (see the "vendor-core" script in package.json,
 * run automatically by prepublishOnly) so a published `authenticator-clui`
 * install has no external dependency on it.
 */
const core = require('./vendor/core');

/**
 * The vault lives at ~/.authenticator-clui/accounts.json. Versions <=1.1.1
 * stored it at <install prefix>/node_modules/authenticator-clui/local_data/
 * accounts.txt, which npm wipes on every upgrade — the legacy paths below
 * rescue a surviving old vault by migrating it on first use.
 *
 * __dirname covers a same-prefix upgrade; the absolute entries cover a 1.1.x
 * install under a default prefix when the new version lands under a
 * different one (nvm, Homebrew, changed npm prefix). Non-existent paths are
 * skipped harmlessly.
 */
const LEGACY_VAULT = ['local_data', 'accounts.txt'];
const legacyFilePaths = [
    path.join(__dirname, ...LEGACY_VAULT),
    path.join('/usr/local/lib/node_modules/authenticator-clui', ...LEGACY_VAULT),
    path.join('/opt/homebrew/lib/node_modules/authenticator-clui', ...LEGACY_VAULT),
    path.join(__dirname, '..', '..', ...LEGACY_VAULT), // pre-monorepo dev checkout
];
if (process.env.APPDATA) {
    // Windows global-install default
    legacyFilePaths.push(path.join(process.env.APPDATA, 'npm', 'node_modules', 'authenticator-clui', ...LEGACY_VAULT));
}

const store = new core.AccountsStore(
    new core.NodeStorageAdapter({ legacyFilePaths })
);

module.exports = Object.assign({}, core, { accounts: store });
