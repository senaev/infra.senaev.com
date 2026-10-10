import { RUN_LIMITS } from 'senaev-utils/src/codeTools/codeToolLimits';
import { optionalInteger, requiredNonEmptyString } from 'senaev-utils/src/toolServer/toolArguments';

import { runProcess } from '../process/runProcess';

import type { CodeToolsConfig } from './codeToolsConfig';
import { readCodeToolArguments, resolveProject } from './projectAccess';

/**
 * A full bash shell in the project folder: the container is the security boundary, not this
 * tool. A failing command is a normal result with its exit code, not a tool error.
 */
export async function runTool(config: CodeToolsConfig, input: unknown) {
    const args = readCodeToolArguments(input, 'run');
    const project = await resolveProject(config, args);
    const command = requiredNonEmptyString(args, 'command', RUN_LIMITS.maxCommandLength);
    const timeoutSeconds = optionalInteger(args, 'timeoutSeconds', {
        min: 1,
        max: RUN_LIMITS.maxTimeoutSeconds,
    }) ?? RUN_LIMITS.defaultTimeoutSeconds;

    // Not a login shell (-l): Debian's /etc/profile would replace the container's PATH.
    const result = await runProcess('bash', [
        '-c',
        command,
    ], {
        cwd: project.root,
        timeoutMs: timeoutSeconds * 1000,
        maxOutputChars: RUN_LIMITS.maxOutputChars,
        env: config.commandEnv,
    });

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
