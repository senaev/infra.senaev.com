import { createHash } from 'node:crypto';
import { open, stat } from 'node:fs/promises';
import { extname } from 'node:path';

import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { CommandError } from 'senaev-utils/src/commands/CommandError';
import { assertNoSymlinkOnPath, prepareNewFilePath } from 'senaev-utils/src/files/rootRelativePath';
import { isNotFoundError } from 'senaev-utils/src/utils/Error/isNotFoundError/isNotFoundError';

import type { VaultToolsConfig } from '../vaultToolsConfig';

import { isVisibleFile, normalizeVaultPath } from './vaultAccess';

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_TEXT_BYTES = 5 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set([
    '.md',
    '.txt',
    '.csv',
    '.tsv',
    '.json',
    '.yaml',
    '.yml',
    '.xml',
    '.html',
    '.css',
    '.js',
    '.ts',
    '.log',
    '.svg',
    '.ini',
    '.toml',
    '.sql',
    '.sh',
    '.mjs',
    '.cjs',
]);

export function assertFilePath(config: VaultToolsConfig, path: string): void {
    if (!isVisibleFile(config, path)) {
        throw new CommandError('forbidden_path', 'File is excluded from the vault tools');
    }
}

export async function resolveExistingFile(config: VaultToolsConfig, input: string, execution: CommandExecution): Promise<string> {
    const path = normalizeVaultPath(input, 'path');

    assertFilePath(config, path);
    try {
        const absolute = await assertNoSymlinkOnPath(config.root, path, execution);

        if (!(await stat(absolute)).isFile()) {
            throw new CommandError('not_found', 'Path is not a regular file');
        }

        return absolute;
    } catch (error) {
        execution.throwIfAborted();
        if (isNotFoundError(error)) {
            throw new CommandError('not_found', 'File does not exist');
        }

        throw error;
    }
}

export function prepareNewVaultFile(config: VaultToolsConfig, path: string, execution: CommandExecution): Promise<string> {
    assertFilePath(config, path);

    return prepareNewFilePath(config.root, path, execution);
}

export function hashBytes(data: Uint8Array): string {
    return createHash('sha256').update(data).digest('hex');
}

export function assertByteHash(data: Uint8Array, expected: string): void {
    const currentHash = hashBytes(data);

    if (currentHash !== expected) {
        throw new CommandError('conflict', 'File changed; read it again before retrying', { currentHash });
    }
}

/** Bounded allocation, also if a file grows after stat. */
export async function readFileBytes(path: string, execution: CommandExecution, maxBytes = MAX_FILE_BYTES): Promise<Buffer> {
    const handle = await open(path, 'r');
    const chunks: Buffer[] = [];
    let size = 0;

    try {
        for (;;) {
            await execution.checkpoint();
            const chunk = Buffer.alloc(Math.min(65536, maxBytes - size + 1));
            const { bytesRead } = await handle.read(chunk);

            if (bytesRead === 0) {
                return Buffer.concat(chunks, size);
            }

            size += bytesRead;
            if (size > maxBytes) {
                throw new CommandError('file_too_large', `File exceeds ${maxBytes} bytes`);
            }

            chunks.push(chunk.subarray(0, bytesRead));
        }
    } finally {
        await handle.close();
    }
}

/** Classify by extension only; preserve BOM, control characters and line endings. */
export function decodeText(path: string, data: Uint8Array): string {
    if (!TEXT_EXTENSIONS.has(extname(path).toLowerCase())) {
        throw new CommandError('binary_file', 'This file type is not supported for text reading or editing');
    }

    if (data.byteLength > MAX_TEXT_BYTES) {
        throw new CommandError('file_too_large', 'Text files are limited to 5 MiB');
    }

    let text: string;

    try {
        text = new TextDecoder('utf-8', {
            fatal: true,
            ignoreBOM: true,
        }).decode(data);
    } catch {
        throw new CommandError('invalid_text_encoding', 'Text file is not valid UTF-8');
    }

    return text;
}
