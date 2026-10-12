import { READ_LIMITS } from 'senaev-utils/src/codeTools/codeToolLimits';
import { createCommandAdapter } from 'senaev-utils/src/toolServer/createCommandAdapter';
import {
    optionalInteger, optionalStringArray, requiredNonEmptyString,
} from 'senaev-utils/src/toolServer/toolArguments';
import { invalidArguments } from 'senaev-utils/src/commands/CommandError';

import { readCodeToolArguments } from './toolArguments';
import { type ReadCommandInput, readCommand } from './readCommand';

function parseReadInput(input: unknown): ReadCommandInput {
    const args = readCodeToolArguments(input, 'read');
    const paths = optionalStringArray(args, 'paths', { maxItems: READ_LIMITS.maxPaths });

    if (paths === undefined) {
        throw invalidArguments('"paths" is required');
    }

    const startLine = optionalInteger(args, 'startLine', {
        min: 1,
        max: Number.MAX_SAFE_INTEGER,
    });
    const lineCount = optionalInteger(args, 'lineCount', {
        min: 1,
        max: Number.MAX_SAFE_INTEGER,
    });

    if ((startLine !== undefined || lineCount !== undefined) && paths.length > 1) {
        throw invalidArguments('"startLine" and "lineCount" work only with exactly one path');
    }

    return {
        project: requiredNonEmptyString(args, 'project'),
        paths,
        startLine: startLine ?? 1,
        lineCount: lineCount ?? Number.MAX_SAFE_INTEGER,
    };
}

export const readTool = createCommandAdapter(parseReadInput, readCommand);
