import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { StorageAdapter } from '../adapters/storage';

export interface NodeStorageOptions {
    /** Where the vault lives. Defaults to ~/.authenticator-clui/accounts.json */
    filePath?: string;
    /**
     * Older locations to check (in order) when the vault is missing from
     * filePath. The first one found is moved to filePath with a one-time
     * notice. Versions <=1.1.1 stored the vault inside the installed npm
     * package directory, which npm deletes on every upgrade — the CLI passes
     * that legacy path here so a surviving vault is rescued on first run.
     */
    legacyFilePaths?: string[];
}

const DEFAULT_FILE_PATH = path.join(os.homedir(), '.authenticator-clui', 'accounts.json');

export class NodeStorageAdapter implements StorageAdapter {
    private filePath: string;
    private legacyFilePaths: string[];
    private migrationChecked = false;

    constructor(options: NodeStorageOptions = {}) {
        this.filePath = options.filePath ?? DEFAULT_FILE_PATH;
        this.legacyFilePaths = options.legacyFilePaths ?? [];
    }

    private async migrateLegacyIfNeeded(): Promise<void> {
        if (this.migrationChecked) return;
        this.migrationChecked = true;
        if (await fs.pathExists(this.filePath)) return;
        for (const legacyPath of this.legacyFilePaths) {
            if (await fs.pathExists(legacyPath)) {
                await fs.ensureDir(path.dirname(this.filePath));
                await fs.copy(legacyPath, this.filePath);
                await fs.remove(legacyPath).catch(() => undefined);
                console.log(`ℹ️  Migrated existing accounts to ${this.filePath}`);
                return;
            }
        }
    }

    async read(): Promise<string | null> {
        await this.migrateLegacyIfNeeded();
        try {
            return await fs.readFile(this.filePath, 'utf-8');
        } catch (error) {
            return null;
        }
    }

    async write(data: string): Promise<void> {
        await this.migrateLegacyIfNeeded();
        await fs.ensureDir(path.dirname(this.filePath));
        await fs.writeFile(this.filePath, data);
    }

    async delete(): Promise<void> {
        await fs.unlink(this.filePath);
    }

    async exists(): Promise<boolean> {
        await this.migrateLegacyIfNeeded();
        return fs.pathExists(this.filePath);
    }
}
