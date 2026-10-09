import {
    mkdir, mkdtemp, rm, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { createVaultToolsConfig, type VaultToolsConfig } from './vaultToolsConfig';

export type TestVault = {
    config: VaultToolsConfig;
    /** The absolute path of a file in the test vault. */
    path: (relativePath: string) => string;
    remove: () => Promise<void>;
};

/** A real vault folder on disk with the given files, for tests only. */
export async function createTestVault(files: Record<string, string>): Promise<TestVault> {
    const root = await mkdtemp(join(tmpdir(), 'vault-tools-test-'));

    for (const [
        relativePath,
        content,
    ] of Object.entries(files)) {
        await mkdir(dirname(join(root, relativePath)), { recursive: true });
        await writeFile(join(root, relativePath), content, 'utf8');
    }

    return {
        config: createVaultToolsConfig(root),
        path: (relativePath) => join(root, relativePath),
        remove: () => rm(root, {
            recursive: true,
            force: true,
        }),
    };
}
