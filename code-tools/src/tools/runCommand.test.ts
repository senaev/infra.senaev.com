import {
    mkdir, mkdtemp, readFile, rm, stat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createCommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { withOperationContext } from 'senaev-utils/src/operations/operationContext';
import {
    afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

import { createCodeToolsConfig, type CodeToolsConfig } from './codeToolsConfig';
import { runCommand, type RunCommandResult } from './runCommand';

let root: string;
let config: CodeToolsConfig;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'typed-run-command-'));
    await mkdir(join(root, 'demo'));
    config = createCodeToolsConfig(root);
});

afterEach(async () => {
    await rm(root, {
        recursive: true,
        force: true,
    });
});

describe('standalone typed run command', () => {
    it('returns typed output and exit status without an operation manager', async () => {
        const log = vi.fn();
        const result: RunCommandResult = await runCommand(config, {
            project: 'demo',
            command: 'printf hello; printf problem >&2; exit 7',
        }, createCommandExecution({ log }));

        expect(result).toMatchObject({
            project: 'demo',
            exitCode: 7,
            stdout: 'hello',
            stderr: 'problem',
            timedOut: false,
        });
        expect(log).toHaveBeenCalledWith('stdout', 'hello');
        expect(log).toHaveBeenCalledWith('stderr', 'problem');
    });

    it('uses explicit capabilities even inside an unrelated aborted operation context', async () => {
        const foreign = new AbortController();
        const foreignLog = vi.fn();
        const explicitLog = vi.fn();

        foreign.abort(new Error('foreign cancellation'));
        const result = await withOperationContext({
            signal: foreign.signal,
            log: foreignLog,
            changedPaths: new Set(),
        }, () => runCommand(config, {
            project: 'demo',
            command: 'printf independent',
        }, createCommandExecution({ log: explicitLog })));

        expect(result.stdout).toBe('independent');
        expect(foreignLog).not.toHaveBeenCalled();
        expect(explicitLog).toHaveBeenCalledWith('stdout', 'independent');
    });

    it('rejects pre-aborted execution before starting a shell or publishing its marker', async () => {
        const controller = new AbortController();
        const reason = new Error('cancel before admission');

        controller.abort(reason);
        await expect(runCommand(config, {
            project: 'demo',
            command: 'touch should-not-exist',
        }, createCommandExecution({ signal: controller.signal }))).rejects.toBe(reason);
        await expect(stat(join(root, 'demo/should-not-exist'))).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('waits for cooperative group cleanup when a standalone caller cancels a running shell', async () => {
        const controller = new AbortController();
        const log = vi.fn();
        const reason = new Error('standalone cancellation');
        const execution = runCommand(config, {
            project: 'demo',
            command: 'trap \'wait; exit 0\' TERM; sleep 30 & echo $$ > shell.pid; printf ready; wait',
        }, createCommandExecution({
            signal: controller.signal,
            log,
        }));
        const observed = execution.then((result) => {
            return { result };
        }, (error: unknown) => {
            return { error };
        });

        try {
            await vi.waitFor(() => expect(log).toHaveBeenCalledWith('stdout', 'ready'), { timeout: 10000 });
            const pid = Number((await readFile(join(root, 'demo/shell.pid'), 'utf8')).trim());

            expect(Number.isInteger(pid) && pid > 0).toBe(true);
            controller.abort(reason);
            expect(await observed).toEqual({ error: reason });
            expect(() => process.kill(-pid, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }));
        } finally {
            controller.abort(reason);
            await observed;
        }
    }, 15000);
});
