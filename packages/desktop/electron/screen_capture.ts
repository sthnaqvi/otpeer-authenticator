import { desktopCapturer, systemPreferences } from 'electron';

export type CaptureScreenResult =
    | { ok: true; dataUrl: string }
    | { ok: false; reason: 'permission' | 'empty' | 'unavailable' };

function isScreenCaptureAllowed(): boolean {
    if (process.platform !== 'darwin') return true;
    try {
        return systemPreferences.getMediaAccessStatus('screen') === 'granted';
    } catch {
        return true;
    }
}

function isPermissionFailure(message: string): boolean {
    return /failed to get sources|permission|not authorized|denied/i.test(message);
}

/**
 * Grab a high-res primary-display thumbnail for on-screen QR scanning.
 * Returns a structured result so the UI can show Screen Recording guidance
 * instead of raw Electron IPC errors.
 */
export async function captureScreenForQr(): Promise<CaptureScreenResult> {
    if (!isScreenCaptureAllowed()) {
        return { ok: false, reason: 'permission' };
    }
    try {
        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            // Higher than 1080p — small browser setup QRs fail at 1920×1080.
            thumbnailSize: { width: 3840, height: 2160 },
        });
        const primary = sources[0];
        if (!primary || primary.thumbnail.isEmpty()) {
            return { ok: false, reason: 'empty' };
        }
        return { ok: true, dataUrl: primary.thumbnail.toDataURL() };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            ok: false,
            reason: isPermissionFailure(message) ? 'permission' : 'unavailable',
        };
    }
}
