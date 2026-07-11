import { encode } from './edbase32';

describe('edbase32 encode (RFC 3548)', () => {
    // RFC 4648 test vectors (base32 section, same alphabet as RFC 3548)
    const vectors: Array<[string, string]> = [
        ['f', 'MY======'],
        ['fo', 'MZXQ===='],
        ['foo', 'MZXW6==='],
        ['foob', 'MZXW6YQ='],
        ['fooba', 'MZXW6YTB'],
        ['foobar', 'MZXW6YTBOI======'],
    ];

    test.each(vectors)('encode(%s) -> %s', (input, expected) => {
        expect(encode(Buffer.from(input, 'ascii'))).toBe(expected);
    });

    test('returns null for null/undefined input', () => {
        expect(encode(null)).toBeNull();
        expect(encode(undefined)).toBeNull();
    });

    test('empty input encodes to empty string', () => {
        expect(encode(Buffer.alloc(0))).toBe('');
    });
});
