import {
    mkdir, symlink, writeFile,
} from 'node:fs/promises';

import {
    afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

import { runProcess } from '../process/runProcess';

import { createTestProjects, type TestProjects } from './createTestProjects';
import { searchTool } from './searchTool';

vi.mock('../process/runProcess', () => {
    return { runProcess: vi.fn() };
});

let projects: TestProjects;

beforeEach(async () => {
    projects = await createTestProjects({ demo: { 'src/api.ts': 'fetchUser();\n' } });
});

afterEach(async () => {
    await projects.remove();
    vi.mocked(runProcess).mockReset();
});

describe('searchTool on the filesystem', () => {
    it.each([
        'outside-folder',
        'outside-file',
        'outside-folder/secret.txt',
    ])('refuses to search through the symlink %s', async (folder) => {
        await mkdir(projects.path('other'));
        await writeFile(projects.path('other', 'secret.txt'), 'fetchUser secret\n');
        await symlink(projects.path('other'), projects.path('demo', 'outside-folder'));
        await symlink(projects.path('other', 'secret.txt'), projects.path('demo', 'outside-file'));

        await expect(searchTool(projects.config, {
            project: 'demo',
            queries: ['secret'],
            folder,
        })).rejects.toMatchObject({ code: 'forbidden_path' });
        expect(runProcess).not.toHaveBeenCalled();
    });

    it('reports a missing folder as not found', async () => {
        await expect(searchTool(projects.config, {
            project: 'demo',
            queries: ['fetchUser'],
            folder: 'missing',
        })).rejects.toMatchObject({
            code: 'not_found',
            message: '"missing" does not exist',
        });
        expect(runProcess).not.toHaveBeenCalled();
    });
});
