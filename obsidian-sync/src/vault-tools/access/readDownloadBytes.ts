import { runSecureFilesystem } from 'senaev-utils/src/files/secureFilesystem/runSecureFilesystem';
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

/** Open every component relative to an already opened parent, never through symlinks. */
async function readOpenedFile(config: VaultToolsConfig, path: string, execution: CommandExecution, range?: ByteRange) {
    const maxBytes = range?.maxBytes ?? MAX_FILE_BYTES;

    // Visibility and ordinary not_found errors stay in the Node adapter. The helper
    // independently opens the whole path without following any symlink, including races.
    await resolveExistingFile(config, path, execution);
    const retained = Math.min(range?.length ?? maxBytes, maxBytes);
    const result = await runSecureFilesystem<{ bytes: string; size: number; hash: string }>({
        operation: 'read',
        root: config.root,
        path,
        maxBytes,
        ...range === undefined
            ? {}
            : {
                offset: range.offset,
                length: range.length,
            },
    }, execution, undefined, Math.ceil(retained / 3) * 4 + 1024);

    execution.throwIfAborted();

    return {
        ...result,
        bytes: Buffer.from(result.bytes, 'base64'),
    };
}
