import { basename, extname } from 'node:path';

import { createCommandAdapter } from 'senaev-utils/src/toolServer/createCommandAdapter';
import { readToolArguments, requiredNonEmptyString } from 'senaev-utils/src/toolServer/toolArguments';
import { createCommandExecution, type CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { parseVaultFileResourceUri, vaultFileResourceUri } from 'senaev-utils/src/obsidianVaultTools/vaultFileResource';

import {
    assertByteHash, hashBytes, readFileBytes, resolveExistingFile,
} from '../access/vaultFiles';
import { normalizeVaultPath } from '../access/vaultAccess';
import { readVaultToolArguments } from '../toolArguments';
import type { VaultToolsConfig } from '../vaultToolsConfig';

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
    const bytes = await readFileBytes(await resolveExistingFile(config, path, execution), execution);
    const hash = hashBytes(bytes);

    execution.throwIfAborted();

    return {
        path,
        size: bytes.length,
        hash,
        resource: {
            type: 'resource_link',
            uri: vaultFileResourceUri(path, hash),
            name: basename(path),
            mimeType: MIME_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream',
            size: bytes.length,
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
    const bytes = await readFileBytes(await resolveExistingFile(config, path, execution), execution);

    assertByteHash(bytes, hash);
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
