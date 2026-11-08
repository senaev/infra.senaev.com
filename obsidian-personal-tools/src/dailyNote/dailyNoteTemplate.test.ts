import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DAILY_NOTE_TEMPLATE_MARKER as marker, dailyDateFromPath, dailyNotePathForRootNote, initializeDailyNote, parseDailyDate, renderDailyNote } from './dailyNoteTemplate';

void test('schedules tasks by the note date, including overlapping monthly/weekend rules', () => {
	const cases = [
		['2026-10-29', true, false, false, false, '2026q4'],
		['2026-08-01', false, true, true, false, '2026q3'],
		['2026-11-01', false, true, false, true, '2026q4'],
		['2027-02-01', true, true, false, false, '2027q1'],
		['2026-12-31', true, false, false, false, '2026q4'],
		['2027-01-01', true, true, false, false, '2027q1'],
	] as const;
	for (const [date, weekday, monthly, saturday, sunday, quarter] of cases) {
		const text = renderDailyNote(date);
		assert.equal(text.includes('[[Leetcode]]'), weekday, date);
		assert.equal(text.includes('[[LinkedIn]]'), monthly, date);
		assert.equal(text.includes('[[@senaev_speaks]]'), saturday, date);
		assert.equal(text.includes('[[@mom]]'), saturday, date);
		assert.equal(text.includes('[[🥞 Sunday Breakfast]]'), sunday, date);
		assert.ok(text.includes(`[[${quarter}#${date}]]`));
		assert.ok(text.includes('![[daily_note_stream]]'));
		assert.ok(text.includes('window.senaevPersonalTools.filterTasksForDaily({task, query})'));
		assert.ok(text.includes('window.senaevPersonalTools.sortKeyForDaily({task})'));
		assert.ok(!text.includes('<%'));
	}
});

void test('validates real calendar dates and only direct daily-folder children', () => {
	for (const value of ['2024-02-29', '2000-02-29', '2026-03-29', '2026-10-25']) assert.ok(parseDailyDate(value), value);
	for (const value of ['2026-02-29', '1900-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-10-00', '2026-1-01']) {
		assert.equal(parseDailyDate(value), null, value);
		assert.throws(() => renderDailyNote(value));
	}
	for (const path of ['2026-10-29.md', 'other/2026-10-29.md', 'periodic/day/nested/2026-10-29.md', 'periodic/day/2026-02-30.md', 'periodic/day/2026-10-29.txt']) {
		assert.equal(dailyDateFromPath(path), null);
		assert.equal(initializeDailyNote(path, marker), marker);
	}
});

void test('maps only date-named vault-root notes to the daily folder', () => {
	assert.equal(dailyNotePathForRootNote('2026-11-08.md'), 'periodic/day/2026-11-08.md');
	for (const path of ['periodic/day/2026-11-08.md', 'other/2026-11-08.md', '2026-02-30.md', '2026-11-08 2.md', '2026-11-08.txt', 'note.md']) {
		assert.equal(dailyNotePathForRootNote(path), null, path);
	}
});

void test('initializes blanks and explicit markers once, preserving existing content', () => {
	const path = 'periodic/day/2026-10-29.md';
	const generated = renderDailyNote('2026-10-29');
	for (const input of ['', '\n  ', marker, marker + '\n']) {
		assert.equal(initializeDailyNote(path, input), generated);
	}
	for (const input of [generated, generated.replace('- [ ]', '- [x]'), 'My diary text', `Example: ${marker}`, `\x60\x60\x60\n${marker}\n\x60\x60\x60`]) {
		assert.equal(initializeDailyNote(path, input), input);
	}
	assert.equal(initializeDailyNote(path, '---\n---\n'), '---\n---\n\n' + generated);
	const yaml = '---\ntags: [daily]\n---\n';
	assert.equal(initializeDailyNote(path, yaml), yaml + '\n' + generated);
	assert.equal(initializeDailyNote(path, yaml + marker), yaml + '\n' + generated);
	assert.equal(initializeDailyNote(path, yaml + 'Existing entry'), yaml + 'Existing entry');
});

void test('preserves complete output captured from the retired template and script', async () => {
	const { default: fixtures } = await import('./dailyNoteTemplate.fixtures.json');
	for (const [date, expected] of Object.entries(fixtures)) {
		assert.equal(renderDailyNote(date), expected, date);
	}
});
