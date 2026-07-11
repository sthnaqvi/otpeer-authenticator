import { decode, encode } from './edbase32';

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

describe('edbase32 decode', () => {
    const vectors: Array<[string, string]> = [
        ['MY======', 'f'],
        ['MZXQ====', 'fo'],
        ['MZXW6===', 'foo'],
        ['MZXW6YQ=', 'foob'],
        ['MZXW6YTB', 'fooba'],
        ['MZXW6YTBOI======', 'foobar'],
    ];

    test.each(vectors)('decode(%s) -> %s', (input, expected) => {
        expect(Buffer.from(decode(input)).toString('ascii')).toBe(expected);
    });

    test('round-trips with encode', () => {
        const bytes = Buffer.from('any binary \x00\xff payload', 'binary');
        expect(Buffer.from(decode(encode(bytes)!))).toEqual(bytes);
    });

    test('is case-insensitive and tolerates missing padding', () => {
        expect(Buffer.from(decode('mzxw6ytboi')).toString('ascii')).toBe('foobar');
    });

    test('throws on characters outside the base32 alphabet', () => {
        expect(() => decode('MZXW1===')).toThrow(/base32/i); // '1' not in alphabet
        expect(() => decode('has space')).toThrow(/base32/i);
    });

    test('empty string decodes to empty bytes', () => {
        expect(decode('')).toEqual(new Uint8Array(0));
    });
});
