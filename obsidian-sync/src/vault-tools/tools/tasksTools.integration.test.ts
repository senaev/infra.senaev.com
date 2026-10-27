import { readFile } from 'node:fs/promises';

import { hashContent } from 'senaev-utils/src/files/contentHash';
import {
    afterEach, describe, expect, it,
} from 'vitest';

import { createTestVault, type TestVault } from '../createTestVault';

import { readTool } from './readTool';
import { tasksCreateTool } from './tasksCreateTool';
import { tasksListTool } from './tasksListTool';
import { tasksUpdateTool } from './tasksUpdateTool';

let vault: TestVault | undefined;

async function vaultWith(files: Record<string, string>): Promise<TestVault> {
    vault = await createTestVault(files);

    return vault;
}

afterEach(async () => {
    await vault?.remove();
    vault = undefined;
});

const STREAM = '@senaev/tasks/tasks_streaming.md';

describe('tasksListTool', () => {
    it('lists tasks sorted by priority, path and line, and reports unreadable lines', async () => {
        const testVault = await vaultWith({
            'b.md': '- [ ] B one\n- [ ] B urgent ⏫\n',
            'a.md': [
                '---',
                'title: "- [ ] not a task"',
                '---',
                '- [x] A done ✅ 2026-10-10',
                '```',
                '- [ ] in code',
                '```',
                '> - [ ] in a callout',
                '- [ ] Call mom 📅 2027-03-00',
                '',
            ].join('\n'),
            '_templates/Daily.md': '- [ ] template task\n',
            'plugins/x.md': '- [ ] plugin task\n',
        });

        const result = await tasksListTool(testVault.config, {});

        expect(result.tasks.map((task) => `${task.path}:${task.line} ${task.description}`)).toEqual([
            'b.md:2 B urgent',
            'a.md:4 A done',
            'a.md:8 in a callout',
            'b.md:1 B one',
        ]);
        expect(result.parseErrors).toEqual({
            count: 1,
            items: [
                {
                    path: 'a.md',
                    line: 9,
                    raw: '- [ ] Call mom 📅 2027-03-00',
                    error: 'invalid due date "2027-03-00"',
                },
            ],
        });
        expect(result.tasks[0]).toEqual({
            path: 'b.md',
            line: 2,
            hash: hashContent('- [ ] B one\n- [ ] B urgent ⏫\n'),
            raw: '- [ ] B urgent ⏫',
            status: 'open',
            description: 'B urgent',
            source: null,
            priority: 'high',
            dueDate: null,
            closedDate: null,
            recurrence: null,
        });
    });

    it('filters by status, text, due and closed dates, priority and folder, and pages', async () => {
        const testVault = await vaultWith({
            'work/w.md': [
                '- [ ] Pay rent 📅 2026-11-01',
                '- [ ] Pay taxes 🔽 📅 2026-12-01',
                '- [x] Buy milk ✅ 2026-10-10',
                '- [-] Buy bread ❌ 2026-10-12',
            ].join('\n'),
            'home.md': '- [ ] Pay electricity\n',
        });

        const listDescriptions = async (args: Record<string, unknown>) => (await tasksListTool(testVault.config, args)).tasks.map((task) => task.description);

        expect(await listDescriptions({
            status: [
                'done',
                'cancelled',
            ],
        })).toEqual([
            'Buy milk',
            'Buy bread',
        ]);
        expect(await listDescriptions({ queries: ['pay'] })).toEqual([
            'Pay electricity',
            'Pay rent',
            'Pay taxes',
        ]);
        expect(await listDescriptions({
            queries: [
                'pay',
                'rent',
            ],
            match: 'all',
        })).toEqual(['Pay rent']);
        expect(await listDescriptions({ dueTo: '2026-11-15' })).toEqual(['Pay rent']);
        expect(await listDescriptions({ closedFrom: '2026-10-11' })).toEqual(['Buy bread']);
        expect(await listDescriptions({ priority: ['low'] })).toEqual(['Pay taxes']);
        expect(await listDescriptions({ folder: 'work' })).toHaveLength(4);

        const page = await tasksListTool(testVault.config, {
            limit: 2,
            offset: 1,
        });

        expect(page).toMatchObject({
            total: 5,
            nextOffset: 3,
        });
        expect(page.tasks).toHaveLength(2);
    });

    it('gives the task list of a daily note', async () => {
        const testVault = await vaultWith({
            'periodic/day/2026-10-15.md': '- [ ] periodic task\n',
            'notes.md': [
                '- [ ] overdue 📅 2026-10-01',
                '- [ ] future 📅 2099-01-01',
                '- [ ] undated',
                '- [ ] undated low 🔽',
                '- [x] closed that day ✅ 2026-10-15',
                '- [x] closed another day ✅ 2026-10-14',
            ].join('\n'),
        });

        const past = await tasksListTool(testVault.config, { dailyNote: '2026-10-14' });

        expect(past.dailyNote).toEqual({
            date: '2026-10-14',
            isActive: false,
        });
        expect(past.tasks.map((task) => task.description)).toEqual(['closed another day']);

        // A past note is not active, also when it is the latest one and today's note does not exist.
        const latest = await tasksListTool(testVault.config, { dailyNote: '2026-10-15' });

        expect(latest.dailyNote?.isActive).toBe(false);
        expect(latest.tasks.map((task) => task.description)).toEqual(['closed that day']);

        const today = await tasksListTool(testVault.config, { dailyNote: 'today' });

        expect(today.dailyNote?.isActive).toBe(true);
        expect(today.tasks.map((task) => task.description)).toEqual([
            'overdue',
            'undated',
        ]);
    });
});

describe('tasksCreateTool', () => {
    it('adds a task at the top of tasks_streaming.md with a blank line after it', async () => {
        const content = '- [ ] Old task 🌱 Alisa\n';
        const testVault = await vaultWith({ [STREAM]: content });

        const result = await tasksCreateTool(testVault.config, {
            path: STREAM,
            expectedHash: hashContent(content),
            afterLine: 0,
            blankLinesAfter: 1,
            description: 'Buy a [[Travel scale]]',
            dueDate: '2026-11-01',
        });

        const written = '- [ ] Buy a [[Travel scale]] 🌱 Agent 📅 2026-11-01\n\n- [ ] Old task 🌱 Alisa\n';

        expect(await readFile(testVault.path(STREAM), 'utf8')).toBe(written);
        expect(result).toMatchObject({
            path: STREAM,
            hash: hashContent(written),
            nextOccurrence: null,
            task: {
                line: 1,
                raw: '- [ ] Buy a [[Travel scale]] 🌱 Agent 📅 2026-11-01',
                source: 'Agent',
                hash: hashContent(written),
            },
        });
        expect(result.diff).toContain('+- [ ] Buy a [[Travel scale]] 🌱 Agent 📅 2026-11-01');
    });

    it('inserts after a line with blank lines around, and allows several writes with the returned hash', async () => {
        const content = '# Title\nText\n\n## Next\n';
        const testVault = await vaultWith({ 'n.md': content });

        const first = await tasksCreateTool(testVault.config, {
            path: 'n.md',
            expectedHash: hashContent(content),
            afterLine: 2,
            blankLinesBefore: 1,
            blankLinesAfter: 1,
            description: 'First',
            source: 'Telegram bot',
            priority: 'highest',
        });

        expect(first.task.line).toBe(4);

        await tasksCreateTool(testVault.config, {
            path: 'n.md',
            expectedHash: first.hash,
            afterLine: 4,
            description: 'Second',
            recurrence: 'every week',
            dueDate: '2026-11-02',
        });

        expect(await readFile(testVault.path('n.md'), 'utf8')).toBe([
            '# Title',
            'Text',
            '',
            '- [ ] First 🌱 Telegram bot 🔺',
            '- [ ] Second 🌱 Agent 🔁 every week 📅 2026-11-02',
            '',
            '',
            '## Next',
            '',
        ].join('\n'));
    });

    it('refuses a missing line, a raw block, a stale hash and a bad task', async () => {
        const content = '---\na: 1\n---\n```\ncode\n```\n|a|b|\n|-|-|\n|1|2|\n';
        const testVault = await vaultWith({ 'n.md': content });
        const base = {
            path: 'n.md',
            expectedHash: hashContent(content),
            description: 'Task',
        };

        for (const afterLine of [
            0,
            1,
            4,
            7,
        ]) {
            await expect(tasksCreateTool(testVault.config, {
                ...base,
                afterLine,
            })).rejects.toMatchObject({ code: 'invalid_arguments' });
        }

        await expect(tasksCreateTool(testVault.config, {
            ...base,
            afterLine: 99,
        })).rejects.toThrow(/does not exist: the note has 9 lines/u);
        await expect(tasksCreateTool(testVault.config, {
            ...base,
            afterLine: 3,
            expectedHash: hashContent('old'),
        })).rejects.toMatchObject({ code: 'conflict' });
        await expect(tasksCreateTool(testVault.config, {
            ...base,
            afterLine: 3,
            recurrence: 'every week',
        })).rejects.toThrow(/needs "dueDate"/u);
        await expect(tasksCreateTool(testVault.config, {
            ...base,
            path: 'missing.md',
            afterLine: 0,
        })).rejects.toMatchObject({ code: 'not_found' });

        await tasksCreateTool(testVault.config, {
            ...base,
            afterLine: 3,
        });
        expect(await readFile(testVault.path('n.md'), 'utf8')).toContain('---\n- [ ] Task 🌱 Agent\n```');
    });
});

describe('tasksUpdateTool', () => {
    it('completes a recurring task and adds the next occurrence below it', async () => {
        const content = 'Intro\n- [ ] Reimburse kindergarten 🔁 every 3 months 📅 2026-05-01\nEnd\n';
        const testVault = await vaultWith({ 'w.md': content });

        const result = await tasksUpdateTool(testVault.config, {
            path: 'w.md',
            line: 2,
            expectedHash: hashContent(content),
            changes: {
                status: 'done',
                closedDate: '2026-06-25',
            },
        });

        expect(await readFile(testVault.path('w.md'), 'utf8')).toBe([
            'Intro',
            '- [x] Reimburse kindergarten 🔁 every 3 months 📅 2026-05-01 ✅ 2026-06-25',
            '- [ ] Reimburse kindergarten 🔁 every 3 months 📅 2026-08-01',
            'End',
            '',
        ].join('\n'));
        expect(result.task).toMatchObject({
            line: 2,
            status: 'done',
            closedDate: '2026-06-25',
        });
        expect(result.nextOccurrence).toMatchObject({
            line: 3,
            status: 'open',
            dueDate: '2026-08-01',
        });
    });

    it('sets today as the closed date, clears it on reopen, and applies partial changes', async () => {
        const content = '- [ ] Task 🌱 Alisa 📅 2026-11-01\n';
        const testVault = await vaultWith({ 't.md': content });

        const done = await tasksUpdateTool(testVault.config, {
            path: 't.md',
            line: 1,
            expectedHash: hashContent(content),
            changes: {
                status: 'cancelled',
                source: null,
                priority: 'high',
            },
        });

        expect(done.task.closedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
        expect(done.task.raw).toBe(`- [-] Task ⏫ 📅 2026-11-01 ❌ ${done.task.closedDate}`);

        const reopened = await tasksUpdateTool(testVault.config, {
            path: 't.md',
            line: 1,
            expectedHash: done.hash,
            changes: {
                status: 'open',
                dueDate: null,
                description: 'Renamed task',
            },
        });

        expect(reopened.task.raw).toBe('- [ ] Renamed task ⏫');
    });

    it('refuses a task that is not in our format and returns the expected and actual line', async () => {
        const content = '- [ ] Plan ⏳ 2026-11-01\n\t- [ ] Nested\ntext\n- [ ] Recurring 🔁 every week\n- [ ] Plain\n';
        const testVault = await vaultWith({ 't.md': content });
        const base = {
            path: 't.md',
            expectedHash: hashContent(content),
            changes: { status: 'done' },
        };

        await expect(tasksUpdateTool(testVault.config, {
            ...base,
            line: 1,
        })).rejects.toMatchObject({
            code: 'invalid_arguments',
            details: {
                expected: '- [ ] Plan',
                actual: '- [ ] Plan ⏳ 2026-11-01',
            },
        });
        await expect(tasksUpdateTool(testVault.config, {
            ...base,
            line: 2,
        })).rejects.toMatchObject({ details: { expected: '- [ ] Nested' } });
        await expect(tasksUpdateTool(testVault.config, {
            ...base,
            line: 3,
        })).rejects.toThrow('Line 3 is not a task');
        await expect(tasksUpdateTool(testVault.config, {
            ...base,
            line: 4,
        })).rejects.toThrow(/needs "dueDate"/u);
        await expect(tasksUpdateTool(testVault.config, {
            ...base,
            line: 9,
        })).rejects.toThrow(/does not exist/u);
        await expect(tasksUpdateTool(testVault.config, {
            ...base,
            line: 1,
            changes: { status: null },
        })).rejects.toThrow(/cannot be null/u);
        await expect(tasksUpdateTool(testVault.config, {
            ...base,
            line: 5,
            changes: { description: 'Plain 📅 2026-01-01' },
        })).rejects.toThrow(/read back/u);
        expect(await readFile(testVault.path('t.md'), 'utf8')).toBe(content);
    });
});

describe('readTool lineNumbers', () => {
    it('numbers the lines of the file, frontmatter included', async () => {
        const testVault = await vaultWith({ 'n.md': '---\na: 1\n---\n# H\ntext\n' });

        const [note] = (await readTool(testVault.config, {
            paths: ['n.md'],
            lineNumbers: true,
        })).notes;

        expect(note?.content).toBe('4: # H\n5: text\n');

        const [section] = (await readTool(testVault.config, {
            paths: ['n.md'],
            section: 'H',
            lineNumbers: true,
        })).notes;

        expect(section?.content).toBe('4: # H\n5: text\n');
    });
});
