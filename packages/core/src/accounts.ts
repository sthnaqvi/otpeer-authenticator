import { StorageAdapter } from './adapters/storage';
import { CryptoProvider } from './adapters/crypto-provider';
import { NodeStorageAdapter } from './node/node-storage-adapter';
import { NodeCryptoProvider } from './node/node-crypto-provider';
import { parseAccountsFromUri, OtpAccount } from './importers/google-auth';

interface VaultFile {
    is_encrypted: boolean;
    accounts: string;
}

/**
 * Vault load/save, orchestrating storage + encryption without knowing which
 * concrete implementation of either it's talking to. bin.js (or any future
 * UI) constructs one of these with the adapters appropriate to its platform;
 * the default export below wires up the Node implementations so existing
 * call sites keep working unchanged.
 */
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
     * To validate accounts data exist and are valid (i.e. decryptable/parseable).
     */
    async isValid(password: string): Promise<boolean | number> {
        try {
            const vault = await this.readVaultFile();
            if (!vault) return false;
            let accountsJson = vault.is_encrypted ? this.crypto.decrypt(vault.accounts, password) : vault.accounts;
            const accounts = JSON.parse(accountsJson);
            return Array.isArray(accounts) ? accounts.length : false;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get accounts data.
     */
    async get(password: string): Promise<OtpAccount[]> {
        const vault = await this.readVaultFile();
        if (!vault) throw new Error('Accounts backup file does not exist');
        const accountsJson = vault.is_encrypted ? this.crypto.decrypt(vault.accounts, password) : vault.accounts;
        return JSON.parse(accountsJson);
    }

    /**
     * Seed accounts from a Google Authenticator export URI.
     */
    async seed(uri: string, password: string): Promise<void> {
        const accounts = parseAccountsFromUri(uri);
        const accountLength = accounts.length;
        const accountsJson = JSON.stringify(accounts);
        const vault: VaultFile = {
            is_encrypted: !!password,
            accounts: password ? this.crypto.encrypt(accountsJson, password) : accountsJson,
        };
        await this.storage.write(JSON.stringify(vault));
        console.log(`✅ ${accountLength} account(s) imported successfully`);
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
