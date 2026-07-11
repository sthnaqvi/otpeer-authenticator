import { authenticator } from 'otplib';
import { generate2FACode, getTimeout } from './totp';

const SECRET = 'KFCTML3YPBRTS3DMKRIWSUDRNREUUNJU';

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
        jest.useFakeTimers(); // keep the scheduled follow-up timers out of the worker
        let received = '';
        generate2FACode(SECRET, (token) => { received = token; });
        expect(received).toBe(authenticator.generate(SECRET));
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
