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

program
    .name("authenticator")
    .usage("A simple command-line authenticator (import accounts from Google Authenticator, Microsoft Authenticator and Facebook Authenticator)")
    .version(require('./package.json').version, '-v, --version', 'Print the installed version')
    .option('-i, --import <uri-or-file>', 'Import account(s) from an "otpauth-migration://" export URI, a single "otpauth://" URI, or an encrypted backup file created with --export')
    .option('-en, --encrypt', 'Encrypt the vault with AES256 using a password (with --import or --add into a new vault)')
    .option('-m, --merge', 'With --import: merge into the existing vault instead of refusing')
    .option('-a, --add [otpauth-uri]', 'Add a single TOTP account: interactive prompts, or pass an "otpauth://totp/..." URI')
    .option('--remove <name>', 'Remove one account by name, issuer(name), or id prefix')
    .option('--rename <names...>', 'Rename an account: --rename <old> <new>')
    .option('-l, --list', 'List accounts (names/issuers/ids — never secrets)')
    .option('--json', 'With --list or --info: machine-readable JSON output')
    .option('-t, --totp <name>', 'Print the current TOTP code for one account and exit')
    .option('-c, --copy <name>', 'Copy the current code for one account to the clipboard')
    .option('-e, --export [file]', 'Write an encrypted backup file (default: ./authenticator-backup.json)')
    .option('--qr <name>', 'Show an account as a QR code to scan into a phone app')
    .option('--info', 'Show vault location, format version, encryption status and account count')
    .option('-d, --delete', 'Delete imported accounts !!!Can\'t restore')
    .option('-f, --force', 'Forcefully execute operations (skip checks / overwrite merge conflicts)')
    .option('-r, --run', 'Run authenticator with imported accounts')
    .parse(process.argv);

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
    const label = account.issuer
        ? `${encodeURIComponent(account.issuer)}:${encodeURIComponent(account.name)}`
        : encodeURIComponent(account.name);
    const issuerParam = account.issuer ? `&issuer=${encodeURIComponent(account.issuer)}` : '';
    return `otpauth://totp/${label}?secret=${account.totpSecret}${issuerParam}`;
};

/** Parse --import input: backup file path, migration URI, or single otpauth URI. */
const parseImportSource = async (source) => {
    if (source.startsWith('otpauth-migration://')) return core.parseAccountsFromUri(source);
    if (source.startsWith('otpauth://')) return [core.parseOtpauthUri(source)];
    if (fs.existsSync(source)) {
        const raw = fs.readFileSync(source, 'utf-8');
        const exportPassword = await new PasswordPrompt({ promptMsg: 'Backup password: ' }).start();
        return core.accounts.decodeBackup(raw, exportPassword);
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
        input = { name: parsed.name, issuer: parsed.issuer, secret: parsed.totpSecret };
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

const handleExport = async (options, password) => {
    const file = typeof options.export === 'string' ? options.export : 'authenticator-backup.json';
    const exportPassword = await new PasswordPrompt({ promptMsg: 'Backup password: ' }).start();
    const confirm = await new PasswordPrompt({ promptMsg: 'Confirm backup password: ' }).start();
    if (!exportPassword || exportPassword !== confirm) return fail('Passwords empty or did not match — nothing exported');
    const backup = await core.accounts.exportVault(password, exportPassword);
    fs.writeFileSync(path.resolve(file), backup);
    ui.ok(`Encrypted backup written to ${path.resolve(file)}`);
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
        if (options.info) return handleInfo(options);

        // ---- everything below needs an existing, valid vault ----
        let password = "";
        if (!options.force) {
            if (!(await core.accounts.isValidBackupFile())) {
                ui.err("Accounts does not exist");
                return program.help({ error: true });
            }
            if (await core.accounts.isEncrypted()) {
                password = await passwordPrompt.start();
            }
            if (!(await core.accounts.isValid(password))) {
                if (password) return fail("Invalid password. Please try again.");
                ui.err("Account(s) are not valid.");
                return program.help({ error: true });
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
            const account = await findForDisplay(options.totp, password);
            return console.log(core.generateTotp(account.totpSecret));
        }

        if (options.copy) {
            const account = await findForDisplay(options.copy, password);
            const code = core.generateTotp(account.totpSecret);
            await copyToClipboard(code);
            return ui.ok(`Code for ${displayName(account)} copied to clipboard (expires in ${core.getTimeout()}s)`);
        }

        if (options.qr) {
            const account = await findForDisplay(options.qr, password);
            const qrcode = require('qrcode-terminal');
            console.log(`Scan to add ${ui.cyan(displayName(account))}:`);
            return qrcode.generate(buildOtpauthUri(account), { small: true });
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
                ui.err("Can't run with --force");
                return program.help({ error: true });
            }
            return run(password);
        }

        // a lone --force/--encrypt/--json/--merge does nothing by itself
        return program.help({ error: true });
    } else {
        program.help({ error: true });
    };
}

processOpts(program.opts()).catch((error) => fail(error.message));
