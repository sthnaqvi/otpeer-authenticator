import crypto from 'crypto';
import { AccountsStore, VAULT_VERSION } from './accounts';
import { NodeCryptoProvider } from './node/node-crypto-provider';
import { StorageAdapter } from './adapters/storage';

const SAMPLE_URI =
    'otpauth-migration://offline?data=CicKFFFFNi94eGM5bGxUUWlQcWxJSjU0EgR0ZXN0GgNvdHAgASgBMAIQARgBIAA%3D';

class MemoryStorage implements StorageAdapter {
    data: string | null = null;
    async read() { return this.data; }
    async write(data: string) { this.data = data; }
    async delete() { this.data = null; }
    async exists() { return this.data !== null; }
}

/** v1 CBC encryption exactly as versions <=1.2.x wrote it */
function encryptLegacyCbc(text: string, password: string): string {
    const iv = crypto.randomBytes(16);
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(password, salt, 32);
    const cipher = crypto.createCipheriv('aes256', key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf-8'), cipher.final()]);
    return Buffer.concat([iv, encrypted, salt]).toString('base64');
}

const V1_ACCOUNTS = [
    { secret: 'UUU2L3h4YzlsbFRRaVBxbElKNTQ=', name: 'test', issuer: 'otp', totpSecret: 'KFCTML3YPBRTS3DMKRIWSUDRNREUUNJU' },
];

function makeStore() {
    const storage = new MemoryStorage();
    const store = new AccountsStore(storage, new NodeCryptoProvider());
    return { storage, store };
}

describe('AccountsStore', () => {
    test('fresh seed writes current vault version with account identity', async () => {
        const { storage, store } = makeStore();
        await store.seed(SAMPLE_URI, '');
        const vault = JSON.parse(storage.data!);
        expect(vault.version).toBe(VAULT_VERSION);
        expect(vault.is_encrypted).toBe(false);
        const accounts = JSON.parse(vault.accounts);
        expect(accounts).toHaveLength(1);
        expect(accounts[0].id).toMatch(/^[0-9a-f-]{36}$/);
        expect(accounts[0].updatedAt).toBeTruthy();
        expect(accounts[0].deletedAt).toBeUndefined();
    });

    test('encrypted seed round-trips through get', async () => {
        const { store } = makeStore();
        await store.seed(SAMPLE_URI, 'pw123');
        expect(await store.isEncrypted()).toBe(true);
        const accounts = await store.get('pw123');
        expect(accounts[0].name).toBe('test');
    });

    test('v1 unencrypted vault: get() migrates to v2 and backfills ids, preserving content', async () => {
        const { storage, store } = makeStore();
        storage.data = JSON.stringify({ is_encrypted: false, accounts: JSON.stringify(V1_ACCOUNTS) });

        const accounts = await store.get('');
        expect(accounts[0].name).toBe('test');
        expect(accounts[0].totpSecret).toBe('KFCTML3YPBRTS3DMKRIWSUDRNREUUNJU');
        expect(accounts[0].id).toBeTruthy();
        expect(accounts[0].updatedAt).toBeTruthy();

        const rewritten = JSON.parse(storage.data!);
        expect(rewritten.version).toBe(VAULT_VERSION);
        expect(JSON.parse(rewritten.accounts)[0].id).toBe(accounts[0].id);
    });

    test('v1 CBC-encrypted vault: get() decrypts legacy, re-encrypts as GCM v2', async () => {
        const { storage, store } = makeStore();
        storage.data = JSON.stringify({
            is_encrypted: true,
            accounts: encryptLegacyCbc(JSON.stringify(V1_ACCOUNTS), 'oldpw'),
        });

        const accounts = await store.get('oldpw');
        expect(accounts[0].name).toBe('test');
        expect(accounts[0].id).toBeTruthy();

        const rewritten = JSON.parse(storage.data!);
        expect(rewritten.version).toBe(VAULT_VERSION);
        expect(rewritten.is_encrypted).toBe(true);
        // must now decrypt via the GCM (v2) path
        const gcm = new NodeCryptoProvider();
        const decrypted = JSON.parse(gcm.decrypt(rewritten.accounts, 'oldpw'));
        expect(decrypted[0].name).toBe('test');
    });

    test('migrated vault is stable: second get() does not rewrite', async () => {
        const { storage, store } = makeStore();
        storage.data = JSON.stringify({ is_encrypted: false, accounts: JSON.stringify(V1_ACCOUNTS) });
        await store.get('');
        const afterFirst = storage.data;
        await store.get('');
        expect(storage.data).toBe(afterFirst);
    });

    test('wrong password on v2 vault: isValid false, get throws clear error', async () => {
        const { store } = makeStore();
        await store.seed(SAMPLE_URI, 'right');
        expect(await store.isValid('wrong')).toBe(false);
        await expect(store.get('wrong')).rejects.toThrow(/wrong password|corrupted/i);
    });

    test('tampered v2 vault: isValid false, get throws instead of returning garbage', async () => {
        const { storage, store } = makeStore();
        await store.seed(SAMPLE_URI, 'pw');
        const vault = JSON.parse(storage.data!);
        const buf = Buffer.from(vault.accounts, 'base64');
        buf[buf.length - 1] ^= 0xff;
        vault.accounts = buf.toString('base64');
        storage.data = JSON.stringify(vault);

        expect(await store.isValid('pw')).toBe(false);
        await expect(store.get('pw')).rejects.toThrow(/corrupted|tampered|wrong password/i);
    });

    test('isValid is side-effect free on a v1 vault', async () => {
        const { storage, store } = makeStore();
        const v1 = JSON.stringify({ is_encrypted: false, accounts: JSON.stringify(V1_ACCOUNTS) });
        storage.data = v1;
        expect(await store.isValid('')).toBe(1);
        expect(storage.data).toBe(v1); // untouched — only get() migrates
    });

    test('flushAll removes the vault', async () => {
        const { storage, store } = makeStore();
        await store.seed(SAMPLE_URI, '');
        await store.flushAll();
        expect(storage.data).toBeNull();
        expect(await store.isValidBackupFile()).toBe(false);
    });
});

describe('AccountsStore mutations', () => {
    const SECRET = 'KFCTML3YPBRTS3DMKRIWSUDRNREUUNJU';

    test('add creates an account with id/updatedAt and validates the secret', async () => {
        const { store } = makeStore();
        const added = await store.add({ name: 'GitHub', issuer: 'GitHub', secret: SECRET }, '');
        expect(added.id).toBeTruthy();
        expect(added.updatedAt).toBeTruthy();
        expect((await store.get(''))[0].name).toBe('GitHub');
        await expect(store.add({ name: 'bad', secret: 'not!base32' }, '')).rejects.toThrow(/base32/i);
        await expect(store.add({ name: '  ', secret: SECRET }, '')).rejects.toThrow(/name/i);
    });

    test('add works into an encrypted vault', async () => {
        const { store } = makeStore();
        await store.seed(SAMPLE_URI, 'pw');
        await store.add({ name: 'second', secret: SECRET }, 'pw');
        expect(await store.get('pw')).toHaveLength(2);
    });

    test('remove deletes exactly the matched account', async () => {
        const { store } = makeStore();
        await store.add({ name: 'keep', secret: SECRET }, '');
        await store.add({ name: 'drop', secret: SECRET }, '');
        const removed = await store.remove('drop', '');
        expect(removed.name).toBe('drop');
        const left = await store.get('');
        expect(left).toHaveLength(1);
        expect(left[0].name).toBe('keep');
        await expect(store.remove('ghost', '')).rejects.toThrow(/no account/i);
    });

    test('ambiguous matcher throws with candidates; issuer(name) and id prefix disambiguate', async () => {
        const { store } = makeStore();
        await store.add({ name: 'me', issuer: 'GitHub', secret: SECRET }, '');
        await store.add({ name: 'me', issuer: 'GitLab', secret: SECRET }, '');

        await expect(store.remove('me', '')).rejects.toThrow(/multiple accounts/i);

        const removed = await store.remove('GitLab(me)', '');
        expect(removed.issuer).toBe('GitLab');

        const [remaining] = await store.get('');
        const byIdPrefix = await store.remove((remaining.id as string).slice(0, 8), '');
        expect(byIdPrefix.issuer).toBe('GitHub');
    });

    test('rename changes the name and bumps updatedAt', async () => {
        const { store } = makeStore();
        const added = await store.add({ name: 'old', secret: SECRET }, '');
        await new Promise((r) => setTimeout(r, 5));
        const renamed = await store.rename('old', 'new', '');
        expect(renamed.name).toBe('new');
        expect(Date.parse(renamed.updatedAt as string)).toBeGreaterThan(Date.parse(added.updatedAt as string));
    });

    test('list never includes secret material', async () => {
        const { store } = makeStore();
        await store.add({ name: 'a', secret: SECRET }, '');
        const [entry] = await store.list('');
        expect(entry.name).toBe('a');
        expect(entry).not.toHaveProperty('secret');
        expect(entry).not.toHaveProperty('totpSecret');
        expect(entry.id).toBeTruthy();
    });

    test('merge: adds new, skips identical, reports conflicts, force overwrites keeping id', async () => {
        const { store } = makeStore();
        await store.add({ name: 'same', issuer: 'X', secret: SECRET }, '');
        const [original] = await store.get('');

        const OTHER = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
        const imported = [
            { name: 'same', issuer: 'X', secret: '', totpSecret: SECRET },      // identical → skip
            { name: 'same', issuer: 'X', secret: '', totpSecret: OTHER },       // conflict
            { name: 'brand-new', issuer: 'Y', secret: '', totpSecret: OTHER },  // add
        ];

        const result = await store.merge(imported as never, '');
        expect(result).toEqual({ added: 1, skipped: 1, conflicts: ['X(same)'] });
        expect(await store.get('')).toHaveLength(2);

        const forced = await store.merge([imported[1]] as never, '', { force: true });
        expect(forced.added).toBe(1);
        const updated = (await store.get('')).find((a) => a.name === 'same')!;
        expect(updated.totpSecret).toBe(OTHER);
        expect(updated.id).toBe(original.id); // identity survives overwrite
    });

    test('export/decodeBackup round-trip with an independent password', async () => {
        const { store } = makeStore();
        await store.seed(SAMPLE_URI, 'vaultpw');
        const backup = await store.exportVault('vaultpw', 'exportpw');

        const parsed = JSON.parse(backup);
        expect(parsed.version).toBe(VAULT_VERSION);
        expect(parsed.is_encrypted).toBe(true);

        const restored = store.decodeBackup(backup, 'exportpw');
        expect(restored[0].name).toBe('test');
        expect(() => store.decodeBackup(backup, 'wrongpw')).toThrow();
        expect(() => store.decodeBackup('not json', 'x')).toThrow(/json/i);
        await expect(store.exportVault('vaultpw', '')).rejects.toThrow(/export password/i);
    });

    test('generateCodeFor: TOTP returns code + expiry without writing', async () => {
        const { storage, store } = makeStore();
        await store.add({ name: 'plain', secret: SECRET }, '');
        const before = storage.data;
        const { code, expiresIn } = await store.generateCodeFor('plain', '');
        expect(code).toMatch(/^\d{6}$/);
        expect(expiresIn).toBeGreaterThan(0);
        expect(storage.data).toBe(before); // no vault write for TOTP
    });

    test('generateCodeFor: HOTP increments and persists the counter', async () => {
        const { store } = makeStore();
        await store.merge(
            [{ name: 'bank', issuer: 'Bank', secret: '', totpSecret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', type: 'OTP_HOTP', counter: 0 }] as never,
            ''
        );
        // RFC 4226 vectors for this secret: counter 0 → 755224, 1 → 287082
        const first = await store.generateCodeFor('bank', '');
        expect(first.code).toBe('755224');
        expect(first.expiresIn).toBeNull();
        const second = await store.generateCodeFor('bank', '');
        expect(second.code).toBe('287082');
        const [account] = await store.get('');
        expect(account.counter).toBe(2); // persisted
    });

    test('parseImportFile routes competitor formats through detection', async () => {
        const { store } = makeStore();
        const andOtp = JSON.stringify([{ secret: SECRET, label: 'imported', issuer: 'X', type: 'TOTP', digits: 6 }]);
        const accounts = store.parseImportFile(andOtp);
        expect(accounts[0]).toMatchObject({ name: 'imported', totpSecret: SECRET });
        expect(() => store.parseImportFile('{"nope":1}')).toThrow(/unrecognized/i);
    });

    test('info reports metadata, count only when decryptable', async () => {
        const { store } = makeStore();
        expect(await store.info()).toBeNull();

        await store.seed(SAMPLE_URI, 'pw');
        const locked = await store.info();
        expect(locked).toMatchObject({ version: VAULT_VERSION, is_encrypted: true });
        expect(locked!.count).toBeUndefined();

        expect((await store.info('pw'))!.count).toBe(1);
        expect((await store.info('wrong'))!.count).toBeUndefined();
    });
});
