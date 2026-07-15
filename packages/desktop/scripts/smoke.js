'use strict';

/**
 * Headless smoke test for the desktop app's engine: drives the compiled
 * VaultService (the exact code main.ts wires to IPC) against temp vaults —
 * no display needed. Covers: unlock/empty state, add (TOTP + HOTP via URI),
 * codes, rename, tombstone remove, export/import round-trip, and a real
 * localhost sync between two service instances.
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const assert = require('assert');
const { VaultService } = require('../dist-electron/vault-service');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'otpeer-desktop-smoke-'));
const vaultA = path.join(tmp, 'a', 'accounts.json');
const vaultB = path.join(tmp, 'b', 'accounts.json');

async function main() {
    const a = new VaultService(vaultA);

    // unlock empty state
    assert.strictEqual((await a.status()).exists, false);
    assert.strictEqual(await a.unlock(''), true);
    assert.deepStrictEqual(await a.listWithCodes(), []);

    // add TOTP manually + HOTP and 8-digit accounts via URIs
    await a.addAccount({ name: 'github', issuer: 'GitHub', secret: 'KFCTML3YPBRTS3DMKRIWSUDRNREUUNJU' });
    await a.addFromUri('otpauth://hotp/Bank:acct?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&counter=0');
    await a.addFromUri('otpauth://totp/AWS:me?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&digits=8&period=60&algorithm=SHA256');

    let list = await a.listWithCodes();
    assert.strictEqual(list.length, 3);
    const totp = list.find((x) => x.name === 'github');
    const hotp = list.find((x) => x.name === 'acct');
    const eight = list.find((x) => x.name === 'me');
    assert.match(totp.code, /^\d{6}$/);
    assert.strictEqual(hotp.code, null); // HOTP never auto-generates
    assert.match(eight.code, /^\d{8}$/); // B2 params honored
    assert.strictEqual(eight.period, 60);

    // HOTP on-demand generation hits RFC 4226 vector and bumps counter
    assert.strictEqual((await a.generateCode(hotp.id)).code, '755224');
    assert.strictEqual((await a.generateCode(hotp.id)).code, '287082');

    // rename + tombstone remove
    await a.renameAccount(totp.id, 'work-github');
    await a.removeAccount(eight.id);
    list = await a.listWithCodes();
    assert.strictEqual(list.length, 2);
    assert.ok(list.some((x) => x.name === 'work-github'));

    // export/import round-trip through a fresh vault
    const backup = await a.exportVault('backup-pw');
    const b = new VaultService(vaultB);
    await b.unlock('');
    const summary = await b.importData(backup, 'backup-pw');
    assert.strictEqual(summary.added, 2);

    // real localhost sync: B adds one, then syncs with A — both converge
    await b.addAccount({ name: 'only-on-b', secret: 'MZXW6YTBOI' });
    let hostReady;
    const hostPromise = a.hostSync({
        onReady: (info) => {
            assert.ok(info.uri.startsWith('authsync://'));
            assert.ok(info.qrSvg.includes('<svg'));
            hostReady = info;
        },
        confirm: async () => true,
    });
    while (!hostReady) await new Promise((r) => setTimeout(r, 20));
    const joinOutcome = await b.joinSync(hostReady.uri, undefined, { confirm: async () => true });
    const hostOutcome = await hostPromise;
    assert.strictEqual(joinOutcome.applied, true);
    assert.strictEqual(hostOutcome.applied, true);

    const namesA = (await a.listWithCodes()).map((x) => x.name).sort();
    const namesB = (await b.listWithCodes()).map((x) => x.name).sort();
    assert.deepStrictEqual(namesA, namesB);
    assert.ok(namesA.includes('only-on-b'));

    // locked vault refuses everything
    a.lock();
    await assert.rejects(() => a.listWithCodes(), /locked/i);

    // plaintext unlock must not accept a non-empty decoy password
    await assert.strictEqual(await a.unlock('wrong'), false);
    await assert.strictEqual(await a.unlock(''), true);

    // encrypt → lock → only the real password unlocks
    await a.setPassword('vault-secret');
    assert.strictEqual((await a.status()).encrypted, true);
    a.lock();
    assert.strictEqual(await a.unlock('nope'), false);
    await assert.rejects(() => a.listWithCodes(), /locked/i);
    assert.strictEqual(await a.unlock('vault-secret'), true);
    assert.ok((await a.listWithCodes()).length >= 2);

    // clear password → vault is plaintext again
    await a.setPassword('');
    assert.strictEqual((await a.status()).encrypted, false);
    a.lock();
    assert.strictEqual(await a.unlock('vault-secret'), false);
    assert.strictEqual(await a.unlock(''), true);

    console.log('✔ desktop smoke: unlock, add (TOTP/HOTP/8-digit), codes, rename,');
    console.log('  tombstone remove, export/import round-trip, localhost sync converged,');
    console.log('  lock + encrypt/clear password gate — all passed');
}

main()
    .then(() => { fs.rmSync(tmp, { recursive: true, force: true }); process.exit(0); })
    .catch((error) => { console.error('✖ smoke failed:', error); process.exit(1); });
