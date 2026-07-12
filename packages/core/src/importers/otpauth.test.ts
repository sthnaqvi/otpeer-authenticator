import { parseOtpauthUri } from './otpauth';

describe('parseOtpauthUri', () => {
    test('parses a full otpauth://totp URI with issuer parameter', () => {
        const account = parseOtpauthUri(
            'otpauth://totp/GitHub:tauseef?secret=KFCTML3YPBRTS3DMKRIWSUDRNREUUNJU&issuer=GitHub&digits=6'
        );
        expect(account.name).toBe('tauseef');
        expect(account.issuer).toBe('GitHub');
        expect(account.totpSecret).toBe('KFCTML3YPBRTS3DMKRIWSUDRNREUUNJU');
        expect(account.type).toBe('OTP_TOTP');
    });

    test('issuer query parameter wins over label prefix', () => {
        const account = parseOtpauthUri('otpauth://totp/OldIssuer:me?secret=MZXW6YTBOI&issuer=NewIssuer');
        expect(account.issuer).toBe('NewIssuer');
    });

    test('label-only issuer is used when no query issuer', () => {
        const account = parseOtpauthUri('otpauth://totp/Site:me?secret=MZXW6YTBOI');
        expect(account.issuer).toBe('Site');
        expect(account.name).toBe('me');
    });

    test('label without issuer works', () => {
        const account = parseOtpauthUri('otpauth://totp/justme?secret=MZXW6YTBOI');
        expect(account.issuer).toBeUndefined();
        expect(account.name).toBe('justme');
    });

    test('URL-encoded labels decode correctly', () => {
        const account = parseOtpauthUri('otpauth://totp/My%20Site:user%40mail.com?secret=MZXW6YTBOI');
        expect(account.issuer).toBe('My Site');
        expect(account.name).toBe('user@mail.com');
    });

    test('accepts HOTP with its counter', () => {
        const account = parseOtpauthUri('otpauth://hotp/Bank:acct?secret=MZXW6YTBOI&counter=42');
        expect(account.type).toBe('OTP_HOTP');
        expect(account.counter).toBe(42);
    });

    test('honors digits/period/algorithm parameters', () => {
        const account = parseOtpauthUri('otpauth://totp/X:y?secret=MZXW6YTBOI&digits=8&period=60&algorithm=SHA256');
        expect(account).toMatchObject({ digits: 8, period: 60, algorithm: 'SHA256' });
    });

    test('accepts steam:// shorthand', () => {
        const account = parseOtpauthUri(`steam://MZXW6YTBOI`);
        expect(account).toMatchObject({ type: 'STEAM', issuer: 'Steam', digits: 5, totpSecret: 'MZXW6YTBOI' });
    });

    test('rejects missing or invalid secrets', () => {
        expect(() => parseOtpauthUri('otpauth://totp/x')).toThrow(/secret/);
        expect(() => parseOtpauthUri('otpauth://totp/x?secret=notbase32!!')).toThrow(/base32/i);
    });

    test('rejects non-otpauth URIs', () => {
        expect(() => parseOtpauthUri('https://example.com')).toThrow(/otpauth/);
        expect(() => parseOtpauthUri('garbage')).toThrow(/otpauth/);
    });
});
