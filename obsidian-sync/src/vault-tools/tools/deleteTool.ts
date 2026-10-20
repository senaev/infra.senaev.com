import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { createCommandAdapter } from 'senaev-utils/src/toolServer/createCommandAdapter';
import { readExpectedHash } from 'senaev-utils/src/toolServer/expectedHashArguments';
import { requiredNonEmptyString } from 'senaev-utils/src/toolServer/toolArguments';
import { prepareNewFilePath } from 'senaev-utils/src/files/rootRelativePath';
import { createFileExclusively } from 'senaev-utils/src/utils/fs/atomicFileWrite/atomicFileWrite';
import { withFileMutations } from 'senaev-utils/src/files/withFileMutation';
import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';

import {
    assertByteHash, readFileBytes, resolveExistingFile,
} from '../access/vaultFiles';
import { normalizeVaultPath } from '../access/vaultAccess';
import { readVaultNotes } from '../access/readVaultNotes';
import { extractLinks } from '../markdown/extractLinks';
import { createLinkIndex, resolveLink } from '../markdown/resolveLink';
import { readVaultToolArguments } from '../toolArguments';
import type { VaultToolsConfig } from '../vaultToolsConfig';

function parse(input: unknown) {
    const args = readVaultToolArguments(input, 'delete');

    return {
        path: normalizeVaultPath(requiredNonEmptyString(args, 'path'), 'path'),
        expectedHash: readExpectedHash(args, 'expectedHash'),
    };
}

async function trash(config: VaultToolsConfig, input: ReturnType<typeof parse>, execution: CommandExecution) {
    const trashPath = `.trash/mcp/${randomUUID()}/${input.path}`;

    return await withFileMutations([
        join(config.root, input.path),
        join(config.root, trashPath),
    ], async () => {
        const source = await resolveExistingFile(config, input.path, execution);
        const data = await readFileBytes(source, execution);

        assertByteHash(data, input.expectedHash);
        const notes = await readVaultNotes(config, execution);
        const index = createLinkIndex(notes.files, notes.aliasesByNote);
        const backlinks: { path: string; line: number }[] = [];

        for (const [
            path,
            text,
        ] of notes.contents) {
            await execution.checkpoint();
            for (const link of extractLinks(text)) {
                const target = resolveLink(index, path, link);

                if (target.status === 'resolved' && target.path === input.path && path !== input.path) {
                    backlinks.push({
                        path,
                        line: link.line,
                    });
                }
            }
        }

        const target = await prepareNewFilePath(config.root, trashPath, execution);

        await createFileExclusively(target, data, execution.signal, () => execution.changedPath(trashPath));
        await execution.checkpoint();
        assertByteHash(await readFileBytes(source, execution), input.expectedHash);
        await unlink(source);
        execution.changedPath(input.path);

        return {
            path: input.path,
            trashPath,
            hash: input.expectedHash,
            size: data.length,
            backlinkCount: backlinks.length,
            backlinks: backlinks.slice(0, 50),
            ...notes.scan,
        };
    }, execution);
}

export const deleteTool = createCommandAdapter(parse, trash);
