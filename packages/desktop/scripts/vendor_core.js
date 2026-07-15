'use strict';

const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', '..', 'core', 'dist');
const dest = path.join(__dirname, '..', 'vendor', 'core');

if (!fs.existsSync(src)) {
    throw new Error(`Missing ${src} — build @authenticator/core first`);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
