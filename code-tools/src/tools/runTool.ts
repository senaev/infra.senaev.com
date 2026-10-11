import { RUN_LIMITS } from 'senaev-utils/src/codeTools/codeToolLimits';
import { operationContext, throwIfOperationAborted } from 'senaev-utils/src/operations/operationContext';
import { executionTimeout } from 'senaev-utils/src/operations/OperationManager';
import { requiredNonEmptyString } from 'senaev-utils/src/toolServer/toolArguments';

import { runProcess } from '../process/runProcess';

import type { CodeToolsConfig } from './codeToolsConfig';
import { readCodeToolArguments, resolveProject } from './projectAccess';

/**
 * A full bash shell in the project folder: the container is the security boundary, not this
 * tool. A failing command is a normal result with its exit code, not a tool error.
 */
export async function runTool(config: CodeToolsConfig, input: unknown) {
    const args = readCodeToolArguments(input, 'run');

    throwIfOperationAborted();
    const project = await resolveProject(config, args);
    const command = requiredNonEmptyString(args, 'command', RUN_LIMITS.maxCommandLength);
    const timeoutSeconds = executionTimeout(args.timeoutSeconds);

    throwIfOperationAborted();
    const context = operationContext();

    // Not a login shell (-l): Debian's /etc/profile would replace the container's PATH.
    const result = await runProcess('bash', [
        '-c',
        command,
    ], {
        cwd: project.root,
        ...context === undefined
            ? { timeoutMs: timeoutSeconds * 1000 }
            : {
                signal: context.signal,
                onOutput: context.log,
            },
        maxOutputChars: RUN_LIMITS.maxOutputChars,
        env: config.commandEnv,
    });

    throwIfOperationAborted();

    return {
        project: project.name,
        exitCode: result.exitCode,
        signal: result.signal,
        timedOut: result.timedOut,
        durationMs: result.durationMs,
        stdout: result.stdout,
        stderr: result.stderr,
        outputTruncated: result.outputTruncated,
    };
}
