import {
    describe, expect, test,
} from 'vitest';

import {
    compareTasks, type DailyTask, isActiveDailyDate, isTaskInDailyNote, isTaskPathExcluded,
} from './dailyTasks';

const TODAY = '2026-10-17';

const ACTIVE = {
    noteDate: TODAY,
    isActiveNote: true,
};

const TASK: DailyTask = {
    path: 'notes/a.md',
    status: 'open',
    priority: 'normal',
    dueDate: null,
    closedDate: null,
};

describe('isActiveDailyDate', () => {
    test('today and the future are active, the past is not', () => {
        expect(isActiveDailyDate({
            noteDate: TODAY,
            today: TODAY,
            latestExistingDate: TODAY,
        })).toBe(true);
        expect(isActiveDailyDate({
            noteDate: '2026-10-18',
            today: TODAY,
            latestExistingDate: TODAY,
        })).toBe(true);
        expect(isActiveDailyDate({
            noteDate: '2026-10-16',
            today: TODAY,
            latestExistingDate: TODAY,
        })).toBe(false);
    });

    test('the latest note is active when today\'s note does not exist', () => {
        expect(isActiveDailyDate({
            noteDate: '2026-10-16',
            today: TODAY,
            latestExistingDate: '2026-10-16',
        })).toBe(true);
    });

    test('a note whose name is not a date is active', () => {
        expect(isActiveDailyDate({
            noteDate: 'Daily note template',
            today: TODAY,
            latestExistingDate: TODAY,
        })).toBe(true);
    });
});

describe('isTaskInDailyNote', () => {
    test('lists overdue and due-today open tasks, not future ones', () => {
        expect(isTaskInDailyNote({
            ...TASK,
            dueDate: '2026-10-01',
        }, ACTIVE)).toBe(true);
        expect(isTaskInDailyNote({
            ...TASK,
            dueDate: TODAY,
        }, ACTIVE)).toBe(true);
        expect(isTaskInDailyNote({
            ...TASK,
            dueDate: '2026-10-18',
        }, ACTIVE)).toBe(false);
    });

    test('lists undated open tasks unless their priority is low or lowest', () => {
        expect(isTaskInDailyNote(TASK, ACTIVE)).toBe(true);
        expect(isTaskInDailyNote({
            ...TASK,
            priority: 'low',
        }, ACTIVE)).toBe(false);
        expect(isTaskInDailyNote({
            ...TASK,
            priority: 'lowest',
        }, ACTIVE)).toBe(false);
    });

    test('an inactive note lists only the tasks closed on its day', () => {
        const past = {
            noteDate: '2026-10-10',
            isActiveNote: false,
        };

        expect(isTaskInDailyNote({
            ...TASK,
            dueDate: '2026-10-01',
        }, past)).toBe(false);
        expect(isTaskInDailyNote({
            ...TASK,
            status: 'done',
            closedDate: '2026-10-10',
        }, past)).toBe(true);
        expect(isTaskInDailyNote({
            ...TASK,
            status: 'cancelled',
            closedDate: '2026-10-11',
        }, past)).toBe(false);
    });

    test('never lists tasks of periodic notes', () => {
        expect(isTaskInDailyNote({
            ...TASK,
            path: 'periodic/day/2026-10-17.md',
        }, ACTIVE)).toBe(false);
    });
});

describe('compareTasks', () => {
    test('sorts by priority, then path, then line', () => {
        const tasks = [
            {
                priority: 'normal' as const,
                path: 'b/x.md',
                line: 2,
            },
            {
                priority: 'normal' as const,
                path: 'a/z.md',
                line: 10,
            },
            {
                priority: 'normal' as const,
                path: 'a/z.md',
                line: 9,
            },
            {
                priority: 'high' as const,
                path: 'z.md',
                line: 1,
            },
        ];

        expect(tasks.sort(compareTasks).map(({ path, line }) => `${path}:${line}`)).toEqual([
            'z.md:1',
            'a/z.md:9',
            'a/z.md:10',
            'b/x.md:2',
        ]);
    });
});

describe('isTaskPathExcluded', () => {
    test('excludes dot-folders and the excluded root folders', () => {
        expect(isTaskPathExcluded('.obsidian/x.md')).toBe(true);
        expect(isTaskPathExcluded('notes/.trash/x.md')).toBe(true);
        expect(isTaskPathExcluded('_templates/Daily note template.md')).toBe(true);
        expect(isTaskPathExcluded('plugins/senaev-personal-tools/README.md')).toBe(true);
        expect(isTaskPathExcluded('notes/_templates/x.md')).toBe(false);
        expect(isTaskPathExcluded('@senaev/tasks/tasks_streaming.md')).toBe(false);
    });
});
