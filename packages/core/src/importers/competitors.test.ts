import crypto from 'crypto';
import { detectImportFormat, parseAegis, parse2fas, parseAndOtp } from './competitors';
import { NodeCryptoProvider } from '../node/node-crypto-provider';

const provider = new NodeCryptoProvider();
const SECRET = 'KFCTML3YPBRTS3DMKRIWSUDRNREUUNJU';

// ------------------------------------------------------------- fixtures

const aegisEntries = [
    { type: 'totp', name: 'me@github', issuer: 'GitHub', info: { secret: SECRET, algo: 'SHA1', digits: 6, period: 30 } },
    { type: 'totp', name: 'me@aws', issuer: 'AWS', info: { secret: SECRET, algo: 'SHA256', digits: 8, period: 60 } },
    { type: 'hotp', name: 'legacy', issuer: 'Bank', info: { secret: SECRET, algo: 'SHA1', digits: 6, counter: 7 } },
    { type: 'steam', name: 'steamuser', issuer: 'Steam', info: { secret: SECRET, algo: 'SHA1', digits: 5 } },
];
const aegisPlain = JSON.stringify({
    version: 1,
    header: { slots: null, params: null },
    db: { version: 3, entries: aegisEntries },
});

/** Build a real encrypted Aegis fixture with the documented layout. */
function buildAegisEncrypted(password: string): string {
    const masterKey = crypto.randomBytes(32);
    const salt = crypto.randomBytes(32);
    const scryptParams = { N: 16384, r: 8, p: 1 };
    const slotKey = crypto.scryptSync(password, salt, 32, { ...scryptParams, maxmem: 64 * 1024 * 1024 });

    const slotNonce = crypto.randomBytes(12);
    const slotCipher = crypto.createCipheriv('aes-256-gcm', slotKey, slotNonce);
    const encryptedMaster = Buffer.concat([slotCipher.update(masterKey), slotCipher.final()]);
    const slotTag = slotCipher.getAuthTag();

    const dbNonce = crypto.randomBytes(12);
    const dbCipher = crypto.createCipheriv('aes-256-gcm', masterKey, dbNonce);
    const dbPlain = Buffer.from(JSON.stringify({ version: 3, entries: aegisEntries }), 'utf-8');
    const dbCiphertext = Buffer.concat([dbCipher.update(dbPlain), dbCipher.final()]);
    const dbTag = dbCipher.getAuthTag();

    return JSON.stringify({
        version: 1,
        header: {
            slots: [{
                type: 1,
                uuid: 'test-slot',
                key: encryptedMaster.toString('hex'),
                key_params: { nonce: slotNonce.toString('hex'), tag: slotTag.toString('hex') },
                n: scryptParams.N, r: scryptParams.r, p: scryptParams.p,
                salt: salt.toString('hex'),
            }],
            params: { nonce: dbNonce.toString('hex'), tag: dbTag.toString('hex') },
        },
        db: dbCiphertext.toString('base64'),
    });
}

const twoFasServices = [
    { name: 'GitHub', secret: SECRET, otp: { account: 'me', issuer: 'GitHub', digits: 6, period: 30, algorithm: 'SHA1', tokenType: 'TOTP' } },
    { name: 'Bank', secret: SECRET, otp: { account: 'acct', issuer: 'Bank', digits: 6, algorithm: 'SHA1', tokenType: 'HOTP', counter: 3 } },
];
const twoFasPlain = JSON.stringify({ services: twoFasServices, schemaVersion: 4 });

/** Build an encrypted 2FAS fixture: base64(ct+tag):base64(salt):base64(iv). */
function build2fasEncrypted(password: string): string {
    const salt = crypto.randomBytes(256);
    const iv = crypto.randomBytes(12);
    const key = crypto.pbkdf2Sync(password, salt, 10000, 32, 'sha256');
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(JSON.stringify(twoFasServices), 'utf-8'), cipher.final()]);
    const withTag = Buffer.concat([ct, cipher.getAuthTag()]);
    return JSON.stringify({
        servicesEncrypted: `${withTag.toString('base64')}:${salt.toString('base64')}:${iv.toString('base64')}`,
        schemaVersion: 4,
    });
}

const andOtpPlain = JSON.stringify([
    { secret: SECRET, label: 'me@github', issuer: 'GitHub', digits: 6, period: 30, type: 'TOTP', algorithm: 'SHA1' },
    { secret: SECRET, label: 'counter-acct', issuer: 'Bank', digits: 6, type: 'HOTP', algorithm: 'SHA1', counter: 9 },
]);

// ------------------------------------------------------------- tests

describe('detectImportFormat', () => {
    test('identifies each format and its encryption state', () => {
        expect(detectImportFormat(aegisPlain)).toEqual({ format: 'aegis', encrypted: false });
        expect(detectImportFormat(buildAegisEncrypted('pw'))).toEqual({ format: 'aegis', encrypted: true });
        expect(detectImportFormat(twoFasPlain)).toEqual({ format: '2fas', encrypted: false });
        expect(detectImportFormat(build2fasEncrypted('pw'))).toEqual({ format: '2fas', encrypted: true });
        expect(detectImportFormat(andOtpPlain)).toEqual({ format: 'andotp', encrypted: false });
        expect(detectImportFormat(JSON.stringify({ is_encrypted: true, accounts: 'x' })))
            .toEqual({ format: 'authenticator-clui-backup', encrypted: true });
    });

    test('rejects non-backups', () => {
        expect(detectImportFormat('not json')).toBeNull();
        expect(detectImportFormat('{"random":"object"}')).toBeNull();
        expect(detectImportFormat('[1,2,3]')).toBeNull();
    });
});

describe('parseAegis', () => {
    test('plain export maps all types with their params', () => {
        const accounts = parseAegis(aegisPlain, provider);
        expect(accounts).toHaveLength(4);
        expect(accounts[0]).toMatchObject({ name: 'me@github', issuer: 'GitHub', totpSecret: SECRET, type: 'OTP_TOTP' });
        expect(accounts[1]).toMatchObject({ algorithm: 'SHA256', digits: 8, period: 60 });
        expect(accounts[2]).toMatchObject({ type: 'OTP_HOTP', counter: 7 });
        expect(accounts[3]).toMatchObject({ type: 'STEAM' });
    });

    test('encrypted export round-trips with the right password', () => {
        const encrypted = buildAegisEncrypted('aegis-pw');
        const accounts = parseAegis(encrypted, provider, 'aegis-pw');
        expect(accounts).toHaveLength(4);
        expect(accounts[0].totpSecret).toBe(SECRET);
    });

    test('encrypted export fails clearly on wrong/missing password', () => {
        const encrypted = buildAegisEncrypted('aegis-pw');
        expect(() => parseAegis(encrypted, provider, 'wrong')).toThrow(/wrong password/i);
        expect(() => parseAegis(encrypted, provider)).toThrow(/password is required/i);
    });
});

describe('parse2fas', () => {
    test('plain backup maps TOTP and HOTP services', () => {
        const accounts = parse2fas(twoFasPlain, provider);
        expect(accounts).toHaveLength(2);
        expect(accounts[0]).toMatchObject({ name: 'me', issuer: 'GitHub', type: 'OTP_TOTP' });
        expect(accounts[1]).toMatchObject({ type: 'OTP_HOTP', counter: 3 });
    });

    test('encrypted backup round-trips; wrong password fails clearly', () => {
        const encrypted = build2fasEncrypted('2fas-pw');
        const accounts = parse2fas(encrypted, provider, '2fas-pw');
        expect(accounts).toHaveLength(2);
        expect(() => parse2fas(encrypted, provider, 'nope')).toThrow(/wrong password/i);
    });
});

describe('parseAndOtp', () => {
    test('maps entries including HOTP counters', () => {
        const accounts = parseAndOtp(andOtpPlain);
        expect(accounts).toHaveLength(2);
        expect(accounts[0]).toMatchObject({ name: 'me@github', issuer: 'GitHub', totpSecret: SECRET });
        expect(accounts[1]).toMatchObject({ type: 'OTP_HOTP', counter: 9 });
    });
});
