import { OtpAccount } from './google-auth';
import { decode as base32Decode } from '../edbase32';

/**
 * Parse a standard single-account otpauth:// URI — the format websites show
 * under their 2FA QR codes:
 *
 *   otpauth://totp/Issuer:account?secret=BASE32&issuer=Issuer&digits=6&period=30&algorithm=SHA1
 *   otpauth://hotp/Issuer:account?secret=BASE32&counter=0
 *
 * Also accepts Steam's non-standard `steam://BASE32SECRET` shorthand.
 * Issuer precedence follows the de-facto convention: the `issuer` query
 * parameter wins over the label prefix when both are present.
 */
export function parseOtpauthUri(uri: string): OtpAccount {
    if (uri.toLowerCase().startsWith('steam://')) {
        const secret = uri.slice('steam://'.length).trim();
        base32Decode(secret);
        return {
            name: 'Steam',
            issuer: 'Steam',
            secret,
            totpSecret: secret.toUpperCase(),
            type: 'STEAM',
            digits: 5,
            period: 30,
        };
    }

    let url: URL;
    try {
        url = new URL(uri);
    } catch (error) {
        throw new Error('Not a valid otpauth:// URI');
    }
    if (url.protocol !== 'otpauth:') {
        throw new Error('Not a valid otpauth:// URI');
    }

    const type = url.host.toLowerCase();
    if (type !== 'totp' && type !== 'hotp') {
        throw new Error(`Unknown otpauth type "${type}" — expected "totp" or "hotp"`);
    }

    const label = decodeURIComponent(url.pathname.replace(/^\//, ''));
    const [labelIssuer, labelName] = label.includes(':')
        ? [label.slice(0, label.indexOf(':')), label.slice(label.indexOf(':') + 1)]
        : [undefined, label];

    const secret = url.searchParams.get('secret');
    if (!secret) {
        throw new Error('otpauth URI is missing the secret parameter');
    }
    base32Decode(secret); // throws with a clear message on invalid base32

    const name = labelName.trim();
    if (!name) {
        throw new Error('otpauth URI has no account name in its label');
    }

    const account: OtpAccount = {
        name,
        issuer: url.searchParams.get('issuer') ?? labelIssuer?.trim() ?? undefined,
        secret,
        totpSecret: secret.toUpperCase(),
        type: type === 'hotp' ? 'OTP_HOTP' : 'OTP_TOTP',
    };

    const digits = url.searchParams.get('digits');
    if (digits) account.digits = Number(digits);
    const algorithm = url.searchParams.get('algorithm');
    if (algorithm) account.algorithm = algorithm.toUpperCase().replace(/-/g, '');
    const period = url.searchParams.get('period');
    if (period) account.period = Number(period);
    if (type === 'hotp') {
        account.counter = Number(url.searchParams.get('counter') ?? 0);
    }

    return account;
}
