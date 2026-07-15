import path from 'path';
import os from 'os';

/**
 * All vault/sync logic for the desktop app, on top of the vendored core.
 * DELIBERATELY free of any `electron` import: main.ts is thin IPC wiring
 * around this class, which lets the smoke test drive the exact production
 * code path headless (scripts/smoke.js), the same discipline that keeps
 * core itself platform-pure.
 *
 * The vault password lives only here (main process memory) after unlock —
 * the renderer never sees it.
 */

// vendored packages/core (build step copies packages/core/dist here)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const core = require('../vendor/core');

export interface AccountView {
    id: string;
    name: string;
    issuer?: string;
    type: string;
    digits: number;
    period: number;
    code: string | null; // null → HOTP, generate on demand
    expiresIn: number | null;
}

export interface VaultStatus {
    exists: boolean;
    encrypted: boolean;
    locked: boolean;
    location?: string;
    count?: number;
}

export interface SyncEvents {
    onReady?: (info: { uri: string; code: string; qrSvg: string }) => void;
    confirm: (summary: { added: number; updated: number; deleted: number; unchanged: number }) => Promise<boolean>;
}

const defaultVaultPath = () => path.join(os.homedir(), '.authenticator-clui', 'accounts.json');

function qrSvg(text: string): string {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const qrcodeGenerator = require('qrcode-generator');
    const qr = qrcodeGenerator(0, 'M');
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    const size = count * 4;
    let rects = '';
    for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
            if (qr.isDark(r, c)) rects += `<rect x="${c * 4}" y="${r * 4}" width="4" height="4"/>`;
        }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
}

export class VaultService {
    private store: InstanceType<typeof core.AccountsStore>;
    private password: string | null = null; // null = locked (or no vault yet)
    private unlocked = false;

    constructor(vaultPath: string = defaultVaultPath(), legacyFilePaths: string[] = []) {
        this.store = new core.AccountsStore(
            new core.NodeStorageAdapter({ filePath: vaultPath, legacyFilePaths })
        );
    }

    async status(): Promise<VaultStatus> {
        const exists = await this.store.isValidBackupFile();
        if (!exists) return { exists: false, encrypted: false, locked: !this.unlocked };
        const encrypted = await this.store.isEncrypted();
        const info = await this.store.info(this.unlocked ? this.password ?? '' : encrypted ? undefined : '');
        return {
            exists,
            encrypted,
            locked: !this.unlocked,
            location: info?.location,
            count: info?.count,
        };
    }

    /** Unlock (or open an unencrypted vault). Returns false on bad password. */
    async unlock(password: string): Promise<boolean> {
        const exists = await this.store.isValidBackupFile();
        if (!exists) {
            // no vault yet — "unlocked" empty state; first add/import/sync creates it
            this.password = password || '';
            this.unlocked = true;
            return true;
        }
        const encrypted = await this.store.isEncrypted();
        if (!encrypted) {
            // Plaintext vaults have no password gate — only empty input unlocks the session.
            if (password !== '') return false;
            this.password = '';
            this.unlocked = true;
            return true;
        }
        const ok = await this.store.isValid(password);
        // isValid returns account count (0+) or false — don't treat 0 as failure
        if (ok === false) return false;
        this.password = password;
        this.unlocked = true;
        return true;
    }

    /**
     * Encrypt, re-key, or clear vault encryption while unlocked.
     * Empty `newPassword` writes the vault in plaintext and clears the session password.
     */
    async setPassword(newPassword: string): Promise<void> {
        const current = this.requireUnlocked();
        await this.store.setPassword(current, newPassword);
        this.password = newPassword;
    }

    /** Current in-memory vault password (null when locked). */
    sessionPassword(): string | null {
        return this.unlocked ? this.password : null;
    }

    lock(): void {
        this.password = null;
        this.unlocked = false;
    }

    private requireUnlocked(): string {
        if (!this.unlocked || this.password === null) throw new Error('Vault is locked');
        return this.password;
    }

    /** Active accounts with current codes (TOTP/Steam); HOTP gets code=null. */
    async listWithCodes(): Promise<AccountView[]> {
        const password = this.requireUnlocked();
        if (!(await this.store.isValidBackupFile())) return [];
        try {
            const accounts = await this.store.getActive(password);
            return accounts.map((account: Record<string, unknown>) => {
                const params = core.getOtpParams(account);
                const isHotp = params.type === 'HOTP';
                return {
                    id: String(account.id ?? ''),
                    name: String(account.name),
                    issuer: account.issuer ? String(account.issuer) : undefined,
                    type: params.type,
                    digits: params.digits,
                    period: params.period,
                    code: isHotp ? null : core.generateForAccount(account),
                    expiresIn: isHotp ? null : core.getTimeout(params.period),
                };
            });
        } catch (error) {
            const message = (error as Error).message || '';
            if (/wrong password|decrypt|corrupted|tampered/i.test(message)) {
                // Session password no longer matches on-disk vault — force lock
                this.lock();
            }
            throw error;
        }
    }

    /** Generate one code by account id (HOTP-safe: persists counter bump). */
    async generateCode(accountId: string): Promise<{ code: string; expiresIn: number | null }> {
        const password = this.requireUnlocked();
        const { code, expiresIn } = await this.store.generateCodeFor(accountId, password);
        return { code, expiresIn };
    }

    async addAccount(input: { name: string; issuer?: string; secret: string }): Promise<{ id: string }> {
        const account = await this.store.add(input, this.requireUnlocked());
        return { id: account.id };
    }

    async addFromUri(uri: string): Promise<{ id: string }> {
        const parsed = core.parseOtpauthUri(uri);
        const account = await this.store.add(
            {
                name: parsed.name,
                issuer: parsed.issuer,
                secret: parsed.totpSecret,
                type: parsed.type,
                digits: parsed.digits,
                period: parsed.period,
                algorithm: parsed.algorithm,
                counter: parsed.counter,
            },
            this.requireUnlocked()
        );
        return { id: account.id };
    }

    async removeAccount(accountId: string): Promise<void> {
        await this.store.remove(accountId, this.requireUnlocked());
    }

    async renameAccount(accountId: string, newName: string): Promise<void> {
        await this.store.rename(accountId, newName, this.requireUnlocked());
    }

    /** Import file content or a migration/otpauth URI; returns merge summary text parts. */
    async importData(raw: string, filePassword?: string): Promise<{ added: number; skipped: number; conflicts: string[] }> {
        const password = this.requireUnlocked();
        let accounts;
        const trimmed = raw.trim();
        if (trimmed.startsWith('otpauth-migration://')) accounts = core.parseAccountsFromUri(trimmed);
        else if (trimmed.startsWith('otpauth://') || trimmed.toLowerCase().startsWith('steam://')) {
            accounts = [core.parseOtpauthUri(trimmed)];
        } else {
            accounts = this.store.parseImportFile(raw, filePassword);
        }
        return this.store.merge(accounts, password);
    }

    detectImport(raw: string): { format: string; encrypted: boolean } | null {
        return this.store.detectImport(raw);
    }

    async exportVault(exportPassword: string): Promise<string> {
        return this.store.exportVault(this.requireUnlocked(), exportPassword);
    }

    /** Host a sync session. Wires QR generation for the renderer. */
    async hostSync(events: SyncEvents): Promise<{ applied: boolean; summary: SyncEvents['confirm'] extends (s: infer S) => unknown ? S : never }> {
        const password = this.requireUnlocked();
        const local = (await this.store.isValidBackupFile()) ? await this.store.get(password) : [];
        const outcome = await core.hostSync(local, {
            onReady: (info: { uri: string; code: string }) =>
                events.onReady?.({ uri: info.uri, code: info.code, qrSvg: qrSvg(info.uri) }),
            confirm: events.confirm,
        });
        if (outcome.applied) await this.store.applySyncedAccounts(outcome.accounts, password);
        return { applied: outcome.applied, summary: outcome.summary };
    }

    /** Join a sync session via authsync:// URI or host:port (+ code). */
    async joinSync(targetInput: string, pairingCode: string | undefined, events: SyncEvents) {
        const password = this.requireUnlocked();
        const target = core.parseSyncTarget(targetInput);
        if (!target.code) {
            if (!pairingCode) throw new Error('A pairing code is required to join');
            target.code = pairingCode.toUpperCase().replace(/\s+/g, '');
        }
        const local = (await this.store.isValidBackupFile()) ? await this.store.get(password) : [];
        const outcome = await core.joinSync(target, local, { confirm: events.confirm });
        if (outcome.applied) await this.store.applySyncedAccounts(outcome.accounts, password);
        return { applied: outcome.applied, summary: outcome.summary };
    }
}
