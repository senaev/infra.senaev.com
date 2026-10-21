import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { join } from 'node:path';

import { CommandError } from 'senaev-utils/src/commands/CommandError';
import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';

import type { VaultToolsConfig } from '../vaultToolsConfig';

import { MAX_FILE_BYTES, resolveExistingFile } from './vaultFiles';

let activeReads = 0;
const MAX_ACTIVE_READS = 2;

type ByteRange = { offset: number; length: number };

/** Shared process-wide admission for metadata, chunks and legacy resource reads, including parallel tools. */
export async function readDownloadFile(config: VaultToolsConfig, path: string, execution: CommandExecution, range?: ByteRange) {
    execution.throwIfAborted();
    if (activeReads >= MAX_ACTIVE_READS) {
        throw new CommandError('conflict', 'Download capacity is busy; retry shortly');
    }

    activeReads++;
    try {
        return await readOpenedFile(config, path, execution, range);
    } finally {
        activeReads--;
    }
}

/** Hash the whole validated descriptor while retaining only the selected bytes (all bytes for legacy resources). */
async function readOpenedFile(config: VaultToolsConfig, path: string, execution: CommandExecution, range?: ByteRange) {
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
        const digest = createHash('sha256');
        let size = 0;

        for (;;) {
            await execution.checkpoint();
            const chunk = Buffer.alloc(Math.min(65536, MAX_FILE_BYTES - size + 1));
            const { bytesRead } = await handle.read(chunk);

            if (bytesRead === 0) {
                break;
            }

            if (size + bytesRead > MAX_FILE_BYTES) {
                throw new CommandError('file_too_large', 'File exceeds 25 MiB');
            }

            digest.update(chunk.subarray(0, bytesRead));
            const from = range === undefined ? 0 : Math.max(0, range.offset - size);
            const to = range === undefined ? bytesRead : Math.min(bytesRead, range.offset + range.length - size);

            if (to > from) {
                chunks.push(chunk.subarray(from, to));
            }

            size += bytesRead;
        }

        await validateDescriptor();
        const final = await handle.stat();

        if (initial.size !== final.size || initial.mtimeMs !== final.mtimeMs || initial.ctimeMs !== final.ctimeMs) {
            throw new CommandError('conflict', 'File changed during download; request fresh metadata');
        }

        execution.throwIfAborted();

        return {
            bytes: Buffer.concat(chunks),
            size,
            hash: digest.digest('hex'),
        };
    } finally {
        await handle.close();
    }
}
