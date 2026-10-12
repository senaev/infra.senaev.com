import { createCommandAdapter } from 'senaev-utils/src/toolServer/createCommandAdapter';
import { READ_LIMITS } from 'senaev-utils/src/obsidianVaultTools/vaultToolLimits';
import {
    optionalInteger, optionalString, optionalStringArray,
} from 'senaev-utils/src/toolServer/toolArguments';
import { invalidArguments } from 'senaev-utils/src/toolServer/ToolError';

import { isDiaryRangeRequested } from '../noteScope';
import { readDiaryRange } from '../noteScopeArguments';
import { readVaultToolArguments } from '../toolArguments';

import { type ReadCommandInput, readCommand } from './readCommand';

function parseReadInput(input: unknown): ReadCommandInput {
    const args = readVaultToolArguments(input, 'read');
    const paths = optionalStringArray(args, 'paths', { maxItems: READ_LIMITS.maxPaths });
    const range = readDiaryRange(args);

    if ((paths === undefined) === !isDiaryRangeRequested(range)) {
        throw invalidArguments('Give either "paths" or a diary range ("diaryFrom"/"diaryTo"), not both and not neither');
    }

    const section = optionalString(args, 'section');
    const startChar = optionalInteger(args, 'startChar', {
        min: 0,
        max: Number.MAX_SAFE_INTEGER,
    }) ?? 0;

    if ((section !== undefined || startChar > 0) && (paths === undefined || paths.length !== 1)) {
        throw invalidArguments('"section" and "startChar" can only be used when reading exactly one path');
    }

    return {
        paths,
        ...range,
        section,
        startChar,
    };
}

export const readTool = createCommandAdapter(parseReadInput, readCommand);
