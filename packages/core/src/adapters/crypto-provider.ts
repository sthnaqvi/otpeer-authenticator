export type HmacAlgorithm = 'SHA1' | 'SHA256' | 'SHA512';

/**
 * Platform crypto seam. Node/Electron implement this with Node's built-in
 * `crypto` module; React Native implements it with a natively-bridged
 * library (e.g. react-native-quick-crypto — which supports every primitive
 * listed here). Core never calls a platform crypto API directly.
 */
export interface CryptoProvider {
    /** AES-256-GCM (vault format v2+). Output: base64(salt|iv|authTag|ciphertext). */
    encrypt(plaintext: string, password: string): string;
    /** AES-256-GCM. Throws on wrong password or tampered/corrupted ciphertext. */
    decrypt(ciphertext: string, password: string): string;
    /**
     * Decrypt the pre-v2 AES-256-CBC format (base64(iv|ciphertext|salt)).
     * Optional: only platforms that can encounter v1 vaults (Node) need it.
     */
    decryptLegacy?(ciphertext: string, password: string): string;
    /** UUID v4 from the platform's crypto RNG, for account identities. */
    randomId(): string;
    /** HMAC — the primitive TOTP/HOTP (RFC 6238/4226) are built on. */
    hmac(algorithm: HmacAlgorithm, key: Uint8Array, data: Uint8Array): Uint8Array;
    /** @deprecated use hmac('SHA1', ...) — kept for compatibility */
    hmacSha1(key: Uint8Array, data: Uint8Array): Uint8Array;

    // ---- low-level primitives used by competitor-backup importers ----

    /** scrypt KDF with explicit cost parameters (Aegis encrypted backups). */
    scrypt(
        password: string,
        salt: Uint8Array,
        keyLength: number,
        options: { N: number; r: number; p: number }
    ): Uint8Array;
    /** PBKDF2-HMAC-SHA256 (2FAS encrypted backups). */
    pbkdf2Sha256(password: string, salt: Uint8Array, iterations: number, keyLength: number): Uint8Array;
    /** Raw AES-256-GCM open with explicit key/iv/tag. Throws on auth failure. */
    aesGcmDecrypt(key: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array, authTag: Uint8Array): Uint8Array;
}
