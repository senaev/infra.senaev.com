import { constants } from 'node:fs';
import {
    open, realpath, stat,
} from 'node:fs/promises';
import {
    basename, dirname, join,
} from 'node:path';

import { CommandError } from 'senaev-utils/src/commands/CommandError';
import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { withFileMutation } from 'senaev-utils/src/files/withFileMutation';
import { createFileDiffAsync } from 'senaev-utils/src/files/createFileDiffAsync';
import { runSecureFilesystem } from 'senaev-utils/src/files/secureFilesystem/runSecureFilesystem';

import {
    prepareNewVaultFile, resolveExistingFile, hashBytes,
} from '../access/vaultFiles';
import { readDownloadFile } from '../access/readDownloadBytes';
import type { VaultToolsConfig } from '../vaultToolsConfig';

export type CsvPublication = { path: string; expectedHash: string | null; original: string; csv: string };

/**
 * Process-local reservation plus a fresh hash check. The folder opened at the start must
 * still be the real folder at the expected path (same device and inode, no symlink on the
 * way) right before the write. Publication itself uses openat/linkat/renameat relative
 * to that inherited descriptor, so a later parent swap cannot redirect it.
 */
export function publishCsv(config: VaultToolsConfig, input: CsvPublication, execution: CommandExecution) {
    return withFileMutation(join(config.root, input.path), async () => {
        const absolute = input.expectedHash === null
            ? await prepareNewVaultFile(config, input.path, execution)
            : await resolveExistingFile(config, input.path, execution);
        const handle = await open(dirname(absolute), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);

        try {
            const expected = join(await realpath(config.root), dirname(input.path));
            const opened = await handle.stat({ bigint: true });
            const verify = async () => {
                const currentReal = await realpath(expected).catch(() => null);
                const current = currentReal === expected ? await stat(expected, { bigint: true }).catch(() => null) : null;

                if (current === null || current.dev !== opened.dev || current.ino !== opened.ino) {
                    throw new CommandError('forbidden_path', 'CSV directory changed during publication');
                }
            };

            await verify();
            const changed = input.expectedHash === null || input.csv !== input.original;
            const diff = await createFileDiffAsync(input.path, input.original, input.csv, execution);

            await verify();
            if (input.expectedHash !== null) {
                const fresh = await readDownloadFile(config, input.path, execution, {
                    offset: 0,
                    length: 0,
                    maxBytes: 4194304,
                });

                if (fresh.hash !== input.expectedHash) {
                    throw new CommandError('conflict', 'CSV changed; read it again before retrying', {
                        currentHash: fresh.hash,
                        hash: fresh.hash,
                    });
                }
            }

            execution.throwIfAborted();
            if (changed) {
                await verify();
                await runSecureFilesystem({
                    operation: 'publish',
                    root: config.root,
                    parent: dirname(input.path),
                    name: basename(input.path),
                    content: input.csv,
                    exclusive: input.expectedHash === null,
                }, execution, handle.fd);
                execution.changedPath(input.path);
            }

            return {
                changed,
                hash: hashBytes(Buffer.from(input.csv)),
                size: Buffer.byteLength(input.csv),
                ...diff,
            };
        } finally {
            await handle.close();
        }
    }, execution);
}
