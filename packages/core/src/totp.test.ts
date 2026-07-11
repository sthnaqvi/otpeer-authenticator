import { generateTotp, generate2FACode, getTimeout } from './totp';

const SECRET = 'KFCTML3YPBRTS3DMKRIWSUDRNREUUNJU';
// base32 of the ASCII key "12345678901234567890" from RFC 6238 Appendix B
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('generateTotp (RFC 6238)', () => {
    // Appendix B SHA-1 vectors, truncated from the documented 8 digits to
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
