import { authenticator } from 'otplib';

export interface TotpAccount {
    totpSecret: string;
    name: string;
    issuer?: string;
    name_with_issuer?: string;
    totp?: string;
    [key: string]: unknown;
}

/**
 * Generate a TOTP code for a secret immediately, then again at every
 * `interval` boundary. TOTP windows are aligned to unix-epoch multiples of
 * the interval (:00/:30 wall clock for the default 30s), so the timer must
 * be aligned to those boundaries too — a free-running setInterval started at
 * an arbitrary moment would show stale codes for up to a full window.
 */
export function generate2FACode(
    secret: string,
    interval: number | ((token: string) => void) = 30,
    cb?: (token: string) => void
): void {
    if (typeof interval === 'function') {
        cb = interval;
        interval = 30;
    }
    const intervalSec = interval as number;
    const callback = cb as (token: string) => void;
    const emit = () => callback(authenticator.generate(secret));

    emit();
    const msUntilNextWindow = (intervalSec - (Math.floor(Date.now() / 1000) % intervalSec)) * 1000;
    setTimeout(() => {
        emit();
        setInterval(emit, intervalSec * 1000);
    }, msUntilNextWindow);
}

/**
 * Seconds remaining until the current TOTP interval expires.
 */
export function getTimeout(interval = 30): number {
    const currSeconds = new Date().getSeconds();
    return interval - (currSeconds % interval);
}

/**
 * Populate account.totp (and account.name_with_issuer) for each account,
 * refreshing automatically as each account's code rotates.
 */
export function updateTotp(accounts: TotpAccount[]): void {
    for (const account of accounts) {
        generate2FACode(account.totpSecret, (token) => {
            account.name_with_issuer = account.issuer ? `${account.issuer}(${account.name})` : account.name;
            account.totp = token;
        });
    }
}
