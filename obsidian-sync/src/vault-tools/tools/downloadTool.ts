import { basename, extname } from 'node:path';

import { CommandError, invalidArguments } from 'senaev-utils/src/commands/CommandError';
import { createCommandAdapter } from 'senaev-utils/src/toolServer/createCommandAdapter';
import { readToolArguments, requiredNonEmptyString } from 'senaev-utils/src/toolServer/toolArguments';
import { createCommandExecution, type CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { parseVaultFileResourceUri, vaultFileResourceUri } from 'senaev-utils/src/obsidianVaultTools/vaultFileResource';

import {
    MAX_FILE_BYTES,
} from '../access/vaultFiles';
import { readDownloadFile } from '../access/readDownloadBytes';
import { normalizeVaultPath } from '../access/vaultAccess';
import { readVaultToolArguments } from '../toolArguments';
import type { VaultToolsConfig } from '../vaultToolsConfig';

export const DOWNLOAD_CHUNK_BYTES = 12 * 1024;

const MIME_TYPES: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.csv': 'text/csv',
    '.tsv': 'text/tab-separated-values',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.zip': 'application/zip',
};

function parse(input: unknown) {
    const args = readVaultToolArguments(input, 'download');

    return { path: normalizeVaultPath(requiredNonEmptyString(args, 'path'), 'path') };
}

/** Prepare a versioned resource link without storing binary data in managed operation results. */
async function download(config: VaultToolsConfig, { path }: ReturnType<typeof parse>, execution: CommandExecution) {
    const { size, hash } = await readDownloadFile(config, path, execution, {
        offset: 0,
        length: 0,
    });

    execution.throwIfAborted();

    return {
        path,
        name: basename(path),
        mimeType: MIME_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream',
        size,
        hash,
        chunkSize: DOWNLOAD_CHUNK_BYTES,
        chunkCount: Math.max(1, Math.ceil(size / DOWNLOAD_CHUNK_BYTES)),
        resource: {
            type: 'resource_link',
            uri: vaultFileResourceUri(path, hash),
            name: basename(path),
            mimeType: MIME_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream',
            size,
        },
    };
}

export const downloadTool = createCommandAdapter(parse, download);

/** Read the selected version through the authenticated resource transport, with a bounded allocation. */
export async function readVaultFileResource(config: VaultToolsConfig, input: unknown, execution = createCommandExecution()) {
    const args = readToolArguments(input, ['uri']);
    const uri = requiredNonEmptyString(args, 'uri');
    const { path: rawPath, hash } = parseVaultFileResourceUri(uri);
    const path = normalizeVaultPath(rawPath, 'path');
    const { bytes, hash: currentHash } = await readDownloadFile(config, path, execution);

    assertDownloadHash(currentHash, hash);
    execution.throwIfAborted();

    return {
        contents: [
            {
                uri,
                mimeType: MIME_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream',
                blob: bytes.toString('base64'),
            },
        ],
    };
}

function assertDownloadHash(currentHash: string, expectedHash: string): void {
    if (currentHash !== expectedHash) {
        throw new CommandError('conflict', 'File changed; restart from download metadata', {
            currentHash,
            reason: 'version_changed',
            retryable: false,
        });
    }
}

function parseChunk(input: unknown) {
    const args = readVaultToolArguments(input, 'download_chunk');
    const path = normalizeVaultPath(requiredNonEmptyString(args, 'path'), 'path');
    const expectedHash = requiredNonEmptyString(args, 'expectedHash');
    const { chunkIndex } = args;

    if (!/^[a-f0-9]{64}$/.test(expectedHash)) {
        throw invalidArguments('expectedHash must be a lowercase SHA-256 hex digest');
    }

    if (typeof chunkIndex !== 'number' || !Number.isSafeInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= Math.ceil(MAX_FILE_BYTES / DOWNLOAD_CHUNK_BYTES)) {
        throw invalidArguments('chunkIndex must be a zero-based integer within the maximum file size');
    }

    return {
        path,
        expectedHash,
        chunkIndex,
    };
}

export const downloadChunkTool = createCommandAdapter(parseChunk, async (config: VaultToolsConfig, {
    path, expectedHash, chunkIndex,
}, execution) => {
    const offset = chunkIndex * DOWNLOAD_CHUNK_BYTES;
    const {
        bytes, size, hash,
    } = await readDownloadFile(config, path, execution, {
        offset,
        length: DOWNLOAD_CHUNK_BYTES,
    });

    assertDownloadHash(hash, expectedHash);
    const chunkCount = Math.max(1, Math.ceil(size / DOWNLOAD_CHUNK_BYTES));

    if (chunkIndex >= chunkCount) {
        throw invalidArguments('chunkIndex is outside this file');
    }

    execution.throwIfAborted();

    return {
        path,
        hash,
        size,
        chunkSize: DOWNLOAD_CHUNK_BYTES,
        chunkCount,
        chunkIndex,
        offset,
        byteCount: bytes.length,
        isLast: chunkIndex === chunkCount - 1,
        encoding: 'base64',
        data: bytes.toString('base64'),
    };
});
