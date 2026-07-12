import { CryptoProvider } from '../adapters/crypto-provider';
import { encode as base32Encode } from '../edbase32';
import { hkdfSha256 } from './hkdf';

/**
 * Pairing for local sync (see docs/plan/stage-c-sync-protocol.md).
 *
 * The one-time code carries >=130 bits of entropy, so no PAKE is needed:
 * an attacker who sees all traffic but not the code cannot derive the
 * session key, and the code is far beyond brute force. The code is
 * single-use — the host's listener dies after one session.
 */

export const PAIRING_CODE_LENGTH = 26; // base32 chars ≈ 130 bits

export interface SyncTarget {
    host: string;
    port: number;
    /** absent when the user gave a bare host:port — prompt for it */
    code?: string;
}

export function generatePairingCode(crypto: CryptoProvider): string {
    // 17 random bytes → 27+ base32 chars; take 26 (130 bits)
    const encoded = base32Encode(crypto.randomBytes(17)) as string;
    return encoded.replace(/=+$/, '').slice(0, PAIRING_CODE_LENGTH);
}

export function formatSyncUri(host: string, port: number, code: string): string {
    return `authsync://${host}:${port}#${code}`;
}

/** Parse an authsync:// URI or a bare host:port. */
export function parseSyncTarget(input: string): SyncTarget {
    const trimmed = input.trim();
    const uriMatch = /^authsync:\/\/([^:/#]+):(\d+)#([A-Z2-7]+)$/i.exec(trimmed);
    if (uriMatch) {
        return { host: uriMatch[1], port: Number(uriMatch[2]), code: uriMatch[3].toUpperCase() };
    }
    const hostPortMatch = /^([^:/#]+):(\d+)$/.exec(trimmed);
    if (hostPortMatch) {
        return { host: hostPortMatch[1], port: Number(hostPortMatch[2]) };
    }
    throw new Error('Sync target must be an authsync://host:port#CODE URI or host:port');
}

/**
 * Session key derivation: HKDF-SHA256(code) bound to the protocol version
 * so a future SYNC/2 never shares keys with SYNC/1 traffic.
 */
export function deriveSessionKey(crypto: CryptoProvider, code: string): Uint8Array {
    return hkdfSha256(
        crypto,
        Buffer.from(code.toUpperCase(), 'utf-8'),
        Buffer.from('authenticator-clui/SYNC1', 'utf-8'),
        Buffer.from('session-key', 'utf-8'),
        32
    );
}
