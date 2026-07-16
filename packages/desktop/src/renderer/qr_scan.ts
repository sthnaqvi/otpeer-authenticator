import jsQR from 'jsqr';

type InversionAttempts = 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst';

/**
 * Cap on the longest edge fed to jsQR for live-camera frames. jsQR cost is
 * roughly linear in pixel count, so bounding this keeps each frame real-time
 * while still leaving enough resolution (~6+ px/module) for dense QR codes.
 */
const CAMERA_MAX_EDGE = 1024;

/** Cache one 2d context per canvas so live scanning doesn't re-fetch it each frame. */
const ctx_cache = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();

function get_reusable_ctx(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
    const cached = ctx_cache.get(canvas);
    if (cached) return cached;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) ctx_cache.set(canvas, ctx);
    return ctx;
}

/** Decode a QR payload from raw RGBA pixels. */
export function decodeQrFromImageData(
    image_data: ImageData,
    inversion: InversionAttempts = 'attemptBoth',
): string | null {
    const result = jsQR(image_data.data, image_data.width, image_data.height, {
        inversionAttempts: inversion,
    });
    return result?.data?.trim() || null;
}

/**
 * Decode a QR from a live video frame. Tuned for real-time scanning: downscale
 * to a bounded working size, reuse a single caller-owned canvas (no per-frame
 * allocation), and run a single non-inverted jsQR pass — a camera sees a QR as
 * dark-on-light, so `attemptBoth` would just double the work for nothing. This
 * keeps the effective sample rate high enough to catch a sharp handheld frame.
 */
export function decodeQrFromVideoFrame(
    source: CanvasImageSource,
    width: number,
    height: number,
    canvas: HTMLCanvasElement,
    inversion: InversionAttempts = 'dontInvert',
): string | null {
    if (width < 1 || height < 1) return null;
    const scale = Math.min(1, CAMERA_MAX_EDGE / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = get_reusable_ctx(canvas);
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = scale < 1;
    ctx.drawImage(source, 0, 0, w, h);
    return decodeQrFromImageData(ctx.getImageData(0, 0, w, h), inversion);
}

/**
 * Draw a source at multiple scales and try to decode — helps small QRs in
 * screenshots / screen captures.
 */
export function decodeQrFromCanvasSource(
    source: CanvasImageSource,
    width: number,
    height: number,
): string | null {
    if (width < 1 || height < 1) return null;
    const scales = [1, 0.75, 0.5, 1.5, 2];
    const seen = new Set<string>();
    for (const scale of scales) {
        const w = Math.max(1, Math.round(width * scale));
        const h = Math.max(1, Math.round(height * scale));
        const key = `${w}x${h}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // Cap enormous canvases (Retina full-screen * 2) for memory/CPU
        if (w * h > 16_000_000) continue;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) continue;
        ctx.imageSmoothingEnabled = scale < 1;
        ctx.drawImage(source, 0, 0, w, h);
        const payload = decodeQrFromImageData(ctx.getImageData(0, 0, w, h));
        if (payload) return payload;
    }
    return null;
}

/** Decode QR from a data URL (e.g. screen capture thumbnail). */
export function decodeQrFromDataUrl(data_url: string): Promise<string | null> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            resolve(decodeQrFromCanvasSource(img, img.naturalWidth, img.naturalHeight));
        };
        img.onerror = () => resolve(null);
        img.src = data_url;
    });
}

/** Decode QR from a user-picked image file (screenshot or photo). */
export function decodeQrFromFile(file: File): Promise<string | null> {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
            const data_url = typeof reader.result === 'string' ? reader.result : '';
            if (!data_url) {
                resolve(null);
                return;
            }
            void decodeQrFromDataUrl(data_url).then(resolve);
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
    });
}
