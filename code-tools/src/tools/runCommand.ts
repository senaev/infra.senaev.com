import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { RUN_LIMITS } from 'senaev-utils/src/codeTools/codeToolLimits';

import { runProcess, type ProcessResult } from '../process/runProcess';

import type { CodeToolsConfig } from './codeToolsConfig';
import { resolveNamedProject } from './projectAccess';

export type RunCommandInput = { project: string; command: string };
export type RunCommandResult = ProcessResult & { project: string };

/** Run a shell command with explicit cancellation and output observers. */
export async function runCommand(config: CodeToolsConfig, input: RunCommandInput, execution: CommandExecution): Promise<RunCommandResult> {
    execution.throwIfAborted();
    const project = await resolveNamedProject(config, input.project, execution);
    const { command } = input;

    execution.throwIfAborted();

    // Not a login shell (-l): Debian's /etc/profile would replace the container's PATH.
    const result = await runProcess('bash', [
        '-c',
        command,
    ], {
        cwd: project.root,
        signal: execution.signal,
        onOutput: execution.log,
        maxOutputChars: RUN_LIMITS.maxOutputChars,
        env: config.commandEnv,
    });

    execution.throwIfAborted();

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
