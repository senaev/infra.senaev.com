import {
    mkdir, readFile, writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

import { withOperationContext } from 'senaev-utils/src/operations/operationContext';
import {
    afterEach, beforeEach, describe, expect, it,
} from 'vitest';

import { createTestProjects, type TestProjects } from './createTestProjects';
import { projectsTool } from './projectsTool';

describe('projects cancellation', () => {
    let projects: TestProjects;

    beforeEach(async () => {
        projects = await createTestProjects({
            demo: {},
            other: {},
        });
    });

    afterEach(async () => {
        await projects.remove();
    });

    it('rejects before filesystem traversal if already aborted', async () => {
        const controller = new AbortController();

        controller.abort(new Error('cancelled before traversal'));
        await expect(withOperationContext({
            signal: controller.signal,
            changedPaths: new Set(),
            log: () => undefined,
        }, () => projectsTool({
            ...projects.config,
            projectsRoot: '/missing-projects-root',
        }, {})))
            .rejects.toThrow('cancelled before traversal');
    });

    it('propagates abort through git and error handlers, waits for siblings and schedules no next project', async () => {
        const bin = join(projects.config.projectsRoot, 'bin');
        const log = join(projects.config.projectsRoot, 'git-calls');

        await mkdir(bin);
        await writeFile(join(bin, 'git'), [
            '#!/bin/bash',
            'trap "" TERM',
            'echo "$PWD" >> "$GIT_CALL_LOG"',
            'echo ready',
            'sleep 30',
        ].join('\n'), { mode: 0o755 });
        const config = {
            ...projects.config,
            commandEnv: {
                ...projects.config.commandEnv,
                PATH: `${bin}:${process.env.PATH ?? ''}`,
                GIT_CALL_LOG: log,
            },
        };
        const controller = new AbortController();
        const started = performance.now();

        await expect(withOperationContext({
            signal: controller.signal,
            changedPaths: new Set(),
            log: (_stream, text) => {
                if (text.includes('ready')) {
                    controller.abort(new Error('cancelled traversal'));
                }
            },
        }, () => projectsTool(config, {}))).rejects.toThrow('cancelled traversal');
        expect(performance.now() - started).toBeGreaterThanOrEqual(900);
        expect(performance.now() - started).toBeLessThan(4000);
        const calls = (await readFile(log, 'utf8')).trim().split('\n');

        expect(calls.length).toBeGreaterThan(0);
        expect(calls.every((cwd) => cwd === projects.path('demo'))).toBe(true);
    });
});
