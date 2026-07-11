import crypto from 'crypto';
import { NodeCryptoProvider } from './node-crypto-provider';

const provider = new NodeCryptoProvider();

/**
 * Produces the pre-v2 CBC format (base64(iv|ciphertext|salt)) exactly as
 * versions <=1.2.x wrote it, so decryptLegacy is tested against the real
 * legacy layout rather than against itself.
 */
function encryptLegacyCbc(text: string, password: string): string {
    const iv = crypto.randomBytes(16);
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(password, salt, 32);
    const cipher = crypto.createCipheriv('aes256', key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf-8'), cipher.final()]);
    return Buffer.concat([iv, encrypted, salt]).toString('base64');
}

describe('NodeCryptoProvider (AES-256-GCM)', () => {
    test('round-trips plaintext', () => {
        const ciphertext = provider.encrypt('hello vault', 'pw123');
        expect(provider.decrypt(ciphertext, 'pw123')).toBe('hello vault');
    });

    test('unique ciphertext per call (random salt/iv)', () => {
        expect(provider.encrypt('same', 'pw')).not.toBe(provider.encrypt('same', 'pw'));
    });

    test('wrong password throws', () => {
        const ciphertext = provider.encrypt('secret', 'right');
        expect(() => provider.decrypt(ciphertext, 'wrong')).toThrow();
    });

    test('tampered ciphertext throws (auth tag check)', () => {
        const ciphertext = provider.encrypt('secret', 'pw');
        const buf = Buffer.from(ciphertext, 'base64');
        buf[buf.length - 1] ^= 0xff; // flip bits in the ciphertext body
        expect(() => provider.decrypt(buf.toString('base64'), 'pw')).toThrow();
    });

    test('decryptLegacy reads the v1 CBC format', () => {
        const legacy = encryptLegacyCbc('legacy data', 'oldpw');
        expect(provider.decryptLegacy(legacy, 'oldpw')).toBe('legacy data');
    });

    test('randomId returns unique RFC-4122 v4 uuids', () => {
        const a = provider.randomId();
        const b = provider.randomId();
        expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(a).not.toBe(b);
    });
});
