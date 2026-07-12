import { HmacAlgorithm } from './adapters/crypto-provider';
import { OtpAccount } from './importers/google-auth';

export type OtpType = 'TOTP' | 'HOTP' | 'STEAM';

export interface OtpParams {
    type: OtpType;
    algorithm: HmacAlgorithm;
    digits: number;
    period: number;
    counter: number;
}

/**
 * Normalize an account's OTP parameters into generation-ready values.
 *
 * Accounts in the vault carry values from wherever they were imported:
 *  - Google Authenticator migration payloads use ENUMS — `digits: 1` means
 *    SIX and `2` means EIGHT (NOT a literal digit count!), and algorithm
 *    strings look like "ALGO_SHA1". Vaults written by versions <=1.4.0
 *    stored these raw, so normalization must happen at read time forever.
 *  - otpauth:// URIs and competitor imports carry literal values
 *    (digits 6/7/8, period 15/30/60, algorithm "SHA1"/"SHA256"/"SHA512").
 *
 * Anything absent or unrecognized falls back to the RFC defaults
 * (TOTP, SHA-1, 6 digits, 30s).
 */
export function getOtpParams(account: Partial<OtpAccount>): OtpParams {
    // --- type ---
    const rawType = String(account.type ?? 'TOTP').toUpperCase();
    const type: OtpType =
        rawType.includes('HOTP') ? 'HOTP'
        : rawType.includes('STEAM') ? 'STEAM'
        : 'TOTP';

    // --- digits ---
    let digits = Number(account.digits ?? 6);
    if (digits === 1) digits = 6; // Google migration enum DIGIT_COUNT_SIX
    else if (digits === 2) digits = 8; // Google migration enum DIGIT_COUNT_EIGHT
    if (!(digits >= 5 && digits <= 10)) digits = 6;
    if (type === 'STEAM') digits = 5;

    // --- algorithm ---
    const rawAlgo = String(account.algorithm ?? 'SHA1').toUpperCase().replace(/^ALGO_/, '').replace(/-/g, '');
    const algorithm: HmacAlgorithm =
        rawAlgo === 'SHA256' ? 'SHA256'
        : rawAlgo === 'SHA512' ? 'SHA512'
        : 'SHA1'; // SHA1, ALGO_INVALID/unspecified, and MD5 (never seen in practice) all land here

    // --- period ---
    let period = Number(account.period ?? 30);
    if (!(period >= 5 && period <= 300)) period = 30;

    // --- counter (HOTP) ---
    let counter = Number(account.counter ?? 0);
    if (!Number.isFinite(counter) || counter < 0) counter = 0;

    return { type, algorithm, digits, period, counter };
}
