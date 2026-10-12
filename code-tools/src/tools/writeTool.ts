import { WRITE_LIMITS } from 'senaev-utils/src/codeTools/codeToolLimits';
import { readExpectedHash } from 'senaev-utils/src/toolServer/contentHash';
import { createCommandAdapter } from 'senaev-utils/src/toolServer/createCommandAdapter';
import { requiredNonEmptyString, requiredString } from 'senaev-utils/src/toolServer/toolArguments';

import { readCodeToolArguments } from './toolArguments';
import { type WriteCommandInput, writeCommand } from './writeCommand';

function parseWriteInput(input: unknown): WriteCommandInput {
    const args = readCodeToolArguments(input, 'write');

    return {
        project: requiredNonEmptyString(args, 'project'),
        path: requiredNonEmptyString(args, 'path'),
        content: requiredString(args, 'content', WRITE_LIMITS.maxContentChars),
        expectedHash: args.expectedHash === undefined || args.expectedHash === null ? undefined : readExpectedHash(args, 'expectedHash'),
    };
}

export const writeTool = createCommandAdapter(parseWriteInput, writeCommand);
