import { parseAccountsFromUri } from './google-auth';

const SAMPLE_URI =
    'otpauth-migration://offline?data=CicKFFFFNi94eGM5bGxUUWlQcWxJSjU0EgR0ZXN0GgNvdHAgASgBMAIQARgBIAA%3D';

describe('parseAccountsFromUri', () => {
    test('decodes a Google Authenticator export URI', () => {
        const accounts = parseAccountsFromUri(SAMPLE_URI);
        expect(accounts).toHaveLength(1);
        expect(accounts[0].name).toBe('test');
        expect(accounts[0].issuer).toBe('otp');
        expect(accounts[0].type).toBe('OTP_TOTP');
        expect(accounts[0].totpSecret).toBe('KFCTML3YPBRTS3DMKRIWSUDRNREUUNJU');
    });

    test('throws on a URI without a data parameter', () => {
        expect(() => parseAccountsFromUri('otpauth-migration://offline?nodata=1')).toThrow(/data/);
    });

    test('throws on malformed URI', () => {
        expect(() => parseAccountsFromUri('not a uri at all')).toThrow();
    });
});
