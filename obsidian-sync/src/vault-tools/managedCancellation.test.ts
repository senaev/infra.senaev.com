import { readFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';

import { OperationManager } from 'senaev-utils/src/operations/OperationManager';
import { currentCommandExecution, withOperationContext } from 'senaev-utils/src/operations/operationContext';
import {
    afterEach, describe, expect, it, vi,
} from 'vitest';

import { readVaultNotes } from './access/readVaultNotes';
import { createTestVault, type TestVault } from './createTestVault';
import { moveTool } from './tools/moveTool';

const hooks = vi.hoisted(() => {
    return {
        afterPublish: undefined as (() => void) | undefined,
        afterRead: undefined as (() => void) | undefined,
    };
});

vi.mock('senaev-utils/src/utils/fs/atomicFileWrite/atomicFileWrite', async (original) => {
    const actual = await original<typeof import('senaev-utils/src/utils/fs/atomicFileWrite/atomicFileWrite')>();

    return {
        ...actual,
        createFileExclusively: async (...args: Parameters<typeof actual.createFileExclusively>) => {
            await actual.createFileExclusively(...args);
            hooks.afterPublish?.();
        },
    };
});

vi.mock('node:fs/promises', async (original) => {
    const actual = await original<typeof import('node:fs/promises')>();

    return {
        ...actual,
        readFile: vi.fn(async (...args: Parameters<typeof actual.readFile>) => {
            const result = await actual.readFile(...args);

            hooks.afterRead?.();

            return result;
        }),
    };
});

let vault: TestVault;

afterEach(async () => {
    hooks.afterPublish = undefined;
    hooks.afterRead = undefined;
    vi.clearAllMocks();
    await vault?.remove();
});

describe('vault cooperative cleanup', { timeout: 30000 }, () => {
    it('stops a real whole-vault read after cancellation without swallowing it as a path error', async () => {
        vault = await createTestVault({
            'A.md': 'one',
            'B.md': 'two',
        });
        const controller = new AbortController();

        hooks.afterRead = () => setImmediate(() => controller.abort(new Error('cancelled')));
        await expect(withOperationContext({
            signal: controller.signal,
            changedPaths: new Set(),
            log: () => {},
        }, () => readVaultNotes(vault.config, currentCommandExecution()))).rejects.toThrow('cancelled');
        expect(readFile).toHaveBeenCalledTimes(1);
    });

    it('preserves a source edited by an external writer after the target was published', async () => {
        vault = await createTestVault({ 'Source.md': 'original' });
        hooks.afterPublish = () => writeFileSync(vault.path('Source.md'), 'external edit');

        await expect(moveTool(vault.config, {
            path: 'Source.md',
            newPath: 'Target.md',
        })).rejects.toMatchObject({ code: 'conflict' });
        expect(await readFile(vault.path('Source.md'), 'utf8')).toBe('external edit');
        expect(await readFile(vault.path('Target.md'), 'utf8')).toBe('original');
    });

    it('preserves a backlink edited externally after target publication and reports the partial move', async () => {
        vault = await createTestVault({
            'Source.md': 'original',
            'Backlink.md': '[[Source]]',
        });
        const changedPaths = new Set<string>();

        hooks.afterPublish = () => writeFileSync(vault.path('Backlink.md'), '[[Source]]\nexternal edit');
        await expect(withOperationContext({
            signal: new AbortController().signal,
            changedPaths,
            log: () => {},
        }, () => moveTool(vault.config, {
            path: 'Source.md',
            newPath: 'Target.md',
        }))).rejects.toMatchObject({ code: 'conflict' });
        expect(await readFile(vault.path('Backlink.md'), 'utf8')).toBe('[[Source]]\nexternal edit');
        expect(await readFile(vault.path('Source.md'), 'utf8')).toBe('original');
        expect(await readFile(vault.path('Target.md'), 'utf8')).toBe('original');
        expect([...changedPaths]).toEqual(['Target.md']);
    });

    it('reports an atomically published move target after cancellation and preserves the source and backlinks', async () => {
        vault = await createTestVault({
            'Source.md': 'original',
            'Backlink.md': '[[Source]]',
        });
        const controller = new AbortController();
        const changedPaths = new Set<string>();

        hooks.afterPublish = () => controller.abort(new Error('cancelled after publication'));
        await expect(withOperationContext({
            signal: controller.signal,
            changedPaths,
            log: () => {},
        }, () => moveTool(vault.config, {
            path: 'Source.md',
            newPath: 'Target.md',
        }))).rejects.toThrow('cancelled after publication');
        expect([...changedPaths]).toEqual(['Target.md']);
        expect(await readFile(vault.path('Source.md'), 'utf8')).toBe('original');
        expect(await readFile(vault.path('Target.md'), 'utf8')).toBe('original');
        expect(await readFile(vault.path('Backlink.md'), 'utf8')).toBe('[[Source]]');
        hooks.afterPublish = undefined;
        const manager = new OperationManager('obsidian');

        try {
            const result = await manager.launch({
                tool: 'move',
                args: {},
                run: () => moveTool(vault.config, {
                    path: 'Source.md',
                    newPath: 'Other.md',
                }),
            });

            expect(result.operation).toMatchObject({ state: 'completed' });
        } finally {
            await manager.close();
        }
    });
});
