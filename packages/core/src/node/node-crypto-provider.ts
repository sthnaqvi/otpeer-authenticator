import crypto from 'crypto';
import { CryptoProvider } from '../adapters/crypto-provider';

const ALGORITHM = {
    /**
     * AES256 is an authenticated encryption mode that
     * not only provides confidentiality but also
     * provides integrity in a secured way
     * */
    BLOCK_CIPHER: 'aes256',

    /**
     * NIST recommends 128 bits or 16 bytes IV for AES256
     * to promote interoperability, efficiency, and
     * simplicity of design
     */
    IV_BYTE_LEN: 16,

    /**
     * Note: 256 (in algorithm name) is key size.
     * Block size for AES is always 128
     */
    KEY_BYTE_LEN: 32,

    /**
     * To prevent rainbow table attacks
     * */
    SALT_BYTE_LEN: 16
};

const _getIV = () => crypto.randomBytes(ALGORITHM.IV_BYTE_LEN);

const _getSalt = () => crypto.randomBytes(ALGORITHM.SALT_BYTE_LEN);

const _getKeyFromPassword = (password: string, salt: Buffer) => {
    return crypto.scryptSync(password, salt, ALGORITHM.KEY_BYTE_LEN);
};

/**
 * Node implementation of CryptoProvider.
 *
 * NOTE: this is the same AES-256-CBC scheme as the original src/encryption.js,
 * moved verbatim as part of Stage A1 (no behavior change). The CBC -> GCM
 * upgrade, with a legacy-decrypt migration path, lands in Stage A2 — see
 * docs/plan/stage-a2-vault-migration.md.
 */
export class NodeCryptoProvider implements CryptoProvider {
    encrypt(text: string, password: string): string {
        const iv = _getIV();
        const salt = _getSalt();
        const key = _getKeyFromPassword(password, salt);
        const cipher = crypto.createCipheriv(ALGORITHM.BLOCK_CIPHER, key, iv);
        let encryptedMessage = cipher.update(text, 'utf-8');
        encryptedMessage = Buffer.concat([encryptedMessage, cipher.final()]);
        encryptedMessage = Buffer.concat([iv, encryptedMessage, salt]);
        return encryptedMessage.toString('base64');
    }

    decrypt(ciphertext: string, password: string): string {
        const buffer = Buffer.from(ciphertext, 'base64');
        const salt = buffer.slice(-ALGORITHM.SALT_BYTE_LEN);
        const key = _getKeyFromPassword(password, salt);
        const iv = buffer.slice(0, ALGORITHM.IV_BYTE_LEN);
        const encryptedMessage = buffer.slice(ALGORITHM.IV_BYTE_LEN, -ALGORITHM.SALT_BYTE_LEN);
        const decipher = crypto.createDecipheriv(ALGORITHM.BLOCK_CIPHER, key, iv);
        let messagetext = decipher.update(encryptedMessage);
        messagetext = Buffer.concat([messagetext, decipher.final()]);
        return messagetext.toString('utf-8');
    }
}
