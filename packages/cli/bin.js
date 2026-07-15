#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const core = require('./core');

const run = require('./src/run');
const PasswordPrompt = require('./src/PasswordPrompt');
const { question } = require('./src/prompt');
const { copyToClipboard } = require('./src/clipboard');
const ui = require('./src/ui');

const passwordPrompt = new PasswordPrompt({ promptMsg: "Enter password: " });

// Commander 15+ only allows single-character short flags, so -en cannot be
// registered as a real flag. Rewrite argv so -en still works, and restore
// "-en, --encrypt" in help so the CLI docs match what users type.
const cli_argv = process.argv.map((arg) => (arg === '-en' ? '--encrypt' : arg));

program
    .name("auth")
    .description("A simple command-line authenticator with an encrypted local vault.\nImport from Google/Microsoft/Facebook Authenticator, Aegis, 2FAS, or andOTP — or add accounts directly.\n(`auth` and `authenticator` are the same command.)")
    .usage("[options]")
    .showHelpAfterError('(run "auth --help" for usage and examples)')
    .configureHelp({
        optionTerm(option) {
            if (option.long === '--encrypt') return '-en, --encrypt';
            return option.flags;
        },
    })
    .addHelpText('after', `
Examples:
  auth -a                                  add an account interactively
  auth -a "otpauth://totp/GitHub:me?..."   add from a site's QR-code URI
  auth -i "otpauth-migration://..."        bulk import from Google Authenticator
  auth -i aegis-backup.json -m             import & merge an Aegis/2FAS/andOTP backup
  auth -r                                  live codes table (Ctrl+C to exit)
  auth -t GitHub                           print the current code for one account
  auth -c GitHub                           copy the current code to the clipboard
  auth -e backup.json                      write an encrypted backup file
  auth -e sheet.html --paper               printable paper backup (QR codes + text)
  auth --qr GitHub                         show a QR to move an account to a phone app

Modifiers (always combined with another option, never alone):
  -en/--encrypt   with -i or -a when creating a new vault
  -m/--merge      with -i when a vault already exists
  --paper         with -e for the printable sheet
  --json          with -l or --info for machine-readable output
  -f/--force      with -d (skip password check) or -i -m (overwrite conflicts)

Docs: https://github.com/sthnaqvi/authenticator-clui#readme`)
    .version(require('./package.json').version, '-v, --version', 'Print the installed version')
    .option('-i, --import <uri-or-file>', 'Import account(s) from an "otpauth-migration://" export URI, a single "otpauth://" URI, a backup made with --export, or an Aegis/2FAS/andOTP backup file (auto-detected)')
    .option('--encrypt', '(use with -i/-a on a new vault) Encrypt the vault with AES-256 using a password of your choice')
    .option('-m, --merge', '(use with -i) Merge into the existing vault instead of refusing')
    .option('-a, --add [otpauth-uri]', 'Add a single TOTP account: interactive prompts, or pass an "otpauth://totp/..." URI')
    .option('--remove <name>', 'Remove one account by name, issuer(name), or id prefix')
    .option('--rename <names...>', 'Rename an account: --rename <old> <new>')
    .option('-l, --list', 'List accounts (names/issuers/ids — never secrets)')
    .option('--json', '(use with -l/--info) Machine-readable JSON output')
    .option('-t, --totp <name>', 'Print the current TOTP code for one account and exit')
    .option('-c, --copy <name>', 'Copy the current code for one account to the clipboard')
    .option('-e, --export [file]', 'Write an encrypted backup file (default: ~/authenticator-backup.json — never the current directory)')
    .option('--paper', '(use with -e) Render the encrypted backup as a printable HTML sheet with QR codes, e.g. auth -e sheet.html --paper')
    .option('--qr <name>', 'Show an account as a QR code to scan into a phone app')
    .option('--info', 'Show vault location, format version, encryption status and account count')
    .option('-s, --sync [target]', 'Sync with another device on your network. No target: host a session (shows a QR + code). With target: join one (authsync:// URI or host:port)')
    .option('-d, --delete', 'Delete imported accounts !!!Can\'t restore')
    .option('-f, --force', '(use with -d or -i -m) Skip the password check when deleting / overwrite conflicting secrets when merging')
    .option('-r, --run', 'Run authenticator with imported accounts')
    .parse(cli_argv);

const fail = (message) => {
    ui.err(message);
    process.exitCode = 1;
};

const displayName = (account) => account.issuer ? `${account.issuer}(${account.name})` : account.name;

const findForDisplay = async (matcher, password) => {
    const accounts = await core.accounts.get(password);
    const matches = accounts.filter((a) =>
        a.name === matcher || displayName(a) === matcher || (a.id && a.id.startsWith(matcher)));
    if (matches.length === 0) throw new Error(`No account matches "${matcher}"`);
    if (matches.length > 1) {
        const exact = matches.filter((a) => displayName(a) === matcher);
        if (exact.length === 1) return exact[0];
        throw new Error('Multiple accounts match — retry with an id prefix:\n' +
            matches.map((m) => `  ${m.id.slice(0, 8)}  ${displayName(m)}`).join('\n'));
    }
    return matches[0];
};

const buildOtpauthUri = (account) => {
    const params = core.getOtpParams(account);
    const label = account.issuer
        ? `${encodeURIComponent(account.issuer)}:${encodeURIComponent(account.name)}`
        : encodeURIComponent(account.name);
    const query = [`secret=${account.totpSecret}`];
    if (account.issuer) query.push(`issuer=${encodeURIComponent(account.issuer)}`);
    if (params.algorithm !== 'SHA1') query.push(`algorithm=${params.algorithm}`);
    if (params.digits !== 6 && params.type !== 'STEAM') query.push(`digits=${params.digits}`);
    if (params.period !== 30) query.push(`period=${params.period}`);
    if (params.type === 'HOTP') query.push(`counter=${params.counter}`);
    const kind = params.type === 'HOTP' ? 'hotp' : 'totp';
    return `otpauth://${kind}/${label}?${query.join('&')}`;
};

/**
 * Parse --import input: a migration URI, a single otpauth:// or steam://
 * URI, or a backup file — ours, Aegis, 2FAS, or andOTP (auto-detected,
 * password prompted only when the file is actually encrypted).
 */
const parseImportSource = async (source) => {
    if (source.startsWith('otpauth-migration://')) return core.parseAccountsFromUri(source);
    if (source.startsWith('otpauth://') || source.toLowerCase().startsWith('steam://')) {
        return [core.parseOtpauthUri(source)];
    }
    if (fs.existsSync(source)) {
        const raw = fs.readFileSync(source, 'utf-8');
        const detected = core.accounts.detectImport(raw);
        if (!detected) {
            throw new Error('Unrecognized backup file — expected authenticator-clui, Aegis, 2FAS, or andOTP format');
        }
        let filePassword;
        if (detected.encrypted) {
            const label = detected.format === 'authenticator-clui-backup' ? 'Backup' : `${detected.format} backup`;
            filePassword = await new PasswordPrompt({ promptMsg: `${label} password: ` }).start();
        }
        return core.accounts.parseImportFile(raw, filePassword);
    }
    throw new Error('Import source must be an otpauth-migration:// URI, an otpauth:// URI, or a backup file path');
};

const handleImport = async (options) => {
    const vaultExists = await core.accounts.isValidBackupFile();
    if (vaultExists && !options.merge) {
        return fail("Accounts already exist. Use --merge to combine, or --delete first to replace");
    }
    let imported;
    try {
        imported = await parseImportSource(options.import);
    } catch (error) {
        return fail(error.message);
    }

    let password = "";
    if (vaultExists) {
        if (await core.accounts.isEncrypted()) password = await passwordPrompt.start();
        if (!(await core.accounts.isValid(password))) return fail("Invalid password. Please try again.");
        const result = await core.accounts.merge(imported, password, { force: options.force });
        ui.ok(`merged: ${result.added} added, ${result.skipped} already present`);
        for (const conflict of result.conflicts) {
            ui.warn(`${conflict}: same account with a DIFFERENT secret — kept existing (use --force to overwrite)`);
        }
        return;
    }

    if (options.encrypt) password = await passwordPrompt.start();
    await core.accounts.merge(imported, password);
    ui.ok(`${imported.length} account(s) imported successfully`);
};

const handleAdd = async (options) => {
    let input;
    if (typeof options.add === 'string') {
        const parsed = core.parseOtpauthUri(options.add);
        input = {
            name: parsed.name,
            issuer: parsed.issuer,
            secret: parsed.totpSecret,
            type: parsed.type,
            digits: parsed.digits,
            period: parsed.period,
            algorithm: parsed.algorithm,
            counter: parsed.counter,
        };
    } else {
        const name = await question('Account name: ');
        const issuer = await question('Issuer (optional): ');
        const secret = await new PasswordPrompt({ promptMsg: 'Secret (base32): ' }).start();
        input = { name, issuer: issuer || undefined, secret };
    }

    let password = "";
    if (await core.accounts.isValidBackupFile()) {
        if (await core.accounts.isEncrypted()) password = await passwordPrompt.start();
        if (!(await core.accounts.isValid(password))) return fail("Invalid password. Please try again.");
    } else if (options.encrypt) {
        password = await passwordPrompt.start();
    }

    const added = await core.accounts.add(input, password);
    ui.ok(`Added ${displayName(added)}`);
};

/** Is this path inside a git working tree? (walk up looking for .git) */
const isInsideGitRepo = (targetPath) => {
    let dir = path.dirname(path.resolve(targetPath));
    while (true) {
        if (fs.existsSync(path.join(dir, '.git'))) return true;
        const parent = path.dirname(dir);
        if (parent === dir) return false;
        dir = parent;
    }
};

const handleExport = async (options, password) => {
    const os = require('os');
    const defaultFile = path.join(os.homedir(), options.paper ? 'authenticator-backup.html' : 'authenticator-backup.json');
    // Default goes to the HOME directory, never the current one — a vault
    // backup must not land inside whatever repo/project you happen to be
    // standing in. An explicit path is honored, with a warning if risky.
    const file = typeof options.export === 'string' ? options.export : defaultFile;
    if (typeof options.export === 'string' && isInsideGitRepo(file)) {
        ui.warn(`${path.resolve(file)} is inside a git repository — don't commit this file, it duplicates your vault`);
    }
    const exportPassword = await new PasswordPrompt({ promptMsg: 'Backup password: ' }).start();
    const confirm = await new PasswordPrompt({ promptMsg: 'Confirm backup password: ' }).start();
    if (!exportPassword || exportPassword !== confirm) return fail('Passwords empty or did not match — nothing exported');
    const backup = await core.accounts.exportVault(password, exportPassword);

    if (options.paper) {
        const { renderPaperBackupHtml } = require('./src/paper');
        const count = (await core.accounts.list(password)).length;
        fs.writeFileSync(path.resolve(file), renderPaperBackupHtml(backup, count));
        ui.ok(`Printable encrypted backup written to ${path.resolve(file)}`);
        return ui.info('Print it, then delete the file — it duplicates your encrypted vault');
    }

    fs.writeFileSync(path.resolve(file), backup);
    ui.ok(`Encrypted backup written to ${path.resolve(file)}`);
};

const handleSync = async (options) => {
    // A first device may have no vault yet — joining a sync IS its setup path
    let password = "";
    const vaultExists = await core.accounts.isValidBackupFile();
    if (vaultExists) {
        if (await core.accounts.isEncrypted()) password = await passwordPrompt.start();
        if (!(await core.accounts.isValid(password))) return fail("Invalid password. Please try again.");
    } else if (options.encrypt) {
        console.log('New vault will be created from this sync — choose its password.');
        password = await passwordPrompt.start();
    }
    const localAccounts = vaultExists ? await core.accounts.get(password) : [];

    const describe = (s) =>
        `${s.added} to add, ${s.updated} to update, ${s.deleted} to delete, ${s.unchanged} unchanged`;
    const callbacks = {
        onReady: ({ uri, code }) => {
            const { toTerminal } = require('./src/qr');
            console.log(`\nOn the other device, run:  ${ui.bold(`auth --sync "${uri}"`)}`);
            console.log(`or scan this QR with the mobile app:\n`);
            console.log(toTerminal(uri));
            console.log(`\nPairing code (if typing manually): ${ui.bold(code)}`);
            console.log(ui.dim('Waiting for the other device… (Ctrl+C to cancel)\n'));
        },
        confirm: async (summary) => {
            console.log(`\nMerge result for this device: ${ui.bold(describe(summary))}`);
            const answer = await question('Apply these changes? [y/N] ');
            return /^y(es)?$/i.test(answer);
        },
    };

    let outcome;
    if (typeof options.sync === 'string') {
        const target = core.parseSyncTarget(options.sync);
        if (!target.code) {
            target.code = (await question('Pairing code shown on the host: ')).toUpperCase().replace(/\s+/g, '');
            if (!target.code) return fail('A pairing code is required to join a sync session');
        }
        outcome = await core.joinSync(target, localAccounts, callbacks);
    } else {
        outcome = await core.hostSync(localAccounts, callbacks);
    }

    if (!outcome.applied) {
        return fail('Sync declined (one of the devices said no) — nothing was changed on either side');
    }
    await core.accounts.applySyncedAccounts(outcome.accounts, password);
    ui.ok(`Vault synced: ${describe(outcome.summary)}`);
};

const handleInfo = async (options) => {
    let password;
    if (await core.accounts.isValidBackupFile() && await core.accounts.isEncrypted()) {
        password = await passwordPrompt.start();
    }
    const info = await core.accounts.info(password);
    if (!info) return fail('No vault found — import or add an account first');
    if (options.json) return console.log(JSON.stringify(info, null, 2));
    const row = (label, value) => console.log(`${ui.dim(label.padEnd(11))}${value}`);
    row('Vault', info.location ?? 'unknown');
    row('Format', `v${info.version}`);
    row('Encrypted', info.is_encrypted ? ui.green('yes (AES-256-GCM)') : ui.yellow('no'));
    row('Accounts', String(info.count ?? 'unknown (wrong password?)'));
};

const processOpts = async (options) => {
    if (options && Object.keys(options).length) {

        // ---- operations that may create or extend the vault ----
        if (options.import) return handleImport(options);
        if (options.add !== undefined) return handleAdd(options);
        if (options.sync !== undefined) return handleSync(options);
        if (options.info) return handleInfo(options);

        // ---- everything below needs an existing, valid vault ----
        let password = "";
        if (!options.force) {
            if (!(await core.accounts.isValidBackupFile())) {
                return fail('No accounts yet. Add one interactively with `auth -a`, or import: auth -i "otpauth-migration://..."');
            }
            if (await core.accounts.isEncrypted()) {
                password = await passwordPrompt.start();
            }
            if (!(await core.accounts.isValid(password))) {
                if (password) return fail("Invalid password. Please try again.");
                return fail('Vault file exists but is not readable — it may be corrupted. Restore a backup with `auth -i <backup-file>` after `auth -d -f`');
            }
        }

        if (options.delete) return core.accounts.flushAll();

        if (options.list) {
            const entries = await core.accounts.list(password);
            if (options.json) return console.log(JSON.stringify(entries, null, 2));
            if (!entries.length) return console.log('No accounts');
            console.log(ui.renderTable(
                ['ID', 'Account'],
                entries.map((entry) => [ui.dim((entry.id || '').slice(0, 8)), ui.cyan(displayName(entry))])
            ));
            return;
        }

        if (options.totp) {
            const { code } = await core.accounts.generateCodeFor(options.totp, password);
            return console.log(code);
        }

        if (options.copy) {
            const { code, account, expiresIn } = await core.accounts.generateCodeFor(options.copy, password);
            await copyToClipboard(code);
            const expiry = expiresIn === null ? 'HOTP — counter advanced' : `expires in ${expiresIn}s`;
            return ui.ok(`Code for ${displayName(account)} copied to clipboard (${expiry})`);
        }

        if (options.qr) {
            const account = await findForDisplay(options.qr, password);
            const { toTerminal } = require('./src/qr');
            console.log(`Scan to add ${ui.cyan(displayName(account))}:`);
            return console.log(toTerminal(buildOtpauthUri(account)));
        }

        if (options.remove) {
            const removed = await core.accounts.remove(options.remove, password);
            return ui.ok(`Removed ${displayName(removed)}`);
        }

        if (options.rename) {
            if (options.rename.length !== 2) return fail('Usage: --rename <old-name> <new-name>');
            const renamed = await core.accounts.rename(options.rename[0], options.rename[1], password);
            return ui.ok(`Renamed to ${displayName(renamed)}`);
        }

        if (options.export !== undefined) return handleExport(options, password);

        if (options.run) {
            if (options.force) {
                return fail("--run can't be combined with --force (the password check protects the live view)");
            }
            return run(password);
        }

        // Only modifier flags were given — tell the user exactly how each
        // one is meant to be used instead of dumping the full help.
        const MODIFIER_HINTS = [
            ['paper', '--paper is used together with --export:\n    auth -e sheet.html --paper'],
            ['merge', '--merge is used together with --import:\n    auth -i <file-or-uri> -m'],
            ['json', '--json is used together with --list or --info:\n    auth -l --json'],
            ['encrypt', '-en/--encrypt is used when creating a vault:\n    auth -en -i "otpauth-migration://..."   or   auth -en -a'],
            ['force', '--force is used together with --delete or --import --merge:\n    auth -d -f'],
        ];
        for (const [key, hint] of MODIFIER_HINTS) {
            if (options[key] !== undefined) {
                return fail(`${hint}\n  Run \`auth --help\` for all options and examples.`);
            }
        }
        return fail('Nothing to do — run `auth --help` for usage and examples.');
    } else {
        program.help();
    };
}

processOpts(program.opts()).catch((error) => fail(error.message));
