// encode base32 in RFC 3548
const CHAR_MAP: Record<number, string> = {
    0: 'A', 1: 'B', 2: 'C', 3: 'D', 4: 'E', 5: 'F', 6: 'G', 7: 'H',
    8: 'I', 9: 'J', 10: 'K', 11: 'L', 12: 'M', 13: 'N', 14: 'O', 15: 'P',
    16: 'Q', 17: 'R', 18: 'S', 19: 'T', 20: 'U', 21: 'V', 22: 'W', 23: 'X',
    24: 'Y', 25: 'Z', 26: '2', 27: '3', 28: '4', 29: '5', 30: '6', 31: '7',
};

const CHAR_TO_VALUE: Record<string, number> = Object.fromEntries(
    Object.entries(CHAR_MAP).map(([value, char]) => [char, Number(value)])
);

/**
 * Decode an RFC 3548 base32 string (the format TOTP secrets use) to bytes.
 * Case-insensitive; ignores trailing '=' padding. Throws on any character
 * outside the base32 alphabet — which doubles as secret validation for
 * user-entered secrets.
 */
export function decode(input: string): Uint8Array {
    const clean = input.toUpperCase().replace(/=+$/, '');
    if (clean.length === 0) return new Uint8Array(0);

    let bits = '';
    for (const char of clean) {
        const value = CHAR_TO_VALUE[char];
        if (value === undefined) {
            throw new Error(`Invalid base32 character: "${char}"`);
        }
        bits += value.toString(2).padStart(5, '0');
    }

    const bytes = new Uint8Array(Math.floor(bits.length / 8));
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(bits.substring(i * 8, i * 8 + 8), 2);
    }
    return bytes;
}

export function encode(input: Uint8Array | null | undefined): string | null {
    if (input == null) {
        return null;
    }

    const bits: string[] = [];
    for (const byte of input) {
        bits.push(byte.toString(2).padStart(8, '0'));
    }
    const source = bits.join('');

    const encoded: string[] = [];
    for (let i = 0; i < source.length; i += 5) {
        const chunk = source.substring(i, i + 5).padEnd(5, '0');
        encoded.push(CHAR_MAP[parseInt(chunk, 2)]);
    }

    if (encoded.length % 8 !== 0) {
        const gap = 8 - (encoded.length % 8);
        for (let i = 0; i < gap; i++) {
            encoded.push('=');
        }
    }

    return encoded.join('');
}
