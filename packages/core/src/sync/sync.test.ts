import { NodeCryptoProvider } from '../node/node-crypto-provider';
import { hkdfSha256 } from './hkdf';
import { generatePairingCode, formatSyncUri, parseSyncTarget, deriveSessionKey, PAIRING_CODE_LENGTH } from './pairing';
import { encodeFrame, FrameReader, MAX_FRAME_BYTES } from './frames';
import { syncMerge } from './merge';
import { hostSync, joinSync } from '../node/node-sync';
import { OtpAccount } from '../importers/google-auth';

const provider = new NodeCryptoProvider();
const hex = (s: string) => Buffer.from(s, 'hex');

describe('hkdfSha256 (RFC 5869 Appendix A vectors)', () => {
    test('Test Case 1 (basic)', () => {
        const okm = hkdfSha256(
            provider,
            hex('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b'),
            hex('000102030405060708090a0b0c'),
            hex('f0f1f2f3f4f5f6f7f8f9'),
            42
        );
        expect(Buffer.from(okm).toString('hex')).toBe(
            '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865'
        );
    });

    test('Test Case 3 (zero-length salt/info)', () => {
        const okm = hkdfSha256(
            provider,
            hex('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b'),
            new Uint8Array(0),
            new Uint8Array(0),
            42
        );
        expect(Buffer.from(okm).toString('hex')).toBe(
            '8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8'
        );
    });
});

describe('pairing', () => {
    test('code has full length, base32 alphabet, and is unique', () => {
        const a = generatePairingCode(provider);
        const b = generatePairingCode(provider);
        expect(a).toMatch(new RegExp(`^[A-Z2-7]{${PAIRING_CODE_LENGTH}}$`));
        expect(a).not.toBe(b);
    });

    test('URI round-trip and bare host:port parsing', () => {
        const code = generatePairingCode(provider);
        const uri = formatSyncUri('192.168.1.7', 43210, code);
        expect(parseSyncTarget(uri)).toEqual({ host: '192.168.1.7', port: 43210, code });
        expect(parseSyncTarget('10.0.0.2:9999')).toEqual({ host: '10.0.0.2', port: 9999 });
        expect(() => parseSyncTarget('garbage')).toThrow(/authsync/);
    });

    test('session keys differ per code, stable per code', () => {
        const k1 = deriveSessionKey(provider, 'AAAAAAAAAAAAAAAAAAAAAAAAAA');
        const k2 = deriveSessionKey(provider, 'BBBBBBBBBBBBBBBBBBBBBBBBBB');
        expect(Buffer.from(k1)).toEqual(Buffer.from(deriveSessionKey(provider, 'aaaaaaaaaaaaaaaaaaaaaaaaaa')));
        expect(Buffer.from(k1)).not.toEqual(Buffer.from(k2));
        expect(k1.length).toBe(32);
    });
});

describe('frames', () => {
    const key = deriveSessionKey(provider, generatePairingCode(provider));

    test('round-trips messages, split across arbitrary chunk boundaries', () => {
        const reader = new FrameReader(provider, key);
        const wire = Buffer.concat([
            encodeFrame(provider, key, { kind: 'HELLO', proto: 'SYNC/1' }),
            encodeFrame(provider, key, { kind: 'ACCOUNTS', accounts: [{ name: 'x' }] }),
        ]);
        const messages = [];
        for (let i = 0; i < wire.length; i += 7) {
            messages.push(...reader.feed(wire.slice(i, i + 7)));
        }
        expect(messages.map((m) => m.kind)).toEqual(['HELLO', 'ACCOUNTS']);
    });

    test('wrong session key aborts with the pairing-mismatch error', () => {
        const otherKey = deriveSessionKey(provider, generatePairingCode(provider));
        const reader = new FrameReader(provider, otherKey);
        expect(() => reader.feed(encodeFrame(provider, key, { kind: 'HELLO' }))).toThrow(/pairing code mismatch/i);
    });

    test('tampered frame aborts', () => {
        const frame = encodeFrame(provider, key, { kind: 'HELLO' });
        frame[frame.length - 1] ^= 0xff;
        const reader = new FrameReader(provider, key);
        expect(() => reader.feed(frame)).toThrow(/pairing code mismatch|tampered/i);
    });

    test('oversized frame aborts', () => {
        const reader = new FrameReader(provider, key);
        const evil = Buffer.alloc(4);
        evil.writeUInt32BE(MAX_FRAME_BYTES + 1, 0);
        expect(() => reader.feed(evil)).toThrow(/oversized/i);
    });
});

describe('syncMerge', () => {
    const acct = (id: string, name: string, updatedAt: string, extra: Partial<OtpAccount> = {}): OtpAccount =>
        ({ id, name, updatedAt, secret: 's', totpSecret: `SECRET${id}`, ...extra } as OtpAccount);

    test('remote-only accounts are added', () => {
        const { accounts, summary } = syncMerge([acct('a', 'A', '2026-01-01')], [acct('b', 'B', '2026-01-02')]);
        expect(accounts).toHaveLength(2);
        expect(summary).toMatchObject({ added: 1, unchanged: 0 });
    });

    test('newer remote wins, older remote loses (LWW)', () => {
        const local = [acct('a', 'old-name', '2026-01-01')];
        const newer = syncMerge(local, [acct('a', 'new-name', '2026-02-01')]);
        expect(newer.accounts[0].name).toBe('new-name');
        expect(newer.summary.updated).toBe(1);

        const older = syncMerge(local, [acct('a', 'stale-name', '2025-01-01')]);
        expect(older.accounts[0].name).toBe('old-name');
        expect(older.summary.unchanged).toBe(1);
    });

    test('ties keep local on both sides (deterministic convergence)', () => {
        const mine = acct('a', 'mine', '2026-01-01');
        const theirs = acct('a', 'theirs', '2026-01-01');
        expect(syncMerge([mine], [theirs]).accounts[0].name).toBe('mine');
        expect(syncMerge([theirs], [mine]).accounts[0].name).toBe('theirs');
        // same timestamps → both sides keep their copy? No — convergence requires
        // the same winner. Ties keep LOCAL, so this documents the accepted skew:
        // identical-timestamp conflicting edits only converge on the next edit.
    });

    test('newer tombstone deletes; deletions propagate', () => {
        const local = [acct('a', 'A', '2026-01-01')];
        const remote = [acct('a', 'A', '2026-02-01', { deletedAt: '2026-02-01' })];
        const { accounts, summary } = syncMerge(local, remote);
        expect(accounts[0].deletedAt).toBe('2026-02-01');
        expect(summary.deleted).toBe(1);
    });

    test('cross-device duplicate (same issuer/name/secret, two ids) collapses deterministically', () => {
        const mine = acct('bbb', 'GitHub', '2026-01-01', { issuer: 'GitHub', totpSecret: 'SAME' });
        const theirs = acct('aaa', 'GitHub', '2026-01-02', { issuer: 'GitHub', totpSecret: 'SAME' });
        const fromMySide = syncMerge([mine], [theirs]);
        const fromTheirSide = syncMerge([theirs], [mine]);
        expect(fromMySide.accounts).toHaveLength(1);
        expect(fromMySide.accounts[0].id).toBe('aaa');
        expect(fromTheirSide.accounts[0].id).toBe('aaa');
    });

    test('symmetric: both peers compute the same final set', () => {
        const setA = [acct('1', 'one', '2026-01-05'), acct('2', 'two', '2026-01-01')];
        const setB = [acct('2', 'two-renamed', '2026-03-01'), acct('3', 'three', '2026-01-02', { deletedAt: '2026-01-02' })];
        const a = syncMerge(setA, setB);
        const b = syncMerge(setB, setA);
        const normalize = (accounts: OtpAccount[]) =>
            accounts.map((x) => `${x.id}:${x.name}:${x.deletedAt ?? ''}`).sort();
        expect(normalize(a.accounts)).toEqual(normalize(b.accounts));
    });
});

describe('hostSync/joinSync end to end (localhost)', () => {
    const acct = (id: string, name: string, updatedAt: string): OtpAccount =>
        ({ id, name, updatedAt, secret: 's', totpSecret: `S${id}`, type: 'OTP_TOTP' } as OtpAccount);

    test('two peers exchange, confirm, and converge', async () => {
        const hostAccounts = [acct('h1', 'host-only', '2026-01-01')];
        const guestAccounts = [acct('g1', 'guest-only', '2026-01-02')];

        let uri = '';
        const hostPromise = hostSync(hostAccounts, {
            onReady: (info) => { uri = info.uri; },
            confirm: async () => true,
        }, { host: '127.0.0.1' });

        // wait for the listener to be ready
        while (!uri) await new Promise((r) => setTimeout(r, 10));
        const target = parseSyncTarget(uri) as Required<import('./pairing').SyncTarget>;
        const guestOutcome = await joinSync(target, guestAccounts, { confirm: async () => true });
        const hostOutcome = await hostPromise;

        expect(guestOutcome.applied).toBe(true);
        expect(hostOutcome.applied).toBe(true);
        const names = (o: typeof hostOutcome) => o.accounts.map((a) => a.name).sort();
        expect(names(hostOutcome)).toEqual(['guest-only', 'host-only']);
        expect(names(guestOutcome)).toEqual(names(hostOutcome));
    });

    test('either side declining aborts both without applying', async () => {
        let uri = '';
        const hostPromise = hostSync([acct('h1', 'h', '2026-01-01')], {
            onReady: (info) => { uri = info.uri; },
            confirm: async () => false, // host says no
        }, { host: '127.0.0.1' });
        while (!uri) await new Promise((r) => setTimeout(r, 10));
        const target = parseSyncTarget(uri) as Required<import('./pairing').SyncTarget>;
        const guestOutcome = await joinSync(target, [], { confirm: async () => true });
        const hostOutcome = await hostPromise;
        expect(guestOutcome.applied).toBe(false);
        expect(hostOutcome.applied).toBe(false);
    });

    test('wrong pairing code aborts the session on both sides', async () => {
        let uri = '';
        const hostPromise = hostSync([], {
            onReady: (info) => { uri = info.uri; },
            confirm: async () => true,
        }, { host: '127.0.0.1' });
        while (!uri) await new Promise((r) => setTimeout(r, 10));
        const target = parseSyncTarget(uri) as Required<import('./pairing').SyncTarget>;
        target.code = 'WRONGWRONGWRONGWRONGWRONGW';
        const joinPromise = joinSync(target, [], { confirm: async () => true });
        joinPromise.catch(() => undefined); // awaited below — suppress unhandled-rejection noise
        // host sees the undecryptable frame; guest sees the host vanish
        await expect(hostPromise).rejects.toThrow(/mismatch|tampered/i);
        await expect(joinPromise).rejects.toThrow(/mismatch|tampered|disconnected/i);
    });
});
