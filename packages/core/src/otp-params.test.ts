import { getOtpParams } from './otp-params';

describe('getOtpParams', () => {
    test('defaults: TOTP, SHA1, 6 digits, 30s', () => {
        expect(getOtpParams({})).toEqual({ type: 'TOTP', algorithm: 'SHA1', digits: 6, period: 30, counter: 0 });
    });

    test('Google migration enums: digits 1→6, 2→8; ALGO_ prefix stripped', () => {
        expect(getOtpParams({ digits: 1, algorithm: 'ALGO_SHA1', type: 'OTP_TOTP' })).toMatchObject({
            digits: 6, algorithm: 'SHA1', type: 'TOTP',
        });
        expect(getOtpParams({ digits: 2, algorithm: 'ALGO_SHA256' })).toMatchObject({ digits: 8, algorithm: 'SHA256' });
        expect(getOtpParams({ algorithm: 'ALGO_SHA512' })).toMatchObject({ algorithm: 'SHA512' });
    });

    test('literal values pass through', () => {
        expect(getOtpParams({ digits: 8, period: 60, algorithm: 'SHA256' })).toMatchObject({
            digits: 8, period: 60, algorithm: 'SHA256',
        });
        expect(getOtpParams({ digits: 7 })).toMatchObject({ digits: 7 });
    });

    test('HOTP type and counter (including protobuf string counters)', () => {
        expect(getOtpParams({ type: 'OTP_HOTP', counter: '5' })).toMatchObject({ type: 'HOTP', counter: 5 });
        expect(getOtpParams({ type: 'hotp', counter: 12 })).toMatchObject({ type: 'HOTP', counter: 12 });
    });

    test('Steam forces 5 digits', () => {
        expect(getOtpParams({ type: 'STEAM', digits: 6 })).toMatchObject({ type: 'STEAM', digits: 5 });
    });

    test('garbage falls back to safe defaults', () => {
        expect(getOtpParams({ digits: 99, period: 100000, algorithm: 'MD5' as never, counter: -3 })).toEqual({
            type: 'TOTP', algorithm: 'SHA1', digits: 6, period: 30, counter: 0,
        });
    });
});
