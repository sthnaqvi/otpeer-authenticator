'use strict';

const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'src', 'importers', 'google_auth.proto');
const dest_dir = path.join(__dirname, '..', 'dist', 'importers');
const dest = path.join(dest_dir, 'google_auth.proto');

fs.mkdirSync(dest_dir, { recursive: true });
fs.copyFileSync(src, dest);
