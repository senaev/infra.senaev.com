import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compareReminderSortKeys } from 'senaev-utils/src/obsidianReminders/dailyReminderList';
import { DailyFilterReminder, filterRemindersForDaily, toDailyReminder } from './filterRemindersForDaily';
import { DailySortReminder, sortKeyForDaily } from './sortKeyForDaily';

const day = (value: string) => ({ format: () => value });

const OPEN_REMINDER: DailyFilterReminder = {
	status: { type: 'TODO' },
	priorityName: 'Normal',
	done: { moment: null },
	cancelled: { moment: null },
	dueDate: null,
	file: { path: 'notes/a.md' },
};

const QUERY = { file: { filename: '2026-10-17.md' } };

void describe('toDailyReminder', () => {
	void it('converts a Tasks plugin `task` object to plain data', () => {
		assert.deepEqual(
			toDailyReminder({
				...OPEN_REMINDER,
				status: { type: 'CANCELLED' },
				priorityName: 'High',
				dueDate: day('2026-10-01'),
				cancelled: { moment: day('2026-10-02') },
			}),
			{
				path: 'notes/a.md',
				status: 'cancelled',
				priority: 'high',
				date: '2026-10-01',
				closedDate: '2026-10-02',
			},
		);
	});
});

void describe('filterRemindersForDaily', () => {
	void it('lists an undated open reminder on the active note only', () => {
		assert.equal(filterRemindersForDaily(OPEN_REMINDER, QUERY, () => true), true);
		assert.equal(filterRemindersForDaily(OPEN_REMINDER, QUERY, () => false), false);
	});

	void it('lists a done reminder on the day it was done', () => {
		const done = { ...OPEN_REMINDER, status: { type: 'DONE' }, done: { moment: day('2026-10-17') } };

		assert.equal(filterRemindersForDaily(done, QUERY, () => false), true);
		assert.equal(
			filterRemindersForDaily(done, { file: { filename: '2026-10-16.md' } }, () => false),
			false,
		);
	});
});

void describe('sortKeyForDaily', () => {
	const reminder = (priorityNumber: number, path: string, lineNumber: number): DailySortReminder => ({
		priorityNumber,
		file: { path },
		taskLocation: { lineNumber },
	});

	void it('sorts by priority, then path, then line', () => {
		const keys = [
			reminder(3, 'b.md', 0),
			reminder(3, 'a/z.md', 9),
			reminder(3, 'a/z.md', 10),
			reminder(1, 'z.md', 0),
		].map((item) => ({ item, key: sortKeyForDaily(item) }));

		keys.sort((a, b) => compareReminderSortKeys(a.key, b.key));

		assert.deepEqual(
			keys.map(({ item }) => `${item.file.path}:${item.taskLocation.lineNumber}`),
			['z.md:0', 'a/z.md:9', 'a/z.md:10', 'b.md:0'],
		);
	});
});
