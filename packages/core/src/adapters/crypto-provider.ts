/**
 * Encrypts/decrypts the vault contents with a user password. Node/Electron
 * implement this with Node's built-in `crypto` module; React Native needs a
 * portable or natively-bridged implementation (e.g. react-native-quick-crypto)
 * since Node's `crypto` module isn't available there. Core never calls
 * `crypto` directly, only through this interface.
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
}
