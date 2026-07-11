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
