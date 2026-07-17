'use strict';

const lines = [
    'OTPeer monorepo — run a surface from the repo root:',
    '',
    '  npm install          Install all workspaces (repo root only)',
    '  npm run desktop      Build and launch the Electron desktop app',
    '  npm run cli -- …     Run the CLI (e.g. npm run cli -- --help)',
    '  npm run website      Start the otpeer.com landing page dev server',
    '  npm run mobile       Mobile app (not implemented yet)',
    '  npm run build        Build shared core and vendor into CLI + desktop',
    '  npm test             Run core test suite',
    '',
    'Root npm start does not launch an app — pick a command above.',
];

console.log(lines.join('\n'));
