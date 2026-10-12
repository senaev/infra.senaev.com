import { RUN_LIMITS } from 'senaev-utils/src/codeTools/codeToolLimits';
import { createCommandAdapter } from 'senaev-utils/src/toolServer/createCommandAdapter';
import { requiredNonEmptyString } from 'senaev-utils/src/toolServer/toolArguments';

import { readCodeToolArguments } from './toolArguments';
import { runCommand, type RunCommandInput } from './runCommand';

/** Input adapter; untrusted JSON parsing stays outside the typed business command. */
export const runTool = createCommandAdapter((input: unknown): RunCommandInput => {
    const args = readCodeToolArguments(input, 'run');

    return {
        project: requiredNonEmptyString(args, 'project'),
        command: requiredNonEmptyString(args, 'command', RUN_LIMITS.maxCommandLength),
    };
}, runCommand);
