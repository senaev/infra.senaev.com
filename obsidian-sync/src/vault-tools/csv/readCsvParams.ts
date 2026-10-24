import { CommandError, invalidArguments } from 'senaev-utils/src/commands/CommandError';
import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';

import { readDownloadFile } from '../access/readDownloadBytes';
import type { VaultToolsConfig } from '../vaultToolsConfig';

/** Optional, bounded snapshot; use the same path/symlink checks as the CSV itself. */
export async function readCsvParams(config: VaultToolsConfig, csvPath: string, execution: CommandExecution) {
    const source = await readDownloadFile(config, `${csvPath}.params.json`, execution, {
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
