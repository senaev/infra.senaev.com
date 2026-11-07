import { dirname, join } from 'node:path/posix';

import { CommandError, invalidArguments } from 'senaev-utils/src/commands/CommandError';
import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';

import { readDownloadFile } from '../access/readDownloadBytes';
import type { VaultToolsConfig } from '../vaultToolsConfig';

/** One optional sorting policy for CSV files directly inside the same folder. */
export async function readCsvParams(config: VaultToolsConfig, csvPath: string, execution: CommandExecution) {
    const source = await readDownloadFile(config, join(dirname(csvPath), 'csv.params.json'), execution, {
        offset: 0,
        length: 16384,
        maxBytes: 16384,
    }).catch((error: unknown) => {
        if (error instanceof CommandError && error.code === 'not_found') {
            return null;
        }

        throw error;
    });

    if (source === null) {
        return {
            text: undefined,
            hash: null,
        };
    }

    try {
        return {
            text: new TextDecoder('utf-8', { fatal: true }).decode(source.bytes),
            hash: source.hash,
        };
    } catch {
        throw invalidArguments('CSV params must be valid UTF-8');
    }
}
