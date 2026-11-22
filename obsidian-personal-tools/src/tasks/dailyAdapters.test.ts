import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compareTaskSortKeys } from 'senaev-utils/src/obsidianTasks/dailyTasks';
import { DailyFilterTask, filterTasksForDaily, toDailyTask } from './filterTasksForDaily';
import { DailySortTask, sortKeyForDaily } from './sortKeyForDaily';

const day = (value: string) => ({ format: () => value });

const OPEN_TASK: DailyFilterTask = {
	status: { type: 'TODO' },
	priorityName: 'Normal',
	done: { moment: null },
	cancelled: { moment: null },
	dueDate: null,
	file: { path: 'notes/a.md' },
};

const QUERY = { file: { filename: '2026-10-17.md' } };

void describe('toDailyTask', () => {
	void it('converts a Tasks plugin task to plain data', () => {
		assert.deepEqual(
			toDailyTask({
				...OPEN_TASK,
				status: { type: 'CANCELLED' },
				priorityName: 'High',
				dueDate: day('2026-10-01'),
				cancelled: { moment: day('2026-10-02') },
			}),
			{
				path: 'notes/a.md',
				status: 'cancelled',
				priority: 'high',
				dueDate: '2026-10-01',
				closedDate: '2026-10-02',
			},
		);
	});
});

void describe('filterTasksForDaily', () => {
	void it('lists an undated open task on the active note only', () => {
		assert.equal(filterTasksForDaily(OPEN_TASK, QUERY, () => true), true);
		assert.equal(filterTasksForDaily(OPEN_TASK, QUERY, () => false), false);
	});

	void it('lists a done task on the day it was done', () => {
		const done = { ...OPEN_TASK, status: { type: 'DONE' }, done: { moment: day('2026-10-17') } };

		assert.equal(filterTasksForDaily(done, QUERY, () => false), true);
		assert.equal(
			filterTasksForDaily(done, { file: { filename: '2026-10-16.md' } }, () => false),
			false,
		);
	});
});

void describe('sortKeyForDaily', () => {
	const task = (priorityNumber: number, path: string, lineNumber: number): DailySortTask => ({
		priorityNumber,
		file: { path },
		taskLocation: { lineNumber },
	});

	void it('sorts by priority, then path, then line', () => {
		const keys = [
			task(3, 'b.md', 0),
			task(3, 'a/z.md', 9),
			task(3, 'a/z.md', 10),
			task(1, 'z.md', 0),
		].map((item) => ({ item, key: sortKeyForDaily(item) }));

		keys.sort((a, b) => compareTaskSortKeys(a.key, b.key));

		assert.deepEqual(
			keys.map(({ item }) => `${item.file.path}:${item.taskLocation.lineNumber}`),
			['z.md:0', 'a/z.md:9', 'a/z.md:10', 'b.md:0'],
		);
	});
});
