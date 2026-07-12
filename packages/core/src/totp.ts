import { CryptoProvider, HmacAlgorithm } from './adapters/crypto-provider';
import { NodeCryptoProvider } from './node/node-crypto-provider';
import { decode as base32Decode } from './edbase32';
import { getOtpParams } from './otp-params';

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
    algorithm?: HmacAlgorithm;
    crypto?: CryptoProvider;
}

export interface HotpOptions {
    digits?: number;
    algorithm?: HmacAlgorithm;
    crypto?: CryptoProvider;
}

const defaultCrypto = new NodeCryptoProvider();

/** Big-endian 64-bit counter as 8 bytes (JS-safe: counters stay < 2^53). */
function counterBytes(counter: number): Uint8Array {
    const message = new Uint8Array(8);
    let c = counter;
    for (let i = 7; i >= 0; i--) {
        message[i] = c & 0xff;
        c = Math.floor(c / 256);
    }
    return message;
}

/** RFC 4226 §5.3 dynamic truncation → 31-bit integer. */
function truncate(hmac: Uint8Array): number {
    const offset = hmac[hmac.length - 1] & 0x0f;
    return (
        ((hmac[offset] & 0x7f) << 24) |
        (hmac[offset + 1] << 16) |
        (hmac[offset + 2] << 8) |
        hmac[offset + 3]
    );
}

/**
 * RFC 4226 HOTP: HMAC over a 64-bit counter, dynamic truncation,
 * modulo 10^digits. Verified against the RFC 4226 Appendix D vectors —
 * see totp.test.ts.
 */
export function generateHotp(secret: string, counter: number, options: HotpOptions = {}): string {
    const { digits = 6, algorithm = 'SHA1', crypto = defaultCrypto } = options;
    const key = base32Decode(secret);
    if (key.length === 0) throw new Error('OTP secret is empty');
    const binary = truncate(crypto.hmac(algorithm, key, counterBytes(counter)));
    return String(binary % 10 ** digits).padStart(digits, '0');
}

/**
 * RFC 6238 TOTP: HOTP over the time counter floor(unixSeconds / step).
 * Implemented in-repo (no third-party OTP dependency) and verified against
 * the RFC 6238 Appendix B test vectors for SHA-1/SHA-256/SHA-512.
 */
export function generateTotp(secret: string, options: TotpOptions = {}): string {
    const { timestamp = Date.now(), digits = 6, stepSeconds = 30, algorithm = 'SHA1', crypto = defaultCrypto } = options;
    const counter = Math.floor(timestamp / 1000 / stepSeconds);
    return generateHotp(secret, counter, { digits, algorithm, crypto });
}

const STEAM_ALPHABET = '23456789BCDFGHJKMNPQRTVWXY';

/**
 * Steam Guard code: standard 30s/SHA-1 time counter, but the truncated
 * value is rendered as 5 characters from Steam's 26-character alphabet
 * (repeatedly value % 26, value /= 26) instead of decimal digits.
 */
export function generateSteamCode(secret: string, options: { timestamp?: number; crypto?: CryptoProvider } = {}): string {
    const { timestamp = Date.now(), crypto = defaultCrypto } = options;
    const key = base32Decode(secret);
    if (key.length === 0) throw new Error('OTP secret is empty');
    const counter = Math.floor(timestamp / 1000 / 30);
    let value = truncate(crypto.hmac('SHA1', key, counterBytes(counter)));
    let code = '';
    for (let i = 0; i < 5; i++) {
        code += STEAM_ALPHABET[value % STEAM_ALPHABET.length];
        value = Math.floor(value / STEAM_ALPHABET.length);
    }
    return code;
}

/**
 * Generate the right kind of code for an account (TOTP/STEAM). HOTP is
 * intentionally NOT handled here — it mutates the counter, so it goes
 * through AccountsStore.generateCodeFor which persists the increment.
 */
export function generateForAccount(account: TotpAccount, options: { timestamp?: number; crypto?: CryptoProvider } = {}): string {
    const params = getOtpParams(account);
    if (params.type === 'HOTP') {
        throw new Error('HOTP codes must be generated via AccountsStore.generateCodeFor (counter persistence)');
    }
    if (params.type === 'STEAM') {
        return generateSteamCode(account.totpSecret, options);
    }
    return generateTotp(account.totpSecret, {
        ...options,
        digits: params.digits,
        stepSeconds: params.period,
        algorithm: params.algorithm,
    });
}

/**
 * Generate a TOTP code for a secret immediately, then again at every
 * `interval` boundary. TOTP windows are aligned to unix-epoch multiples of
 * the interval, so the timer is aligned to those boundaries too — a
 * free-running setInterval started at an arbitrary moment would show stale
 * codes for up to a full window.
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
 * Seconds remaining until the current interval expires. Epoch-based so it
 * is correct for any period, not just divisors of 60.
 */
export function getTimeout(interval = 30): number {
    return interval - (Math.floor(Date.now() / 1000) % interval);
}

/**
 * Populate account.totp (and account.name_with_issuer) for each account,
 * refreshing at each account's own window boundary with its own
 * digits/period/algorithm. HOTP accounts get a placeholder — their codes
 * are generated on demand (counter must persist), never on a timer.
 */
export function updateTotp(accounts: TotpAccount[]): void {
    for (const account of accounts) {
        account.name_with_issuer = account.issuer ? `${account.issuer}(${account.name})` : account.name;
        const params = getOtpParams(account);

        if (params.type === 'HOTP') {
            account.totp = '(on demand)';
            continue;
        }

        const emit = () => {
            account.totp = generateForAccount(account);
        };
        emit();
        const msUntilNextWindow = (params.period - (Math.floor(Date.now() / 1000) % params.period)) * 1000;
        setTimeout(() => {
            emit();
            setInterval(emit, params.period * 1000);
        }, msUntilNextWindow);
    }
}
