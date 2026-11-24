import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatDailyNoteBasename } from '../dailyNote/dailyNotePath';
import { isActiveDailyDateFromToday } from './activeDailyDate';

const shiftDays = (days: number): string => {
	const date = new Date();
	date.setDate(date.getDate() + days);
	return formatDailyNoteBasename(date);
};

void describe('isActiveDailyDateFromToday', () => {
	void it('treats today and future notes as active', () => {
		assert.equal(isActiveDailyDateFromToday(shiftDays(0)), true);
		assert.equal(isActiveDailyDateFromToday(shiftDays(1)), true);
	});

	void it('never treats a past note as active', () => {
		assert.equal(isActiveDailyDateFromToday(shiftDays(-1)), false);
	});

	void it('treats a note whose name is not a date as active', () => {
		for (const noteDate of ['Daily note template', 'Some note', '']) {
			assert.equal(isActiveDailyDateFromToday(noteDate), true);
		}
	});
});
