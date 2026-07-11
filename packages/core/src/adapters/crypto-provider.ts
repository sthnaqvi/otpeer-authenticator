/**
 * Encrypts/decrypts the vault contents with a user password. Node/Electron
 * implement this with Node's built-in `crypto` module; React Native needs a
 * portable or natively-bridged implementation (e.g. react-native-quick-crypto)
 * since Node's `crypto` module isn't available there. Core never calls
 * `crypto` directly, only through this interface.
 */
export interface CryptoProvider {
  encrypt(plaintext: string, password: string): string;
  decrypt(ciphertext: string, password: string): string;
}
