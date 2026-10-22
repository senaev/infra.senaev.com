import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import {
    lstat, open, realpath,
} from 'node:fs/promises';
import { join } from 'node:path';

import { CommandError } from 'senaev-utils/src/commands/CommandError';
import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';

import type { VaultToolsConfig } from '../vaultToolsConfig';

import { MAX_FILE_BYTES, resolveExistingFile } from './vaultFiles';

let activeReads = 0;
const MAX_ACTIVE_READS = 2;

type ByteRange = { offset: number; length: number; maxBytes?: number };

/** Shared process-wide admission for metadata, chunks and legacy resource reads, including parallel tools. */
export async function readDownloadFile(config: VaultToolsConfig, path: string, execution: CommandExecution, range?: ByteRange) {
    execution.throwIfAborted();
    if (activeReads >= MAX_ACTIVE_READS) {
        throw new CommandError('conflict', 'Download capacity is busy; retry shortly', {
            reason: 'download_capacity',
            retryable: true,
        });
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
    const maxBytes = range?.maxBytes ?? MAX_FILE_BYTES;
    const absolute = await resolveExistingFile(config, path, execution);
    const expected = join(await realpath(config.root), path);
    const handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch((error: unknown) => {
        if (error instanceof Error && 'code' in error && error.code === 'ELOOP') {
            throw new CommandError('forbidden_path', 'File changed to a symbolic link');
        }

        throw error;
    });

    try {
        // The opened descriptor must be the very file that the allowed path names now, with
        // no symlink on the way: same device and inode. This also catches a parent folder
        // that was replaced by a symlink while the file was opened.
        const validateDescriptor = async () => {
            const [
                opened,
                current,
            ] = await Promise.all([
                handle.stat({ bigint: true }),
                lstat(expected, { bigint: true }).catch(() => null),
            ]);
            const currentReal = await realpath(expected).catch(() => null);

            if (current === null || currentReal !== expected || opened.dev !== current.dev || opened.ino !== current.ino) {
                throw new CommandError('forbidden_path', 'Opened file no longer matches its allowed vault path');
            }
        };

        await validateDescriptor();
        const initial = await handle.stat({ bigint: true });

        if (!initial.isFile()) {
            throw new CommandError('forbidden_path', 'Downloads require a regular file');
        }

        if (initial.size > BigInt(maxBytes)) {
            throw new CommandError('file_too_large', `File exceeds ${maxBytes} byte read limit`);
        }

        const chunks: Buffer[] = [];
        const digest = createHash('sha256');
        const chunk = Buffer.alloc(65536);
        let size = 0;

        for (;;) {
            await execution.checkpoint();
            const { bytesRead } = await handle.read(chunk, 0, Math.min(chunk.length, maxBytes - size + 1));

            if (bytesRead === 0) {
                break;
            }

            if (size + bytesRead > maxBytes) {
                throw new CommandError('file_too_large', `File exceeds ${maxBytes} byte read limit`);
            }

            digest.update(chunk.subarray(0, bytesRead));
            const from = range === undefined ? 0 : Math.max(0, range.offset - size);
            const to = range === undefined ? bytesRead : Math.min(bytesRead, range.offset + range.length - size);

            if (to > from) {
                chunks.push(Buffer.from(chunk.subarray(from, to)));
            }

            size += bytesRead;
        }

        await validateDescriptor();
        const final = await handle.stat({ bigint: true });

        if (initial.size !== final.size || initial.mtimeNs !== final.mtimeNs || initial.ctimeNs !== final.ctimeNs) {
            throw new CommandError('conflict', 'File changed during download; request fresh metadata', {
                reason: 'version_changed',
                retryable: false,
            });
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
