import { CryptoProvider } from './adapters/crypto-provider';
import { NodeCryptoProvider } from './node/node-crypto-provider';
import { decode as base32Decode } from './edbase32';

export interface TotpAccount {
    totpSecret: string;
    name: string;
    issuer?: string;
    name_with_issuer?: string;
    totp?: string;
    [key: string]: unknown;
}

export interface TotpOptions {
    /** Milliseconds since epoch; defaults to now */
    timestamp?: number;
    digits?: number;
    stepSeconds?: number;
    crypto?: CryptoProvider;
}

const defaultCrypto = new NodeCryptoProvider();

/**
 * RFC 6238 TOTP: HMAC-SHA1 over the big-endian 64-bit time counter, RFC 4226
 * §5.3 dynamic truncation, modulo 10^digits. Implemented in-repo (replacing
 * otplib, whose v12 dependency chain is deprecated) and verified against the
 * RFC 6238 Appendix B test vectors — see totp.test.ts.
 */
export function generateTotp(secret: string, options: TotpOptions = {}): string {
    const { timestamp = Date.now(), digits = 6, stepSeconds = 30, crypto = defaultCrypto } = options;

    const key = base32Decode(secret);
    if (key.length === 0) throw new Error('TOTP secret is empty');

    let counter = Math.floor(timestamp / 1000 / stepSeconds);
    const message = new Uint8Array(8);
    for (let i = 7; i >= 0; i--) {
        message[i] = counter & 0xff;
        counter = Math.floor(counter / 256);
    }

    const hmac = crypto.hmacSha1(key, message);
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
        ((hmac[offset] & 0x7f) << 24) |
        (hmac[offset + 1] << 16) |
        (hmac[offset + 2] << 8) |
        hmac[offset + 3];

    return String(binary % 10 ** digits).padStart(digits, '0');
}

/**
 * Generate a TOTP code for a secret immediately, then again at every
 * `interval` boundary. TOTP windows are aligned to unix-epoch multiples of
 * the interval (:00/:30 wall clock for the default 30s), so the timer must
 * be aligned to those boundaries too — a free-running setInterval started at
 * an arbitrary moment would show stale codes for up to a full window.
 */
export function generate2FACode(
    secret: string,
    interval: number | ((token: string) => void) = 30,
    cb?: (token: string) => void
): void {
    if (typeof interval === 'function') {
        cb = interval;
        interval = 30;
    }
    const intervalSec = interval as number;
    const callback = cb as (token: string) => void;
    const emit = () => callback(generateTotp(secret, { stepSeconds: intervalSec }));

    emit();
    const msUntilNextWindow = (intervalSec - (Math.floor(Date.now() / 1000) % intervalSec)) * 1000;
    setTimeout(() => {
        emit();
        setInterval(emit, intervalSec * 1000);
    }, msUntilNextWindow);
}

/**
 * Seconds remaining until the current TOTP interval expires.
 */
export function getTimeout(interval = 30): number {
    const currSeconds = new Date().getSeconds();
    return interval - (currSeconds % interval);
}

/**
 * Populate account.totp (and account.name_with_issuer) for each account,
 * refreshing automatically as each account's code rotates.
 */
export function updateTotp(accounts: TotpAccount[]): void {
    for (const account of accounts) {
        generate2FACode(account.totpSecret, (token) => {
            account.name_with_issuer = account.issuer ? `${account.issuer}(${account.name})` : account.name;
            account.totp = token;
        });
    }
}
