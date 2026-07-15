import { StorageAdapter } from './adapters/storage';
import { CryptoProvider } from './adapters/crypto-provider';
import { NodeStorageAdapter } from './node/node-storage-adapter';
import { NodeCryptoProvider } from './node/node-crypto-provider';
import { parseAccountsFromUri, OtpAccount } from './importers/google-auth';
import { generateTotp, generateHotp, generateForAccount, getTimeout } from './totp';
import { getOtpParams } from './otp-params';
import { decode as base32Decode } from './edbase32';
import { detectImportFormat, parseAegis, parse2fas, parseAndOtp, DetectedImport } from './importers/competitors';

/**
 * Thrown when a name matcher hits more than one account; carries the
 * candidates so the caller can show them and retry with an id prefix.
 */
export class AmbiguousMatchError extends Error {
    constructor(public matches: Array<{ id: string; name: string; issuer?: string }>) {
        super(
            'Multiple accounts match — retry with an id prefix:\n' +
            matches.map((m) => `  ${m.id.slice(0, 8)}  ${m.issuer ? `${m.issuer}(${m.name})` : m.name}`).join('\n')
        );
        this.name = 'AmbiguousMatchError';
    }
}

export interface MergeResult {
    added: number;
    skipped: number;
    conflicts: string[];
}

export interface VaultInfo {
    location?: string;
    version: number;
    is_encrypted: boolean;
    count?: number;
}

/**
 * Vault format history:
 *  - v1 (implicit — no `version` field): { is_encrypted, accounts } where
 *    encrypted payloads use AES-256-CBC. Written by versions <=1.2.x.
 *  - v2: adds `version: 2`; encrypted payloads use AES-256-GCM; every
 *    account carries `id` (uuid) and `updatedAt` (ISO timestamp).
 */
export const VAULT_VERSION = 2;

/** Tombstones older than this are purged on write (sync GC). */
const TOMBSTONE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/** Deleted accounts stay as tombstones so deletions propagate over sync. */
export const isTombstone = (account: OtpAccount): boolean => !!account.deletedAt;
const activeOnly = (accounts: OtpAccount[]): OtpAccount[] => accounts.filter((a) => !isTombstone(a));

interface VaultFile {
    version?: number; // absent on v1 files
    is_encrypted: boolean;
    accounts: string;
}

export class AccountsStore {
    constructor(
        private storage: StorageAdapter = new NodeStorageAdapter(),
        private crypto: CryptoProvider = new NodeCryptoProvider()
    ) {}

    private async readVaultFile(): Promise<VaultFile | null> {
        const raw = await this.storage.read();
        if (raw == null) return null;
        return JSON.parse(raw);
    }

    /**
     * Decrypt (if needed) and parse a vault's accounts payload, routing v1
     * files through the legacy CBC path. Throws on wrong password or
     * tampered ciphertext.
     */
    private decodeAccounts(vault: VaultFile, password: string): OtpAccount[] {
        let accountsJson: string;
        if (!vault.is_encrypted) {
            accountsJson = vault.accounts;
        } else if ((vault.version ?? 1) < 2) {
            if (!this.crypto.decryptLegacy) {
                throw new Error('This vault predates format v2 and this platform cannot read legacy vaults');
            }
            accountsJson = this.crypto.decryptLegacy(vault.accounts, password);
        } else {
            try {
                accountsJson = this.crypto.decrypt(vault.accounts, password);
            } catch (error) {
                throw new Error('Could not decrypt vault: wrong password, or the vault file is corrupted/tampered');
            }
        }
        return JSON.parse(accountsJson);
    }

    /**
     * Ensure every account has an `id` and `updatedAt` (needed by future
     * sync merge logic). Returns true if anything was added.
     */
    private backfillIdentity(accounts: OtpAccount[]): boolean {
        let changed = false;
        const now = new Date().toISOString();
        for (const account of accounts) {
            if (!account.id) {
                account.id = this.crypto.randomId();
                changed = true;
            }
            if (!account.updatedAt) {
                account.updatedAt = now;
                changed = true;
            }
        }
        return changed;
    }

    private async writeVault(accounts: OtpAccount[], password: string): Promise<void> {
        // GC: drop tombstones old enough that every peer has long since synced
        const cutoff = Date.now() - TOMBSTONE_RETENTION_MS;
        accounts = accounts.filter((a) => !a.deletedAt || Date.parse(String(a.deletedAt)) > cutoff);
        const accountsJson = JSON.stringify(accounts);
        const vault: VaultFile = {
            version: VAULT_VERSION,
            is_encrypted: !!password,
            accounts: password ? this.crypto.encrypt(accountsJson, password) : accountsJson,
        };
        await this.storage.write(JSON.stringify(vault));
    }

    /**
     * To validate accounts backup file exists and is well-formed.
     */
    async isValidBackupFile(): Promise<boolean> {
        try {
            const vault = await this.readVaultFile();
            return typeof vault === 'object' && vault !== null;
        } catch (error) {
            return false;
        }
    }

    /**
     * To validate accounts data are encrypted.
     */
    async isEncrypted(): Promise<boolean> {
        const vault = await this.readVaultFile();
        if (!vault) throw new Error('Accounts backup file does not exist');
        return vault.is_encrypted;
    }

    /**
     * To validate accounts data exist and are valid (decryptable/parseable).
     * Side-effect free: never migrates or writes.
     */
    async isValid(password: string): Promise<boolean | number> {
        try {
            const vault = await this.readVaultFile();
            if (!vault) return false;
            const accounts = this.decodeAccounts(vault, password);
            return Array.isArray(accounts) ? accounts.length : false;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get accounts data. This is the vault's single migration point: a v1
     * file (or one missing account ids) is upgraded to the current format
     * and written back before the accounts are returned. Requires the
     * password because migration re-encrypts.
     */
    async get(password: string): Promise<OtpAccount[]> {
        const vault = await this.readVaultFile();
        if (!vault) throw new Error('Accounts backup file does not exist');
        const accounts = this.decodeAccounts(vault, password);
        const identityAdded = this.backfillIdentity(accounts);
        if (identityAdded || (vault.version ?? 1) < VAULT_VERSION) {
            await this.writeVault(accounts, vault.is_encrypted ? password : '');
        }
        return accounts;
    }

    /**
     * Seed accounts from a Google Authenticator export URI. Always writes
     * the current vault format.
     */
    async seed(uri: string, password: string): Promise<void> {
        const accounts = parseAccountsFromUri(uri);
        this.backfillIdentity(accounts);
        await this.writeVault(accounts, password);
        console.log(`✅ ${accounts.length} account(s) imported successfully`);
    }

    /**
     * Re-encrypt, first-time encrypt, or clear encryption on the vault.
     * `currentPassword` must unlock the existing vault (empty string if plaintext).
     * Pass an empty `newPassword` to store the vault unencrypted on disk.
     * If no vault file exists yet, a non-empty `newPassword` creates an empty
     * encrypted vault (so Lock / Settings work before the first account).
     */
    async setPassword(currentPassword: string, newPassword: string): Promise<void> {
        const exists = await this.isValidBackupFile();
        if (!exists) {
            if (!newPassword) return;
            await this.writeVault([], newPassword);
            return;
        }
        const accounts = await this.get(currentPassword);
        await this.writeVault(accounts, newPassword);
    }

    /**
     * Delete the accounts backup file entirely.
     */
    async flushAll(): Promise<void> {
        await this.storage.delete();
        console.log('all account(s) deleted successfully');
    }

    /**
     * Resolve a matcher (account name, "issuer(name)" display form, or an
     * id prefix) to exactly one account. Throws AmbiguousMatchError when
     * several match, a plain Error when none do.
     */
    private matchOne(accounts: OtpAccount[], matcher: string): OtpAccount {
        const display = (a: OtpAccount) => (a.issuer ? `${a.issuer}(${a.name})` : a.name);
        let matches = activeOnly(accounts).filter(
            (a) => a.name === matcher || display(a) === matcher || (a.id && a.id.startsWith(matcher))
        );
        if (matches.length > 1) {
            // an exact display-form match beats name collisions
            const exact = matches.filter((a) => display(a) === matcher);
            if (exact.length === 1) return exact[0];
            throw new AmbiguousMatchError(
                matches.map((a) => ({ id: a.id as string, name: a.name, issuer: a.issuer }))
            );
        }
        if (matches.length === 0) {
            throw new Error(`No account matches "${matcher}"`);
        }
        return matches[0];
    }

    /** Key used to decide whether two accounts are "the same" for merging. */
    private mergeKey(a: OtpAccount): string {
        return `${a.issuer ?? ''} ${a.name}`;
    }

    /**
     * Add a single account (TOTP/HOTP/Steam). Validates the secret by
     * base32-decoding it and generating a test code with the account's own
     * parameters before anything is written.
     */
    async add(
        input: {
            name: string;
            issuer?: string;
            secret: string;
            type?: string;
            digits?: number;
            period?: number;
            algorithm?: string;
            counter?: number;
        },
        password: string
    ): Promise<OtpAccount> {
        const name = input.name.trim();
        if (!name) throw new Error('Account name is required');
        const totpSecret = input.secret.replace(/\s+/g, '').toUpperCase();

        const account: OtpAccount = {
            id: this.crypto.randomId(),
            updatedAt: new Date().toISOString(),
            name,
            issuer: input.issuer?.trim() || undefined,
            secret: Buffer.from(base32Decode(totpSecret)).toString('base64'),
            totpSecret,
            type: input.type ?? 'OTP_TOTP',
            digits: input.digits,
            period: input.period,
            algorithm: input.algorithm,
            counter: input.counter,
        };

        // validate by generating a test code with the real parameters
        const params = getOtpParams(account);
        if (params.type === 'HOTP') {
            generateHotp(totpSecret, params.counter, { digits: params.digits, algorithm: params.algorithm, crypto: this.crypto });
        } else {
            generateForAccount(account, { crypto: this.crypto });
        }

        const accounts = (await this.storage.exists()) ? await this.get(password) : [];
        accounts.push(account);
        await this.writeVault(accounts, password);
        return account;
    }

    /**
     * Remove a single account by name / issuer(name) / id prefix. The entry
     * becomes a tombstone (secrets stripped, deletedAt set) rather than
     * vanishing, so the deletion propagates to other devices over sync;
     * tombstones are GC'd on write after the retention window.
     */
    async remove(matcher: string, password: string): Promise<OtpAccount> {
        const accounts = await this.get(password);
        const target = this.matchOne(accounts, matcher);
        const removed = { ...target };
        const now = new Date().toISOString();
        target.deletedAt = now;
        target.updatedAt = now;
        delete (target as Record<string, unknown>).secret;
        delete (target as Record<string, unknown>).totpSecret;
        await this.writeVault(accounts, password);
        return removed;
    }

    /** Rename a single account; bumps updatedAt for future sync merges. */
    async rename(matcher: string, newName: string, password: string): Promise<OtpAccount> {
        const name = newName.trim();
        if (!name) throw new Error('New name is required');
        const accounts = await this.get(password);
        const target = this.matchOne(accounts, matcher);
        target.name = name;
        target.updatedAt = new Date().toISOString();
        await this.writeVault(accounts, password);
        return target;
    }

    /** Active (non-deleted) accounts without secret material — safe to print. */
    async list(password: string): Promise<Array<Omit<OtpAccount, 'secret' | 'totpSecret'>>> {
        const accounts = await this.get(password);
        return activeOnly(accounts).map(({ secret, totpSecret, ...rest }) => rest);
    }

    /** Active accounts with full data — what --run displays. */
    async getActive(password: string): Promise<OtpAccount[]> {
        return activeOnly(await this.get(password));
    }

    /**
     * Merge imported accounts into the vault. Same (issuer, name) with the
     * same secret → skip; with a different secret → conflict (skipped unless
     * force, which overwrites but keeps the existing id).
     */
    async merge(
        imported: OtpAccount[],
        password: string,
        options: { force?: boolean } = {}
    ): Promise<MergeResult> {
        const accounts = (await this.storage.exists()) ? await this.get(password) : [];
        const byKey = new Map(accounts.map((a) => [this.mergeKey(a), a]));
        const result: MergeResult = { added: 0, skipped: 0, conflicts: [] };
        const now = new Date().toISOString();

        for (const candidate of imported) {
            if (isTombstone(candidate)) continue; // imports carry accounts, not deletions
            const existing = byKey.get(this.mergeKey(candidate));
            if (!existing) {
                candidate.id = candidate.id ?? this.crypto.randomId();
                candidate.updatedAt = candidate.updatedAt ?? now;
                accounts.push(candidate);
                byKey.set(this.mergeKey(candidate), candidate);
                result.added++;
            } else if (isTombstone(existing)) {
                // re-importing a deleted account resurrects it
                existing.secret = candidate.secret;
                existing.totpSecret = candidate.totpSecret;
                delete existing.deletedAt;
                existing.updatedAt = now;
                result.added++;
            } else if (existing.totpSecret === candidate.totpSecret) {
                result.skipped++;
            } else if (options.force) {
                existing.secret = candidate.secret;
                existing.totpSecret = candidate.totpSecret;
                existing.updatedAt = now;
                result.added++;
            } else {
                result.conflicts.push(existing.issuer ? `${existing.issuer}(${existing.name})` : existing.name);
            }
        }

        await this.writeVault(accounts, password);
        return result;
    }

    /**
     * Portable encrypted backup: a v2 vault JSON string, always encrypted
     * with a password chosen at export time (independent of the vault's own).
     */
    async exportVault(password: string, exportPassword: string): Promise<string> {
        if (!exportPassword) throw new Error('An export password is required — backups are always encrypted');
        const accounts = await this.get(password);
        return JSON.stringify({
            version: VAULT_VERSION,
            is_encrypted: true,
            accounts: this.crypto.encrypt(JSON.stringify(accounts), exportPassword),
        });
    }

    /** Decode a backup produced by exportVault back into accounts. */
    decodeBackup(raw: string, exportPassword: string): OtpAccount[] {
        let vault: VaultFile;
        try {
            vault = JSON.parse(raw);
        } catch (error) {
            throw new Error('Backup file is not valid JSON');
        }
        if (typeof vault !== 'object' || vault === null || typeof vault.accounts !== 'string') {
            throw new Error('Backup file is not an authenticator-clui backup');
        }
        return this.decodeAccounts(vault, exportPassword);
    }

    /**
     * Generate the current code for one account, handling every OTP type.
     * HOTP increments and persists the counter (that's why this lives on
     * the store, not in totp.ts). Returns the code plus expiry seconds
     * (null for HOTP — counter codes don't expire on a clock).
     */
    async generateCodeFor(
        matcher: string,
        password: string
    ): Promise<{ code: string; account: OtpAccount; expiresIn: number | null }> {
        const accounts = await this.get(password);
        const account = this.matchOne(accounts, matcher);
        const params = getOtpParams(account);

        if (params.type === 'HOTP') {
            const code = generateHotp(account.totpSecret, params.counter, {
                digits: params.digits,
                algorithm: params.algorithm,
                crypto: this.crypto,
            });
            account.counter = params.counter + 1;
            account.updatedAt = new Date().toISOString();
            await this.writeVault(accounts, password);
            return { code, account, expiresIn: null };
        }

        const code = generateForAccount(account, { crypto: this.crypto });
        return { code, account, expiresIn: getTimeout(params.period) };
    }

    /** Detect which app produced a backup file's content. */
    detectImport(raw: string): DetectedImport | null {
        return detectImportFormat(raw);
    }

    /**
     * Parse any recognized backup file (ours or a competitor's) into
     * accounts ready for merge(). Throws with a clear message when a
     * password is required/wrong or the format is unrecognized.
     */
    parseImportFile(raw: string, password?: string): OtpAccount[] {
        const detected = detectImportFormat(raw);
        if (!detected) {
            throw new Error('Unrecognized backup file — expected authenticator-clui, Aegis, 2FAS, or andOTP format');
        }
        switch (detected.format) {
            case 'aegis':
                return parseAegis(raw, this.crypto, password);
            case '2fas':
                return parse2fas(raw, this.crypto, password);
            case 'andotp':
                return parseAndOtp(raw);
            case 'authenticator-clui-backup':
                if (!password) throw new Error('This backup is encrypted — a password is required');
                return this.decodeBackup(raw, password);
        }
    }

    /** Vault metadata for --info; count included only when decryptable. */
    async info(password?: string): Promise<VaultInfo | null> {
        const vault = await this.readVaultFile();
        if (!vault) return null;
        const info: VaultInfo = {
            location: this.storage.location?.(),
            version: vault.version ?? 1,
            is_encrypted: vault.is_encrypted,
        };
        if (!vault.is_encrypted || password !== undefined) {
            try {
                info.count = activeOnly(this.decodeAccounts(vault, password ?? '')).length;
            } catch (error) {
                // wrong password — leave count undefined
            }
        }
        return info;
    }

    /**
     * Persist the outcome of a sync merge. Accounts arrive fully formed
     * (ids, timestamps, tombstones) from syncMerge — no backfill wanted.
     */
    async applySyncedAccounts(accounts: OtpAccount[], password: string): Promise<void> {
        await this.writeVault(accounts, password);
    }
}

export const accounts = new AccountsStore();
