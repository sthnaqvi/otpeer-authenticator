import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { NodeStorageAdapter } from './node-storage-adapter';

let tmpDir: string;

beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auth-clui-test-'));
});

afterEach(async () => {
    await fs.remove(tmpDir);
});

describe('NodeStorageAdapter', () => {
    test('read returns null when no vault exists', async () => {
        const adapter = new NodeStorageAdapter({ filePath: path.join(tmpDir, 'vault.json') });
        expect(await adapter.read()).toBeNull();
        expect(await adapter.exists()).toBe(false);
    });

    test('write/read/delete round-trip, creating parent dirs', async () => {
        const filePath = path.join(tmpDir, 'nested', 'dir', 'vault.json');
        const adapter = new NodeStorageAdapter({ filePath });
        await adapter.write('{"hello":1}');
        expect(await adapter.read()).toBe('{"hello":1}');
        expect(await adapter.exists()).toBe(true);
        await adapter.delete();
        expect(await adapter.exists()).toBe(false);
    });

    test('migrates a surviving legacy vault to the new path on first read', async () => {
        const legacyPath = path.join(tmpDir, 'old-install', 'local_data', 'accounts.txt');
        const newPath = path.join(tmpDir, 'home', '.authenticator-clui', 'accounts.json');
        await fs.outputFile(legacyPath, '{"is_encrypted":false,"accounts":"[]"}');

        const adapter = new NodeStorageAdapter({ filePath: newPath, legacyFilePaths: [legacyPath] });
        expect(await adapter.read()).toBe('{"is_encrypted":false,"accounts":"[]"}');
        expect(await fs.pathExists(newPath)).toBe(true);
        expect(await fs.pathExists(legacyPath)).toBe(false); // moved, not copied
    });

    test('first legacy path wins when several exist', async () => {
        const first = path.join(tmpDir, 'a', 'accounts.txt');
        const second = path.join(tmpDir, 'b', 'accounts.txt');
        const newPath = path.join(tmpDir, 'new', 'accounts.json');
        await fs.outputFile(first, 'FIRST');
        await fs.outputFile(second, 'SECOND');

        const adapter = new NodeStorageAdapter({ filePath: newPath, legacyFilePaths: [first, second] });
        expect(await adapter.read()).toBe('FIRST');
        expect(await fs.pathExists(second)).toBe(true); // untouched
    });

    test('existing new-path vault is never clobbered by a legacy one', async () => {
        const legacyPath = path.join(tmpDir, 'old', 'accounts.txt');
        const newPath = path.join(tmpDir, 'new', 'accounts.json');
        await fs.outputFile(legacyPath, 'OLD');
        await fs.outputFile(newPath, 'CURRENT');

        const adapter = new NodeStorageAdapter({ filePath: newPath, legacyFilePaths: [legacyPath] });
        expect(await adapter.read()).toBe('CURRENT');
        expect(await fs.pathExists(legacyPath)).toBe(true);
    });

    test('missing legacy paths are skipped harmlessly', async () => {
        const adapter = new NodeStorageAdapter({
            filePath: path.join(tmpDir, 'vault.json'),
            legacyFilePaths: ['/nonexistent/nowhere/accounts.txt'],
        });
        expect(await adapter.read()).toBeNull();
        await adapter.write('data');
        expect(await adapter.read()).toBe('data');
    });
});
