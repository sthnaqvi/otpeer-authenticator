import { OtpAccount } from './google-auth';
import { CryptoProvider } from '../adapters/crypto-provider';
import { decode as base32Decode } from '../edbase32';

/**
 * Importers for other authenticator apps' backup files, so switching to
 * this app (or restoring from an old backup) never requires re-scanning
 * every QR code. Formats: Aegis JSON (plain + encrypted), 2FAS backup
 * (plain + encrypted), andOTP JSON (plain).
 */

export type ImportFormat = 'aegis' | '2fas' | 'andotp' | 'authenticator-clui-backup';

export interface DetectedImport {
    format: ImportFormat;
    encrypted: boolean;
}

const hexToBytes = (hex: string): Uint8Array => {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    return bytes;
};

/** Normalize a competitor entry into our account shape. */
function toAccount(entry: {
    name: string;
    issuer?: string;
    secret: string;
    type?: string;
    algorithm?: string;
    digits?: number;
    period?: number;
    counter?: number;
}): OtpAccount {
    const totpSecret = entry.secret.replace(/\s+/g, '').toUpperCase();
    base32Decode(totpSecret); // validate — throws on garbage
    const type = String(entry.type ?? 'totp').toLowerCase();
    return {
        name: entry.name,
        issuer: entry.issuer || undefined,
        secret: Buffer.from(base32Decode(totpSecret)).toString('base64'),
        totpSecret,
        type: type === 'hotp' ? 'OTP_HOTP' : type === 'steam' ? 'STEAM' : 'OTP_TOTP',
        algorithm: entry.algorithm ? String(entry.algorithm).toUpperCase().replace(/-/g, '') : undefined,
        digits: entry.digits,
        period: entry.period,
        counter: type === 'hotp' ? entry.counter ?? 0 : undefined,
    };
}

/**
 * Identify which app produced a backup file (and whether it's encrypted).
 * Returns null if the content isn't a recognizable backup at all.
 */
export function detectImportFormat(raw: string): DetectedImport | null {
    let data: unknown;
    try {
        data = JSON.parse(raw);
    } catch (error) {
        return null;
    }
    if (data === null || typeof data !== 'object') return null;

    if (Array.isArray(data)) {
        const first = data[0];
        if (first && typeof first === 'object' && 'secret' in first && ('label' in first || 'type' in first)) {
            return { format: 'andotp', encrypted: false };
        }
        return null;
    }

    const obj = data as Record<string, unknown>;
    if ('db' in obj && 'header' in obj) {
        return { format: 'aegis', encrypted: typeof obj.db === 'string' };
    }
    if ('services' in obj || 'servicesEncrypted' in obj) {
        return { format: '2fas', encrypted: 'servicesEncrypted' in obj && !!obj.servicesEncrypted };
    }
    if ('accounts' in obj && 'is_encrypted' in obj) {
        return { format: 'authenticator-clui-backup', encrypted: true };
    }
    return null;
}

// ---------------------------------------------------------------- Aegis

interface AegisSlot {
    type: number;
    key: string;
    key_params: { nonce: string; tag: string };
    n: number;
    r: number;
    p: number;
    salt: string;
}

interface AegisEntry {
    type: string;
    name: string;
    issuer: string;
    info: { secret: string; algo: string; digits: number; period?: number; counter?: number };
}

/**
 * Aegis JSON export. Plain: `db` is the object. Encrypted: password slots
 * hold a scrypt-wrapped master key; `db` is base64 AES-256-GCM ciphertext.
 */
export function parseAegis(raw: string, crypto: CryptoProvider, password?: string): OtpAccount[] {
    const data = JSON.parse(raw);
    let db = data.db;

    if (typeof db === 'string') {
        if (!password) throw new Error('This Aegis backup is encrypted — a password is required');
        const slots: AegisSlot[] = (data.header?.slots ?? []).filter((s: AegisSlot) => s.type === 1);
        if (!slots.length) throw new Error('Aegis backup has no password slot');
        let masterKey: Uint8Array | null = null;
        for (const slot of slots) {
            try {
                const slotKey = crypto.scrypt(password, hexToBytes(slot.salt), 32, { N: slot.n, r: slot.r, p: slot.p });
                masterKey = crypto.aesGcmDecrypt(
                    slotKey,
                    hexToBytes(slot.key_params.nonce),
                    hexToBytes(slot.key),
                    hexToBytes(slot.key_params.tag)
                );
                break;
            } catch (error) {
                // wrong slot — try the next one
            }
        }
        if (!masterKey) throw new Error('Could not decrypt Aegis backup: wrong password');
        const { nonce, tag } = data.header.params;
        const plaintext = crypto.aesGcmDecrypt(masterKey, hexToBytes(nonce), Buffer.from(db, 'base64'), hexToBytes(tag));
        db = JSON.parse(Buffer.from(plaintext).toString('utf-8'));
    }

    const entries: AegisEntry[] = db?.entries ?? [];
    return entries.map((entry) =>
        toAccount({
            name: entry.name,
            issuer: entry.issuer,
            secret: entry.info.secret,
            type: entry.type,
            algorithm: entry.info.algo,
            digits: entry.info.digits,
            period: entry.info.period,
            counter: entry.info.counter,
        })
    );
}

// ---------------------------------------------------------------- 2FAS

interface TwoFasService {
    name: string;
    secret: string;
    otp?: {
        account?: string;
        issuer?: string;
        digits?: number;
        period?: number;
        algorithm?: string;
        tokenType?: string;
        counter?: number;
    };
}

/**
 * 2FAS backup (.2fas). Plain: `services` array. Encrypted:
 * `servicesEncrypted` = base64(cipher+tag):base64(salt):base64(iv) with a
 * PBKDF2-SHA256(10000)-derived AES-256-GCM key.
 */
export function parse2fas(raw: string, crypto: CryptoProvider, password?: string): OtpAccount[] {
    const data = JSON.parse(raw);
    let services: TwoFasService[] = data.services ?? [];

    if (data.servicesEncrypted) {
        if (!password) throw new Error('This 2FAS backup is encrypted — a password is required');
        const parts = String(data.servicesEncrypted).split(':');
        if (parts.length < 3) throw new Error('Unrecognized 2FAS encrypted backup layout');
        const [ctWithTag, salt, iv] = parts.map((p) => Buffer.from(p, 'base64'));
        const key = crypto.pbkdf2Sha256(password, salt, 10000, 32);
        const tag = ctWithTag.slice(-16);
        const ciphertext = ctWithTag.slice(0, -16);
        let plaintext: Uint8Array;
        try {
            plaintext = crypto.aesGcmDecrypt(key, iv, ciphertext, tag);
        } catch (error) {
            throw new Error('Could not decrypt 2FAS backup: wrong password');
        }
        services = JSON.parse(Buffer.from(plaintext).toString('utf-8'));
    }

    return services.map((service) =>
        toAccount({
            name: service.otp?.account || service.name,
            issuer: service.otp?.issuer || service.name,
            secret: service.secret,
            type: service.otp?.tokenType,
            algorithm: service.otp?.algorithm,
            digits: service.otp?.digits,
            period: service.otp?.period,
            counter: service.otp?.counter,
        })
    );
}

// ---------------------------------------------------------------- andOTP

interface AndOtpEntry {
    secret: string;
    label: string;
    issuer?: string;
    type?: string;
    algorithm?: string;
    digits?: number;
    period?: number;
    counter?: number;
}

/** andOTP plain JSON export (an array of entries). */
export function parseAndOtp(raw: string): OtpAccount[] {
    const entries: AndOtpEntry[] = JSON.parse(raw);
    if (!Array.isArray(entries)) throw new Error('Not an andOTP export');
    return entries.map((entry) =>
        toAccount({
            name: entry.label,
            issuer: entry.issuer,
            secret: entry.secret,
            type: entry.type,
            algorithm: entry.algorithm,
            digits: entry.digits,
            period: entry.period,
            counter: entry.counter,
        })
    );
}
