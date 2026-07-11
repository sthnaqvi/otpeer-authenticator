import crypto from 'crypto';
import { CryptoProvider } from '../adapters/crypto-provider';

/**
 * AES-256-GCM parameters (vault format v2+).
 * Wire format: base64( salt(16) | iv(12) | authTag(16) | ciphertext ).
 * GCM is authenticated encryption: a wrong password or a tampered/corrupted
 * ciphertext fails loudly at the auth-tag check instead of silently
 * decrypting to garbage the way CBC did.
 */
const GCM = {
    CIPHER: 'aes-256-gcm' as const,
    /** NIST-recommended IV length for GCM */
    IV_BYTE_LEN: 12,
    KEY_BYTE_LEN: 32,
    SALT_BYTE_LEN: 16,
    AUTH_TAG_BYTE_LEN: 16,
};

/**
 * Legacy AES-256-CBC parameters (pre-v2 vaults, versions <=1.2.x).
 * Wire format: base64( iv(16) | ciphertext | salt(16) ).
 */
const LEGACY_CBC = {
    CIPHER: 'aes256' as const,
    IV_BYTE_LEN: 16,
    KEY_BYTE_LEN: 32,
    SALT_BYTE_LEN: 16,
};

const _getKeyFromPassword = (password: string, salt: Buffer) => {
    return crypto.scryptSync(password, salt, GCM.KEY_BYTE_LEN);
};

export class NodeCryptoProvider implements CryptoProvider {
    encrypt(text: string, password: string): string {
        const salt = crypto.randomBytes(GCM.SALT_BYTE_LEN);
        const iv = crypto.randomBytes(GCM.IV_BYTE_LEN);
        const key = _getKeyFromPassword(password, salt);
        const cipher = crypto.createCipheriv(GCM.CIPHER, key, iv);
        const ciphertext = Buffer.concat([cipher.update(text, 'utf-8'), cipher.final()]);
        const authTag = cipher.getAuthTag();
        return Buffer.concat([salt, iv, authTag, ciphertext]).toString('base64');
    }

    decrypt(ciphertext: string, password: string): string {
        const buffer = Buffer.from(ciphertext, 'base64');
        const salt = buffer.slice(0, GCM.SALT_BYTE_LEN);
        const iv = buffer.slice(GCM.SALT_BYTE_LEN, GCM.SALT_BYTE_LEN + GCM.IV_BYTE_LEN);
        const authTag = buffer.slice(
            GCM.SALT_BYTE_LEN + GCM.IV_BYTE_LEN,
            GCM.SALT_BYTE_LEN + GCM.IV_BYTE_LEN + GCM.AUTH_TAG_BYTE_LEN
        );
        const encrypted = buffer.slice(GCM.SALT_BYTE_LEN + GCM.IV_BYTE_LEN + GCM.AUTH_TAG_BYTE_LEN);
        const key = _getKeyFromPassword(password, salt);
        const decipher = crypto.createDecipheriv(GCM.CIPHER, key, iv);
        decipher.setAuthTag(authTag);
        // final() verifies the auth tag and throws on wrong password/tampering
        return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf-8');
    }

    decryptLegacy(ciphertext: string, password: string): string {
        const buffer = Buffer.from(ciphertext, 'base64');
        const salt = buffer.slice(-LEGACY_CBC.SALT_BYTE_LEN);
        const iv = buffer.slice(0, LEGACY_CBC.IV_BYTE_LEN);
        const encrypted = buffer.slice(LEGACY_CBC.IV_BYTE_LEN, -LEGACY_CBC.SALT_BYTE_LEN);
        const key = _getKeyFromPassword(password, salt);
        const decipher = crypto.createDecipheriv(LEGACY_CBC.CIPHER, key, iv);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf-8');
    }

    randomId(): string {
        // UUID v4 from randomBytes — crypto.randomUUID needs Node >=14.17,
        // engines only promise >=14.0
        const bytes = crypto.randomBytes(16);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = bytes.toString('hex');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
}
