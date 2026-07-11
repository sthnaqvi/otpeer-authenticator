'use strict';

/**
 * Programmatic entry point: exposes the same account store and TOTP helpers
 * the CLI itself uses, so the package is usable as a library too
 * (`require('authenticator-clui')`).
 */
module.exports = require('./core');
