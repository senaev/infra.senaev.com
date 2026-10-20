import {
    link, lstat, open, rm,
} from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';

import { createCommandAdapter } from 'senaev-utils/src/toolServer/createCommandAdapter';
import {
    optionalString, readToolArguments, requiredNonEmptyString,
} from 'senaev-utils/src/toolServer/toolArguments';
import { CommandError, invalidArguments } from 'senaev-utils/src/commands/CommandError';
import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { withFileMutation } from 'senaev-utils/src/files/withFileMutation';
import { isNotFoundError } from 'senaev-utils/src/utils/Error/isNotFoundError/isNotFoundError';
import { isAlreadyExistsError } from 'senaev-utils/src/utils/Error/isAlreadyExistsError/isAlreadyExistsError';

import { MAX_FILE_BYTES, prepareNewVaultFile } from '../access/vaultFiles';
import { normalizeVaultPath } from '../access/vaultAccess';
import { readVaultToolArguments } from '../toolArguments';
import type { VaultToolsConfig } from '../vaultToolsConfig';

/** Only OpenAI-controlled domains; cloud account name prefixes do not prove ownership. */
export function validateDownloadUrl(input: string): URL {
    let url: URL;

    try {
        url = new URL(input);
    } catch {
        throw invalidArguments('Invalid file download URL');
    }

    const host = url.hostname.toLowerCase();
    const allowed = host === 'oaiusercontent.com' || host.endsWith('.oaiusercontent.com');

    if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || (url.port !== '' && url.port !== '443') || !allowed) {
        throw invalidArguments('File download URL must use HTTPS on an approved OpenAI file storage host');
    }

    return url;
}

function parse(input: unknown) {
    const args = readVaultToolArguments(input, 'upload');
    const file = readToolArguments(args.file, [
        'download_url',
        'file_id',
        'mime_type',
        'file_name',
    ]);
    const downloadUrl = requiredNonEmptyString(file, 'download_url', 16384);

    validateDownloadUrl(downloadUrl);

    return {
        path: normalizeVaultPath(requiredNonEmptyString(args, 'path'), 'path'),
        fileId: requiredNonEmptyString(file, 'file_id', 512),
        downloadUrl,
        mimeType: optionalString(file, 'mime_type', 256),
        fileName: optionalString(file, 'file_name', 1024),
    };
}

type Input = ReturnType<typeof parse>;

/** Downloads to an exclusive temporary file; redirects must pass the same origin policy. */
export async function downloadFile(input: string, target: string, execution: CommandExecution): Promise<{ size: number; hash: string }> {
    const signal = AbortSignal.any([
        execution.signal,
        AbortSignal.timeout(60000),
    ]);
    let url = validateDownloadUrl(input);
    const handle = await open(target, 'wx');
    const digest = createHash('sha256');
    let size = 0;

    try {
        for (let redirects = 0; redirects <= 3; redirects += 1) {
            const response = await fetch(url, {
                redirect: 'manual',
                signal,
            });

            if ([
                301,
                302,
                303,
                307,
                308,
            ].includes(response.status)) {
                const location = response.headers.get('location');

                await response.body?.cancel();
                if (location === null || redirects === 3) {
                    throw new CommandError('download_failed', 'File download redirect limit reached');
                }

                url = validateDownloadUrl(new URL(location, url).href);
                continue;
            }

            if (!response.ok || response.body === null) {
                await response.body?.cancel();
                throw new CommandError('download_failed', 'File download failed; its temporary URL may have expired');
            }

            const length = response.headers.get('content-length');

            if (length !== null && Number(length) > MAX_FILE_BYTES) {
                await response.body.cancel();
                throw new CommandError('file_too_large', 'Uploads are limited to 25 MiB');
            }

            try {
                for await (const part of response.body) {
                    await execution.checkpoint();
                    size += part.byteLength;
                    if (size > MAX_FILE_BYTES) {
                        throw new CommandError('file_too_large', 'Uploads are limited to 25 MiB');
                    }

                    const chunk = Buffer.from(part);

                    digest.update(chunk);
                    await handle.writeFile(chunk);
                }
            } finally {
                await response.body.cancel().catch(() => {});
            }

            return {
                size,
                hash: digest.digest('hex'),
            };
        }

        throw new CommandError('download_failed', 'File download failed');
    } catch (error) {
        execution.throwIfAborted();
        if (error instanceof CommandError) {
            throw error;
        }

        // Never retain signed URLs from fetch errors or their causes in operation results/logs.
        throw new CommandError('download_failed', 'File download failed or timed out; request a fresh file reference');
    } finally {
        await handle.close();
    }
}

async function upload(config: VaultToolsConfig, input: Input, execution: CommandExecution) {
    const absolute = await prepareNewVaultFile(config, input.path, execution);

    return withFileMutation(absolute, async () => {
        const existing = await lstat(absolute).catch((error: unknown) => {
            if (isNotFoundError(error)) {
                return null;
            }

            throw error;
        });

        if (existing !== null) {
            throw new CommandError('already_exists', 'Destination exists; upload to a different path');
        }

        const temporary = join(dirname(absolute), `.upload-${randomUUID()}.tmp`);

        try {
            const result = await downloadFile(input.downloadUrl, temporary, execution);

            execution.throwIfAborted();
            await link(temporary, absolute);
            execution.changedPath(input.path);

            return {
                path: input.path,
                ...result,
            };
        } catch (error) {
            if (isAlreadyExistsError(error)) {
                throw new CommandError('already_exists', 'Destination exists; upload to a different path');
            }

            throw error;
        } finally {
            await rm(temporary, { force: true });
        }
    }, execution);
}

export const uploadTool = createCommandAdapter(parse, upload);
