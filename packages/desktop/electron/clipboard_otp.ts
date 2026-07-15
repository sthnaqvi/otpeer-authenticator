import { clipboard } from 'electron';

/**
 * Copy OTP without permanently destroying the user's prior clipboard.
 * Writes the code now; after a short window restores the previous text
 * only if the clipboard still holds our OTP (user didn't copy something else).
 */

const RESTORE_MS = 45_000;

let restore_timer: NodeJS.Timeout | null = null;
let previous_text: string | null = null;
let written_otp: string | null = null;

export function copyOtpPreservingClipboard(otp: string): void {
    const code = otp.replace(/\s+/g, '');
    if (!code) return;

    if (restore_timer) {
        clearTimeout(restore_timer);
        restore_timer = null;
    }

    // Keep the first pre-OTP snapshot across rapid re-copies of codes.
    if (previous_text === null) {
        try {
            previous_text = clipboard.readText();
        } catch {
            previous_text = '';
        }
    }

    clipboard.writeText(code);
    written_otp = code;

    restore_timer = setTimeout(() => {
        try {
            const current = clipboard.readText();
            if (written_otp && current === written_otp && previous_text !== null) {
                clipboard.writeText(previous_text);
            }
        } catch {
            // ignore restore failures
        }
        previous_text = null;
        written_otp = null;
        restore_timer = null;
    }, RESTORE_MS);
}

export function clearClipboardRestore(): void {
    if (restore_timer) clearTimeout(restore_timer);
    restore_timer = null;
    previous_text = null;
    written_otp = null;
}
