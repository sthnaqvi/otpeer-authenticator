import { CryptoProvider } from '../adapters/crypto-provider';

/**
 * HKDF-SHA256 (RFC 5869), implemented on the CryptoProvider's hmac seam so
 * it runs identically on Node and (later) React Native — Node's built-in
 * crypto.hkdfSync needs Node >=15 while engines promise >=14, and RN has no
 * built-in at all. Verified against the RFC 5869 Appendix A test vectors.
 */
export function hkdfSha256(
    crypto: CryptoProvider,
    ikm: Uint8Array,
    salt: Uint8Array,
    info: Uint8Array,
    length: number
): Uint8Array {
    // Extract
    const prk = crypto.hmac('SHA256', salt, ikm);

    // Expand
    const blocks: Uint8Array[] = [];
    let previous: Uint8Array = new Uint8Array(0);
    for (let i = 1; blocks.length * 32 < length; i++) {
        const input = new Uint8Array(previous.length + info.length + 1);
        input.set(previous, 0);
        input.set(info, previous.length);
        input[input.length - 1] = i;
        previous = crypto.hmac('SHA256', prk, input);
        blocks.push(previous);
    }
    return Buffer.concat(blocks.map((b) => Buffer.from(b))).slice(0, length);
}
