import { OtpAccount } from './google-auth';
import { decode as base32Decode } from '../edbase32';

/**
 * Parse a standard single-account otpauth:// URI — the format websites show
 * under their 2FA QR codes:
 *
 *   otpauth://totp/Issuer:account?secret=BASE32&issuer=Issuer&digits=6
 *
 * Issuer precedence follows the de-facto convention: the `issuer` query
 * parameter wins over the label prefix when both are present.
 */
export function parseOtpauthUri(uri: string): OtpAccount {
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
    if (type === 'hotp') {
        throw new Error('HOTP (counter-based) accounts are not supported yet — only TOTP');
    }
    if (type !== 'totp') {
        throw new Error(`Unknown otpauth type "${type}" — expected "totp"`);
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

    return {
        name,
        issuer: url.searchParams.get('issuer') ?? labelIssuer?.trim() ?? undefined,
        secret,
        totpSecret: secret.toUpperCase(),
        type: 'OTP_TOTP',
    };
}
