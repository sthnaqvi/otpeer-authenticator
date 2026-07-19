/**
 * Map known desktop / IPC / DOM errors to friendly UX copy.
 * Unknown messages pass through (IPC wrapper stripped) so user reports
 * remain a debug gate for expanding these rules.
 */

export type ErrorContext =
    | 'add'
    | 'import'
    | 'export'
    | 'sync'
    | 'vault'
    | 'camera'
    | 'biometric'
    | 'generic';

export type CaptureScreenReason = 'permission' | 'empty' | 'unavailable';

const IPC_INVOKE_PREFIX = /^Error invoking remote method '[^']+':\s*/i;

const SCREEN_PERMISSION_MSG =
    'macOS Screen Recording permission is required. Enable OTPeer Authenticator in '
    + 'System Settings → Privacy & Security → Screen Recording, then quit and reopen the app.';

const CAPTURE_EMPTY_MSG =
    'Could not capture the screen. Try choosing a screenshot image instead.';

type Rule = { test: RegExp; message: string; contexts?: ErrorContext[] };

const RULES: Rule[] = [
    {
        test: /failed to get sources|screen recording|display[- ]capture/i,
        message: SCREEN_PERMISSION_MSG,
    },
    {
        test: /NotAllowedError|permission denied|Permission denied/i,
        message: 'Camera access was denied. Choose a QR image or paste the URI instead.',
        contexts: ['camera', 'add', 'sync'],
    },
    {
        test: /NotFoundError|Requested device not found|no camera/i,
        message: 'No camera was found. Choose a QR image or paste the URI instead.',
        contexts: ['camera', 'add', 'sync'],
    },
    {
        test: /NotReadableError|Could not start video|TrackStartError/i,
        message: 'Could not open the camera. It may be in use by another app.',
        contexts: ['camera', 'add', 'sync'],
    },
    {
        test: /OverconstrainedError/i,
        message: 'Could not open the camera with the requested settings. Try again.',
        contexts: ['camera', 'add', 'sync'],
    },
    { test: /^Vault is locked$/i, message: 'Vault is locked. Unlock it and try again.' },
    {
        test: /Could not decrypt vault: wrong password/i,
        message: 'Wrong password, or the vault file is corrupted.',
    },
    {
        test: /Touch ID is not available/i,
        message: 'Touch ID is not available on this Mac.',
        contexts: ['biometric', 'vault'],
    },
    {
        test: /Set a vault password before enabling Touch ID/i,
        message: 'Set a vault password before enabling Touch ID unlock.',
        contexts: ['biometric', 'vault'],
    },
    {
        test: /Unlock the vault with your password first/i,
        message: 'Unlock the vault with your password first, then enable Touch ID.',
        contexts: ['biometric', 'vault'],
    },
    {
        test: /OS secure storage is not available/i,
        message: 'OS secure storage is not available on this device.',
    },
    { test: /Not a valid otpauth:\/\//i, message: 'Not a valid otpauth:// URI.' },
    {
        test: /Unknown otpauth type/i,
        message: 'Unknown otpauth type — expected totp or hotp.',
    },
    {
        test: /missing the secret parameter/i,
        message: 'That setup URI is missing the secret parameter.',
    },
    {
        test: /no account name in its label/i,
        message: 'That setup URI has no account name in its label.',
    },
    {
        test: /Invalid base32/i,
        message: 'The secret is not valid base32. Check for typos and try again.',
    },
    {
        test: /Could not decrypt (Aegis|2FAS) backup: wrong password/i,
        message: 'Wrong backup password.',
        contexts: ['import', 'add'],
    },
    {
        test: /backup is encrypted — a password is required/i,
        message: 'This backup is encrypted — enter the backup password.',
        contexts: ['import', 'add'],
    },
    {
        test: /Unrecognized backup|not an authenticator-clui backup|Not an andOTP/i,
        message: 'Unrecognized backup file. Use an OTPeer, Aegis, 2FAS, or andOTP export.',
        contexts: ['import', 'add'],
    },
    {
        test: /A pairing code is required/i,
        message: 'A pairing code is required to join sync.',
        contexts: ['sync'],
    },
    {
        test: /Pairing code mismatch|tampered traffic/i,
        message: 'Pairing code mismatch or tampered traffic — sync aborted.',
        contexts: ['sync'],
    },
    {
        test: /Peer speaks .+ — expected|Unexpected .+ — sync aborted/i,
        message: 'The other device speaks an incompatible sync protocol.',
        contexts: ['sync'],
    },
    {
        test: /Oversized sync frame/i,
        message: 'Sync data was too large — sync aborted.',
        contexts: ['sync'],
    },
    {
        test: /Sync target must be/i,
        message: 'Enter an authsync:// link or host:port from the other device.',
        contexts: ['sync'],
    },
    { test: /^Account name is required$/i, message: 'Account name is required.' },
    { test: /^New name is required$/i, message: 'New name is required.' },
    { test: /No account matches/i, message: 'No matching account was found.' },
    {
        test: /predates format v2|cannot read legacy vaults/i,
        message: 'This vault uses an older format that cannot be read on this platform.',
    },
];

const EMPTY_FALLBACKS: Record<ErrorContext, string> = {
    add: 'Something went wrong while adding the account.',
    import: 'Something went wrong while importing.',
    export: 'Something went wrong while exporting.',
    sync: 'Something went wrong during sync.',
    vault: 'Something went wrong with the vault.',
    camera: 'Could not open the camera.',
    biometric: 'Something went wrong with Touch ID.',
    generic: 'Something went wrong.',
};

function extractRawMessage(err: unknown): string {
    if (err == null) return '';
    if (typeof err === 'string') return err.trim();
    if (err instanceof Error) {
        const msg = (err.message || '').trim();
        if (err.name && err.name !== 'Error' && msg && !msg.includes(err.name)) {
            return `${err.name}: ${msg}`;
        }
        return msg || (err.name !== 'Error' ? err.name : '');
    }
    if (typeof err === 'object' && 'message' in err) {
        const msg = (err as { message: unknown }).message;
        if (typeof msg === 'string') return msg.trim();
    }
    return String(err).trim();
}

function stripIpcWrapper(message: string): string {
    return message.replace(IPC_INVOKE_PREFIX, '').trim();
}

function matchRule(normalized: string, context?: ErrorContext): string | null {
    for (const rule of RULES) {
        if (rule.contexts && context !== undefined && !rule.contexts.includes(context)) {
            continue;
        }
        if (rule.test.test(normalized)) return rule.message;
    }
    return null;
}

/**
 * Convert an unknown error into UI copy.
 * Known patterns → friendly message; otherwise → IPC-stripped raw message.
 */
export function toUserMessage(err: unknown, context?: ErrorContext): string {
    const raw = extractRawMessage(err);
    const normalized = stripIpcWrapper(raw);
    if (!normalized) {
        return EMPTY_FALLBACKS[context ?? 'generic'];
    }
    return matchRule(normalized, context) ?? normalized;
}

/** Alias for catch sites. */
export function errorMessage(err: unknown, context?: ErrorContext): string {
    return toUserMessage(err, context);
}

/** Friendly copy for structured screen-capture failures (no throw). */
export function captureScreenUserMessage(reason: CaptureScreenReason): string {
    if (reason === 'permission') return SCREEN_PERMISSION_MSG;
    return CAPTURE_EMPTY_MSG;
}
