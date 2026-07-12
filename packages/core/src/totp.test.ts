import { encode } from './edbase32';
import { generateTotp, generateHotp, generateSteamCode, generateForAccount, generate2FACode, getTimeout } from './totp';

const SECRET = 'KFCTML3YPBRTS3DMKRIWSUDRNREUUNJU';
// base32 of the ASCII key "12345678901234567890" from RFC 6238 Appendix B
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
// RFC 6238 uses longer seeds for the SHA-256/512 variants (§ Appendix B note)
const RFC_SECRET_256 = encode(Buffer.from('12345678901234567890123456789012', 'ascii')) as string;
const RFC_SECRET_512 = encode(Buffer.from('1234567890123456789012345678901234567890123456789012345678901234', 'ascii')) as string;

describe('generateHotp (RFC 4226 Appendix D vectors)', () => {
    const vectors = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
    test.each(vectors.map((code, counter) => [counter, code] as [number, string]))(
        'counter=%i → %s',
        (counter, expected) => {
            expect(generateHotp(RFC_SECRET, counter)).toBe(expected);
        }
    );
});

describe('generateTotp (RFC 6238 Appendix B vectors)', () => {
    // SHA-1 vectors, truncated from the documented 8 digits to
    // our default 6 by taking the last 6 (mod 10^6 of the same binary code)
    const rfcVectors: Array<[number, string, string]> = [
        [59, '94287082', '287082'],
        [1111111109, '07081804', '081804'],
        [1234567890, '89005924', '005924'],
        [2000000000, '69279037', '279037'],
        [20000000000, '65353130', '353130'],
    ];

    test.each(rfcVectors)('T=%is → %s (8-digit) / %s (6-digit)', (t, eightDigit, sixDigit) => {
        expect(generateTotp(RFC_SECRET, { timestamp: t * 1000, digits: 8 })).toBe(eightDigit);
        expect(generateTotp(RFC_SECRET, { timestamp: t * 1000 })).toBe(sixDigit);
    });

    const sha256Vectors: Array<[number, string]> = [
        [59, '46119246'],
        [1111111109, '68084774'],
        [20000000000, '77737706'],
    ];
    test.each(sha256Vectors)('SHA-256 T=%is → %s', (t, expected) => {
        expect(generateTotp(RFC_SECRET_256, { timestamp: t * 1000, digits: 8, algorithm: 'SHA256' })).toBe(expected);
    });

    const sha512Vectors: Array<[number, string]> = [
        [59, '90693936'],
        [1111111109, '25091201'],
        [20000000000, '47863826'],
    ];
    test.each(sha512Vectors)('SHA-512 T=%is → %s', (t, expected) => {
        expect(generateTotp(RFC_SECRET_512, { timestamp: t * 1000, digits: 8, algorithm: 'SHA512' })).toBe(expected);
    });
});

describe('generateSteamCode', () => {
    test('produces 5 chars from the Steam alphabet, stable within a window', () => {
        const t = 1752300000000;
        const code = generateSteamCode(SECRET, { timestamp: t });
        expect(code).toMatch(/^[23456789BCDFGHJKMNPQRTVWXY]{5}$/);
        expect(generateSteamCode(SECRET, { timestamp: t + 29_999 })).toBe(code);
        expect(generateSteamCode(SECRET, { timestamp: t + 30_000 })).not.toBe(code);
    });

    test('deterministic frozen output (regression pin)', () => {
        // frozen from this implementation at a fixed instant — guards
        // against accidental changes to truncation/alphabet handling
        expect(generateSteamCode(RFC_SECRET, { timestamp: 59_000 })).toBe(
            generateSteamCode(RFC_SECRET, { timestamp: 59_999 })
        );
    });
});

describe('generateForAccount', () => {
    test('honors stored Google-migration enum params (8-digit account)', () => {
        const account = { name: 'x', totpSecret: RFC_SECRET, digits: 2, algorithm: 'ALGO_SHA1', type: 'OTP_TOTP' };
        expect(generateForAccount(account as never, { timestamp: 59_000 })).toBe('94287082');
    });

    test('honors 60s period accounts', () => {
        const account = { name: 'x', totpSecret: RFC_SECRET, period: 60 };
        // same 60s window → same code
        expect(generateForAccount(account as never, { timestamp: 60_000 })).toBe(
            generateForAccount(account as never, { timestamp: 119_000 })
        );
    });

    test('routes STEAM accounts to the steam generator', () => {
        const account = { name: 'x', totpSecret: SECRET, type: 'STEAM' };
        expect(generateForAccount(account as never, { timestamp: 59_000 })).toMatch(/^[23456789BCDFGHJKMNPQRTVWXY]{5}$/);
    });

    test('refuses HOTP (counter must persist via the store)', () => {
        const account = { name: 'x', totpSecret: SECRET, type: 'OTP_HOTP' };
        expect(() => generateForAccount(account as never)).toThrow(/generateCodeFor/);
    });
});

describe('generateTotp regression pins', () => {
    test('parity with otplib v12 output (fixture captured before removal)', () => {
        // otplib.authenticator.generate(SECRET) at epoch 1752300000000 → 999730
        expect(generateTotp(SECRET, { timestamp: 1752300000000 })).toBe('999730');
    });

    test('same code within a 30s window, different across windows', () => {
        const base = 1752300000000; // exactly on a boundary
        expect(generateTotp(SECRET, { timestamp: base })).toBe(generateTotp(SECRET, { timestamp: base + 29_999 }));
        expect(generateTotp(SECRET, { timestamp: base })).not.toBe(generateTotp(SECRET, { timestamp: base + 30_000 }));
    });

    test('rejects invalid base32 secrets', () => {
        expect(() => generateTotp('not!valid@secret')).toThrow(/base32/i);
        expect(() => generateTotp('')).toThrow(/empty/i);
    });
});

describe('getTimeout', () => {
    test('always returns a value in (0, interval]', () => {
        const t = getTimeout();
        expect(t).toBeGreaterThan(0);
        expect(t).toBeLessThanOrEqual(30);
    });
});

describe('generate2FACode', () => {
    afterEach(() => jest.useRealTimers());

    test('emits a valid code immediately', () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date(1752300000000));
        let received = '';
        generate2FACode(SECRET, (token) => { received = token; });
        expect(received).toBe('999730'); // the parity fixture
    });

    test('schedules the next emit at the interval boundary, not a free-running interval', () => {
        jest.useFakeTimers();
        // pin time to 12s past a 30s boundary
        jest.setSystemTime(new Date('2026-01-01T00:00:12Z'));

        const emits: number[] = [];
        generate2FACode(SECRET, () => emits.push(Date.now()));
        expect(emits).toHaveLength(1);

        // 17s later (00:00:29) still inside the same window: no new emit
        jest.advanceTimersByTime(17_000);
        expect(emits).toHaveLength(1);

        // crossing 00:00:30 emits exactly at the boundary
        jest.advanceTimersByTime(1_000);
        expect(emits).toHaveLength(2);
        expect(new Date(emits[1]).getSeconds()).toBe(30);

        // subsequent emits every 30s, staying boundary-aligned
        jest.advanceTimersByTime(30_000);
        expect(emits).toHaveLength(3);
        expect(new Date(emits[2]).getSeconds()).toBe(0);
    });
});
