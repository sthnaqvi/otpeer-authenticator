'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const core_dir = path.join(__dirname, '..', '..', 'core');
const src = path.join(core_dir, 'dist');
const dest = path.join(__dirname, '..', 'vendor', 'core');

function ensureCoreBuilt() {
    if (fs.existsSync(src)) {
        return;
    }

    console.log('Building @authenticator/core…');
    execSync('npm run build', { cwd: core_dir, stdio: 'inherit' });

    if (!fs.existsSync(src)) {
        throw new Error(`Missing ${src} after building @authenticator/core`);
    }
}

ensureCoreBuilt();
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
