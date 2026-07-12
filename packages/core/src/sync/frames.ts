import { CryptoProvider } from '../adapters/crypto-provider';

/**
 * SYNC/1 wire framing: every message is one frame —
 *
 *   [4-byte BE payload length][iv(12) | authTag(16) | ciphertext]
 *
 * where ciphertext is AES-256-GCM over the JSON message with the pairing
 * session key. A failed auth tag means wrong pairing code or tampering;
 * the session aborts immediately, nothing partial is ever applied.
 */

export const SYNC_PROTOCOL = 'SYNC/1';
const IV_LEN = 12;
const TAG_LEN = 16;
/** Vault payloads are tiny; anything huge is hostile or corrupt. */
export const MAX_FRAME_BYTES = 4 * 1024 * 1024;

export interface SyncMessage {
    proto?: string;
    kind: 'HELLO' | 'ACCOUNTS' | 'CONFIRM' | 'BYE' | 'ABORT';
    [key: string]: unknown;
}

export function encodeFrame(crypto: CryptoProvider, key: Uint8Array, message: SyncMessage): Buffer {
    const iv = crypto.randomBytes(IV_LEN);
    const { ciphertext, authTag } = crypto.aesGcmEncrypt(key, iv, Buffer.from(JSON.stringify(message), 'utf-8'));
    const payload = Buffer.concat([Buffer.from(iv), Buffer.from(authTag), Buffer.from(ciphertext)]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(payload.length, 0);
    return Buffer.concat([length, payload]);
}

export function decodeFramePayload(crypto: CryptoProvider, key: Uint8Array, payload: Buffer): SyncMessage {
    const iv = payload.slice(0, IV_LEN);
    const authTag = payload.slice(IV_LEN, IV_LEN + TAG_LEN);
    const ciphertext = payload.slice(IV_LEN + TAG_LEN);
    let plaintext: Uint8Array;
    try {
        plaintext = crypto.aesGcmDecrypt(key, iv, ciphertext, authTag);
    } catch (error) {
        throw new Error('Pairing code mismatch or tampered traffic — sync aborted');
    }
    return JSON.parse(Buffer.from(plaintext).toString('utf-8'));
}

/**
 * Incremental frame parser: feed raw socket chunks, get complete decoded
 * messages out. Oversized or malformed frames throw (session aborts).
 */
export class FrameReader {
    private buffer = Buffer.alloc(0);

    constructor(private crypto: CryptoProvider, private key: Uint8Array) {}

    feed(chunk: Buffer): SyncMessage[] {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        const messages: SyncMessage[] = [];
        while (this.buffer.length >= 4) {
            const length = this.buffer.readUInt32BE(0);
            if (length > MAX_FRAME_BYTES) throw new Error('Oversized sync frame — sync aborted');
            if (this.buffer.length < 4 + length) break;
            const payload = this.buffer.slice(4, 4 + length);
            this.buffer = this.buffer.slice(4 + length);
            messages.push(decodeFramePayload(this.crypto, this.key, payload));
        }
        return messages;
    }
}
