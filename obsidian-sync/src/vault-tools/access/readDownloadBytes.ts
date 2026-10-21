import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { join } from 'node:path';

import { CommandError } from 'senaev-utils/src/commands/CommandError';
import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';

import type { VaultToolsConfig } from '../vaultToolsConfig';

import { MAX_FILE_BYTES, resolveExistingFile } from './vaultFiles';

/**
 * Read from a validated descriptor, not a pathname checked before opening.
 * Linux procfs resolves the actual opened inode, including parent-directory swaps.
 * Fail closed without procfs; deployment containers provide /proc/self/fd.
 */
export async function readDownloadBytes(config: VaultToolsConfig, path: string, execution: CommandExecution): Promise<Buffer> {
    const absolute = await resolveExistingFile(config, path, execution);
    const expected = join(await realpath(config.root), path);
    const handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch((error: unknown) => {
        if (error instanceof Error && 'code' in error && error.code === 'ELOOP') {
            throw new CommandError('forbidden_path', 'File changed to a symbolic link');
        }

        throw error;
    });

    try {
        const validateDescriptor = async () => {
            let actual: string;

            try {
                actual = await realpath(`/proc/self/fd/${handle.fd}`);
            } catch {
                throw new CommandError('command_failed', 'Secure file downloads require Linux procfs descriptor validation');
            }

            if (actual !== expected) {
                throw new CommandError('forbidden_path', 'Opened file no longer matches its allowed vault path');
            }
        };

        await validateDescriptor();
        const initial = await handle.stat();

        if (!initial.isFile()) {
            throw new CommandError('forbidden_path', 'Downloads require a regular file');
        }

        if (initial.size > MAX_FILE_BYTES) {
            throw new CommandError('file_too_large', 'File exceeds 25 MiB');
        }

        const chunks: Buffer[] = [];
        let size = 0;

        for (;;) {
            await execution.checkpoint();
            const chunk = Buffer.alloc(Math.min(65536, MAX_FILE_BYTES - size + 1));
            const { bytesRead } = await handle.read(chunk);

            if (bytesRead === 0) {
                break;
            }

            size += bytesRead;
            if (size > MAX_FILE_BYTES) {
                throw new CommandError('file_too_large', 'File exceeds 25 MiB');
            }

            chunks.push(chunk.subarray(0, bytesRead));
        }

        await validateDescriptor();
        const final = await handle.stat();

        if (initial.size !== final.size || initial.mtimeMs !== final.mtimeMs || initial.ctimeMs !== final.ctimeMs) {
            throw new CommandError('conflict', 'File changed during download; request a fresh reference');
        }

        execution.throwIfAborted();

        return Buffer.concat(chunks, size);
    } finally {
        await handle.close();
    }
}
