import {
    appendFile, mkdir, readFile, symlink,
} from 'node:fs/promises';

import {
    afterEach, describe, expect, it,
} from 'vitest';
import { renderDailyNote } from 'senaev-utils/src/obsidianDailyNotes/dailyNoteTemplate';
import { createCommandExecution } from 'senaev-utils/src/commands/CommandExecution';

import { createTestVault, type TestVault } from '../createTestVault';

import { diaryAppendTool } from './diaryAppendTool';

const DAY = 'periodic/day/2026-11-18.md';
const OTHER_DAY = 'periodic/day/2026-11-17.md';
const MARKER = '⬆️ Daily Note ⬆️';
const record = (day: string, text: string) => new RegExp(`\\[\\[${day}\\|🎙️ \\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}\\]\\]: ${text} ✍️`);

let vault: TestVault | undefined;

async function vaultWith(files: Record<string, string>): Promise<TestVault> {
    vault = await createTestVault(files);

    return vault;
}

afterEach(async () => {
    await vault?.remove();
    vault = undefined;
});

describe('diaryAppendTool', () => {
    it('writes the records of several days above the marker of each daily note, in order', async () => {
        const { config, path } = await vaultWith({
            [DAY]: `Morning\n\n${MARKER}\nEnd\n`,
            [OTHER_DAY]: `Before\n${MARKER}\nAfter\n`,
        });

        const result = await diaryAppendTool(config, {
            records: [
                {
                    date: '2026-11-18',
                    text: '  Мы гуляли.  ',
                },
                {
                    date: '2026-11-17',
                    text: 'Yesterday.',
                },
                {
                    date: '2026-11-18',
                    text: 'Second.',
                },
            ],
        });
        const day = await readFile(path(DAY), 'utf8');
        const other = await readFile(path(OTHER_DAY), 'utf8');

        expect(day).toMatch(new RegExp(`^Morning\\n\\n${record('2026-11-18', 'Мы гуляли\\.').source}\\n\\n${record('2026-11-18', 'Second\\.').source}\\n\\n${MARKER}\\nEnd\\n$`));
        expect(other).toMatch(new RegExp(`^Before\\n\\n${record('2026-11-17', 'Yesterday\\.').source}\\n\\n${MARKER}\\nAfter\\n$`));
        expect(result.notes).toMatchObject([
            {
                path: DAY,
                created: false,
                records: 2,
                diffTruncated: false,
            },
            {
                path: OTHER_DAY,
                created: false,
                records: 1,
            },
        ]);
        expect(result.notes[0]?.diff).toContain(`--- a/${DAY}\n+++ b/${DAY}\n`);
        expect(result.notes[0]?.diff).not.toMatch(/^-(?!-- a\/)/m);
    });

    it('creates a missing daily note with reminders from vault frontmatter', async () => {
        const { config, path } = await vaultWith({
            'habits/Reminder.md': '---\nday-reminder: Check the calendar\nday-reminder-schedule: FREQ=WEEKLY;BYDAY=WE\n---\n',
            'archive/Reminder.md': 'Archive copy\n',
            'habits/Read.md': '---\nmorning-reminder: Read\n---\n',
        });

        const result = await diaryAppendTool(config, {
            records: [
                {
                    date: '2026-11-18',
                    text: 'Мы гуляли.',
                },
            ],
        });
        const content = await readFile(path(DAY), 'utf8');

        expect(result.notes[0]).toMatchObject({
            path: DAY,
            created: true,
        });
        expect(content.replace(/\n\[\[2026-11-18\|.*✍️\n/, '')).toBe(renderDailyNote('2026-11-18', {
            notePaths: [
                'habits/Reminder.md',
                'archive/Reminder.md',
                'habits/Read.md',
            ],
            notes: [
                {
                    path: 'habits/Read.md',
                    frontmatter: { 'morning-reminder': 'Read' },
                },
                {
                    path: 'habits/Reminder.md',
                    frontmatter: {
                        'day-reminder': 'Check the calendar',
                        'day-reminder-schedule': 'FREQ=WEEKLY;BYDAY=WE',
                    },
                },
            ],
        }));
        expect(content).toContain('- [ ] [[Read]]');
        expect(content).toContain('- [ ] [[habits/Reminder|Check the calendar]]');
        expect(content).toMatch(new RegExp(`---\\n\\n${record('2026-11-18', 'Мы гуляли\\.').source}\\n\\n${MARKER}\\n\\n---`));
    });

    it('fills a blank existing daily note from the template', async () => {
        const { config, path } = await vaultWith({ [DAY]: '\n' });

        await diaryAppendTool(config, {
            records: [
                {
                    date: '2026-11-18',
                    text: 'x',
                },
            ],
        });

        expect(await readFile(path(DAY), 'utf8')).toContain('window.senaevPersonalTools.filterTasksForDaily');
    });

    it('fails without writing anything when a note has no place for the record', async () => {
        const { config, path } = await vaultWith({
            [DAY]: `Text\n${MARKER}\n`,
            [OTHER_DAY]: 'No anchor here\n',
        });

        await expect(diaryAppendTool(config, {
            records: [
                {
                    date: '2026-11-18',
                    text: 'x',
                },
                {
                    date: '2026-11-17',
                    text: 'y',
                },
            ],
        })).rejects.toMatchObject({
            code: 'conflict',
            message: expect.stringContaining(OTHER_DAY) as unknown,
        });
        expect(await readFile(path(DAY), 'utf8')).toBe(`Text\n${MARKER}\n`);
        expect(await readFile(path(OTHER_DAY), 'utf8')).toBe('No anchor here\n');
    });

    it('rejects invalid records and unknown arguments without writing', async () => {
        const { config, path } = await vaultWith({ [DAY]: 'keep' });
        const invalid = [
            [
                {},
                '"records" must be an array',
            ],
            [
                { records: [] },
                '"records" must be an array',
            ],
            [
                { text: 'x' },
                'Unknown argument(s): text',
            ],
            [
                {
                    records: [
                        {
                            date: '2026-11-18',
                            text: '   ',
                        },
                    ],
                },
                '"records[0].text" must not be blank',
            ],
            [
                {
                    records: [
                        {
                            date: '2026-02-30',
                            text: 'x',
                        },
                    ],
                },
                '"records[0].date" must be a day',
            ],
            [
                {
                    records: [
                        {
                            date: '2026-11-18',
                            text: 'x',
                            path: 'Other.md',
                        },
                    ],
                },
                'Unknown argument(s): path',
            ],
        ] as const;

        for (const [
            input,
            message,
        ] of invalid) {
            await expect(diaryAppendTool(config, input)).rejects.toMatchObject({
                code: 'invalid_arguments',
                message: expect.stringContaining(message) as unknown,
            });
        }

        expect(await readFile(path(DAY), 'utf8')).toBe('keep');
    });

    it('never loses an edit that another writer saves while the call runs', async () => {
        // The other writer appends a line at the k-th checkpoint of the call, so every gap
        // between the read of the plan and the write is covered. An edit before the plan is
        // read is kept with the record; a later one fails the call and keeps the note as edited.
        const original = `Morning\n${MARKER}\n`;
        const edit = 'Edited in Obsidian\n';
        const outcomes: string[] = [];

        for (let k = 1; k <= 8; k++) {
            const { config, path } = await vaultWith({ [DAY]: original });
            const execution = createCommandExecution();
            const { checkpoint } = execution;
            let calls = 0;

            execution.checkpoint = async () => {
                calls++;
                if (calls === k) {
                    await appendFile(path(DAY), edit);
                }

                await checkpoint();
            };

            const error = await diaryAppendTool(config, {
                records: [
                    {
                        date: '2026-11-18',
                        text: 'Record.',
                    },
                ],
            }, execution).then(() => undefined, (reason: unknown) => reason);
            const content = await readFile(path(DAY), 'utf8');
            const edited = calls >= k;

            if (error === undefined) {
                outcomes.push('written');
                expect(content, `edit at checkpoint ${k}`).toMatch(new RegExp(`^Morning\\n\\n${record('2026-11-18', 'Record\\.').source}\\n\\n${MARKER}\\n${edited ? edit : ''}$`));
            } else {
                outcomes.push('conflict');
                expect(error, `edit at checkpoint ${k}`).toMatchObject({ code: 'conflict' });
                expect(content, `edit at checkpoint ${k}`).toBe(original + edit);
            }

            await vault?.remove();
            vault = undefined;
        }

        expect(outcomes).toContain('written');
        expect(outcomes).toContain('conflict');
    });

    it('rejects a record that contains an anchor line without writing', async () => {
        const { config, path } = await vaultWith({ [DAY]: `Text\n${MARKER}\n` });

        await expect(diaryAppendTool(config, {
            records: [
                {
                    date: '2026-11-18',
                    text: `First\n${MARKER}\nSecond`,
                },
            ],
        })).rejects.toMatchObject({ code: 'invalid_arguments' });
        expect(await readFile(path(DAY), 'utf8')).toBe(`Text\n${MARKER}\n`);
    });

    it('refuses to write through a symlinked folder', async () => {
        const { config, path } = await vaultWith({ '.obsidian/day/2026-11-18.md': `${MARKER}\n` });

        await mkdir(path('periodic'));
        await symlink(path('.obsidian/day'), path('periodic/day'));

        await expect(diaryAppendTool(config, {
            records: [
                {
                    date: '2026-11-18',
                    text: 'x',
                },
            ],
        })).rejects.toMatchObject({ code: 'forbidden_path' });
        expect(await readFile(path('.obsidian/day/2026-11-18.md'), 'utf8')).toBe(`${MARKER}\n`);
    });
});
