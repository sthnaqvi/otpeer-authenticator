import protobuf from 'protobufjs';
import path from 'path';

import { encode as base32Encode } from '../edbase32';

export interface OtpAccount {
    /** Stable identity for sync/merge — assigned at import or backfilled on migration */
    id?: string;
    /** ISO timestamp of last modification — for future last-write-wins merge */
    updatedAt?: string;
    /** Tombstone timestamp — reserved for Stage C sync, never set before then */
    deletedAt?: string;
    secret: string;
    name: string;
    issuer?: string;
    algorithm?: string;
    digits?: number;
    type?: string;
    counter?: string;
    totpSecret: string;
    [key: string]: unknown;
}

/**
 * Google Authenticator uses protobuf to encode the 2fa export payload.
 */
function decodeProtobuf(payload: Buffer): { otpParameters: OtpAccount[] } {
    const root = protobuf.loadSync(path.join(__dirname, 'google_auth.proto'));
    const MigrationPayload = root.lookupType('googleauth.MigrationPayload');
    const message = MigrationPayload.decode(payload);
    return MigrationPayload.toObject(message, {
        longs: String,
        enums: String,
        bytes: String,
    }) as { otpParameters: OtpAccount[] };
}

/**
 * Convert base64 (protobuf's secret encoding) to base32, the format most
 * TOTP implementations expect as the "secret key" when generating a code.
 */
function toBase32(base64String: string): string {
    const raw = Buffer.from(base64String, 'base64');
    return base32Encode(raw) as string;
}

/**
 * The `data` query param from a Google Authenticator export URI is a
 * protobuf payload, base64-encoded and then URI-encoded. Decode both layers.
 */
function decode(data: string): OtpAccount[] {
    const buffer = Buffer.from(decodeURIComponent(data), 'base64');
    const payload = decodeProtobuf(buffer);

    return payload.otpParameters.map((account) => {
        account.totpSecret = toBase32(account.secret);
        return account;
    });
}

/**
 * Parse accounts out of a Google Authenticator "otpauth-migration://" export URI.
 */
export function parseAccountsFromUri(uri: string): OtpAccount[] {
    const queryParams = new URL(uri).search;
    const data = new URLSearchParams(queryParams).get('data');
    if (!data) {
        throw new Error('URI is missing the "data" query parameter');
    }
    return decode(data);
}
