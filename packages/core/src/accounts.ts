import { StorageAdapter } from './adapters/storage';
import { CryptoProvider } from './adapters/crypto-provider';
import { NodeStorageAdapter } from './node/node-storage-adapter';
import { NodeCryptoProvider } from './node/node-crypto-provider';
import { parseAccountsFromUri, OtpAccount } from './importers/google-auth';

/**
 * Vault format history:
 *  - v1 (implicit — no `version` field): { is_encrypted, accounts } where
 *    encrypted payloads use AES-256-CBC. Written by versions <=1.2.x.
 *  - v2: adds `version: 2`; encrypted payloads use AES-256-GCM; every
 *    account carries `id` (uuid) and `updatedAt` (ISO timestamp).
 */
export const VAULT_VERSION = 2;

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
     * Delete the accounts backup file entirely.
     */
    async flushAll(): Promise<void> {
        await this.storage.delete();
        console.log('all account(s) deleted successfully');
    }
}

export const accounts = new AccountsStore();
