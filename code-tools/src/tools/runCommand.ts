import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { RUN_LIMITS } from 'senaev-utils/src/codeTools/codeToolLimits';

import { runProcess, type ProcessResult } from '../process/runProcess';

import type { CodeToolsConfig } from './codeToolsConfig';
import { assertExistingFolder, normalizeAbsolutePath } from './fileAccess';

export type RunCommandInput = { cwd: string; command: string };
export type RunCommandResult = ProcessResult & { cwd: string };

/** Run a shell command with explicit cancellation and output observers. */
export async function runCommand(config: CodeToolsConfig, input: RunCommandInput, execution: CommandExecution): Promise<RunCommandResult> {
    execution.throwIfAborted();
    const cwd = normalizeAbsolutePath(input.cwd, 'cwd');
    const { command } = input;

    await assertExistingFolder(cwd, execution);

    // Not a login shell (-l): Debian's /etc/profile would replace the container's PATH.
    const result = await runProcess('bash', [
        '-c',
        command,
    ], {
        cwd,
        signal: execution.signal,
        onOutput: execution.log,
        maxOutputChars: RUN_LIMITS.maxOutputChars,
        env: config.commandEnv,
    });

    execution.throwIfAborted();

    return {
        cwd,
        exitCode: result.exitCode,
        signal: result.signal,
        timedOut: result.timedOut,
        durationMs: result.durationMs,
        stdout: result.stdout,
        stderr: result.stderr,
        outputTruncated: result.outputTruncated,
    };
}
