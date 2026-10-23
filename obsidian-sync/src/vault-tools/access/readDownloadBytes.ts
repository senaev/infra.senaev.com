import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';

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

/** Hash the whole file while retaining only the selected bytes (all bytes for legacy resources). */
async function readOpenedFile(config: VaultToolsConfig, path: string, execution: CommandExecution, range?: ByteRange) {
    const maxBytes = range?.maxBytes ?? MAX_FILE_BYTES;
    const absolute = await resolveExistingFile(config, path, execution);
    const handle = await open(absolute, constants.O_RDONLY | constants.O_NONBLOCK);

    try {
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
