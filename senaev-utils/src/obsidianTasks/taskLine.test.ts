import {
    describe, expect, test,
} from 'vitest';

import {
    findTaskEditBlocker, findTaskFieldsError, parseTaskLine, serializeTask, type TaskFields,
} from './taskLine';

const OPEN: TaskFields = {
    status: 'open',
    description: '',
    source: null,
    priority: 'normal',
    dueDate: null,
    closedDate: null,
    recurrence: null,
};

function parse(line: string) {
    const result = parseTaskLine(line);

    if (result === null || !result.ok) {
        throw new Error(`Not a valid task: ${line}`);
    }

    return result;
}

// Verbatim lines from the vault, see "Examples from the vault" in
// projects/2026-10-16-16-48-obsidian-task-manager-for-mcp/README.md.
const VAULT_EXAMPLES: Array<[string, Partial<TaskFields>]> = [
    [
        '- [ ] Поставить новое стекло на телефон',
        { description: 'Поставить новое стекло на телефон' },
    ],
    [
        '- [ ] починить дверцу в шкафу на кухне 🌱 Alisa',
        {
            description: 'починить дверцу в шкафу на кухне',
            source: 'Alisa',
        },
    ],
    [
        '- [x] зашить шерстяной носок 🌱 Alisa ✅ 2026-10-10',
        {
            status: 'done',
            description: 'зашить шерстяной носок',
            source: 'Alisa',
            closedDate: '2026-10-10',
        },
    ],
    [
        '- [-] check if new tasks logic works at friday 🌱 Obsidian Tasks 📅 2026-07-17 ❌ 2026-07-11',
        {
            status: 'cancelled',
            description: 'check if new tasks logic works at friday',
            source: 'Obsidian Tasks',
            dueDate: '2026-07-17',
            closedDate: '2026-07-11',
        },
    ],
    [
        '- [ ] Reimburse mobile phone ⏫ 🔁 every month 📅 2026-11-01',
        {
            description: 'Reimburse mobile phone',
            priority: 'high',
            recurrence: 'every month',
            dueDate: '2026-11-01',
        },
    ],
    [
        '- [x] Reimburse kindergarten 🔁 every 3 months 📅 2026-05-01 ✅ 2026-06-25',
        {
            status: 'done',
            description: 'Reimburse kindergarten',
            recurrence: 'every 3 months',
            dueDate: '2026-05-01',
            closedDate: '2026-06-25',
        },
    ],
    [
        '- [ ] Fill the last quarter [[My Career - raw, handwritten via Self Assessments]] 🔁 every 90 days when done 📅 2026-11-09',
        {
            description: 'Fill the last quarter [[My Career - raw, handwritten via Self Assessments]]',
            recurrence: 'every 90 days when done',
            dueDate: '2026-11-09',
        },
    ],
    [
        '- [ ] Read about [[Fix ➕ 2026-01-01]] and [[Done 🏁 delete]]',
        { description: 'Read about [[Fix ➕ 2026-01-01]] and [[Done 🏁 delete]]' },
    ],
];

describe('parseTaskLine', () => {
    test.each(VAULT_EXAMPLES)('%s', (line, fields) => {
        const parsed = parse(line);

        expect(parsed.task).toEqual({
            ...OPEN,
            ...fields,
        });
        expect(serializeTask(parsed.task)).toBe(line);
        expect(findTaskEditBlocker(line, parsed)).toBeNull();
    });

    test('returns null for a line that is not a task', () => {
        expect(parseTaskLine('- ❌ Don\'t need it, will just change the battery')).toBeNull();
        expect(parseTaskLine('Some text')).toBeNull();
    });

    test('an invalid date is an error', () => {
        expect(parseTaskLine('- [ ] Call mom 📅 2027-03-00')).toEqual({
            ok: false,
            error: 'invalid due date "2027-03-00"',
        });
    });

    test('an unknown status is an error', () => {
        expect(parseTaskLine('- [/] In progress')).toMatchObject({ ok: false });
    });

    test('reads every priority', () => {
        expect([
            '🔺',
            '⏫',
            '🔼',
            '🔽',
            '⏬',
        ].map((emoji) => parse(`- [ ] Task ${emoji}`).task.priority)).toEqual([
            'highest',
            'high',
            'medium',
            'low',
            'lowest',
        ]);
    });

    test('reads fields in any order and trailing tags, like the Tasks plugin', () => {
        const line = '- [ ] Pay 📅 2026-11-01 ⏫ #money';
        const parsed = parse(line);

        expect(parsed.task).toEqual({
            ...OPEN,
            description: 'Pay #money',
            priority: 'high',
            dueDate: '2026-11-01',
        });
        expect(findTaskEditBlocker(line, parsed)).toMatchObject({ expected: '- [ ] Pay #money ⏫ 📅 2026-11-01' });
    });

    test('a line with an unsupported field cannot be edited', () => {
        const line = '- [ ] Plan the trip ⏳ 2026-11-01 📅 2026-11-05';
        const parsed = parse(line);

        expect(parsed.task.dueDate).toBe('2026-11-05');
        expect(findTaskEditBlocker(line, parsed)).toEqual({
            reason: expect.any(String),
            expected: '- [ ] Plan the trip 📅 2026-11-05',
            actual: line,
        });
    });

    test('nested, callout and numbered tasks are listed but cannot be edited', () => {
        for (const line of [
            '\t- [ ] Nested',
            '> - [ ] In a callout',
            '1. [ ] Numbered',
        ]) {
            const parsed = parse(line);

            expect(parsed.task.description).toBe(line.replace(/^.*\] /u, ''));
            expect(findTaskEditBlocker(line, parsed)?.expected).toBe(`- [ ] ${parsed.task.description}`);
        }
    });

    test('a double space before the source cannot be edited', () => {
        const line = '- [ ] Get a card [[Santander]]  🌱 Obsidian Tasks 📅 2026-10-29';

        expect(findTaskEditBlocker(line, parse(line))).not.toBeNull();
    });

    test('a block link and an uppercase X are read but not editable', () => {
        expect(parse('- [ ] Task ^abc-1').task.description).toBe('Task');
        expect(parse('- [X] Task ✅ 2026-01-01').task.status).toBe('done');
        expect(findTaskEditBlocker('- [X] Task ✅ 2026-01-01', parse('- [X] Task ✅ 2026-01-01'))).not.toBeNull();
    });
});

describe('findTaskFieldsError', () => {
    test('accepts a valid task', () => {
        expect(findTaskFieldsError({
            ...OPEN,
            description: 'Buy milk',
            source: 'Agent',
            dueDate: '2026-11-01',
            recurrence: 'every week',
        })).toBeNull();
    });

    test('a description that ends with a field is refused', () => {
        expect(findTaskFieldsError({
            ...OPEN,
            description: 'Buy milk 📅 2026-11-01',
        })).toMatch(/read back/u);
    });

    test('a recurring task needs a due date', () => {
        expect(findTaskFieldsError({
            ...OPEN,
            description: 'Water plants',
            recurrence: 'every week',
        })).toBe('A recurring task needs "dueDate"');
    });

    test('an invalid recurrence is refused', () => {
        expect(findTaskFieldsError({
            ...OPEN,
            description: 'Water plants',
            recurrence: 'sometimes',
            dueDate: '2026-11-01',
        })).toMatch(/invalid recurrence/u);
    });

    test('an open task has no closed date', () => {
        expect(findTaskFieldsError({
            ...OPEN,
            description: 'Task',
            closedDate: '2026-11-01',
        })).toMatch(/closedDate/u);
    });
});
