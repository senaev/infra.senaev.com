import { join } from 'node:path';

import { CommandError } from 'senaev-utils/src/commands/CommandError';
import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { withFileMutation } from 'senaev-utils/src/files/withFileMutation';
import { createFileDiffAsync } from 'senaev-utils/src/files/createFileDiffAsync';
import { createFileExclusively, replaceFileAtomically } from 'senaev-utils/src/utils/fs/atomicFileWrite/atomicFileWrite';
import { isAlreadyExistsError } from 'senaev-utils/src/utils/Error/isAlreadyExistsError/isAlreadyExistsError';

import {
    prepareNewVaultFile, resolveExistingFile, hashBytes,
} from '../access/vaultFiles';
import { readDownloadFile } from '../access/readDownloadBytes';
import type { VaultToolsConfig } from '../vaultToolsConfig';

import { readCsvParams } from './readCsvParams';

export type CsvPublication = { path: string; expectedHash: string | null; original: string; csv: string; paramsHash?: string | null };

/** Process-local reservation plus a fresh hash check before atomic publication. */
export function publishCsv(config: VaultToolsConfig, input: CsvPublication, execution: CommandExecution) {
    return withFileMutation(join(config.root, input.path), async () => {
        const target = input.expectedHash === null
            ? await prepareNewVaultFile(config, input.path, execution)
            : await resolveExistingFile(config, input.path, execution);
        const changed = input.expectedHash === null || input.csv !== input.original;
        const diff = await createFileDiffAsync(input.path, input.original, input.csv, execution);

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

        if (input.paramsHash !== undefined && (await readCsvParams(config, input.path, execution)).hash !== input.paramsHash) {
            throw new CommandError('conflict', 'CSV params changed; retry with the current settings');
        }

        execution.throwIfAborted();
        if (changed) {
            const published = () => execution.changedPath(input.path);

            try {
                if (input.expectedHash === null) {
                    await createFileExclusively(target, input.csv, execution.signal, published);
                } else {
                    await replaceFileAtomically(target, input.csv, execution.signal, published);
                }
            } catch (error) {
                if (isAlreadyExistsError(error)) {
                    throw new CommandError('conflict', 'CSV already exists; read its current hash before editing');
                }

                throw error;
            }
        }

        return {
            changed,
            hash: hashBytes(Buffer.from(input.csv)),
            size: Buffer.byteLength(input.csv),
            ...diff,
        };
    }, execution);
}
