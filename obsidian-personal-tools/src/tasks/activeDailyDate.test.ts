import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isActiveDailyDate } from 'senaev-utils/src/obsidianTasks/dailyTasks';

const TODAY = '2026-08-17';

void describe('isActiveDailyDate', () => {
	void describe("when today's note exists", () => {
		const latestExistingDate = TODAY;

		void it('activates today and the future', () => {
			for (const noteDate of [TODAY, '2026-08-18', '2027-01-01']) {
				assert.equal(isActiveDailyDate({ noteDate, today: TODAY, latestExistingDate }), true);
			}
		});

		void it('leaves every past note inactive', () => {
			for (const noteDate of ['2026-08-16', '2024-11-05']) {
				assert.equal(isActiveDailyDate({ noteDate, today: TODAY, latestExistingDate }), false);
			}
		});
	});

	void describe("when today's note does not exist", () => {
		void it('promotes the latest existing note', () => {
			const latestExistingDate = '2026-08-16';

			assert.equal(
				isActiveDailyDate({ noteDate: '2026-08-16', today: TODAY, latestExistingDate }),
				true,
			);
			assert.equal(
				isActiveDailyDate({ noteDate: '2026-08-15', today: TODAY, latestExistingDate }),
				false,
			);
		});

		void it('keeps today active so a new note is born active', () => {
			assert.equal(
				isActiveDailyDate({
					noteDate: TODAY,
					today: TODAY,
					latestExistingDate: '2026-08-16',
				}),
				true,
			);
		});

		void it('promotes a future note without reviving the last past one', () => {
			const latestExistingDate = '2026-09-01';

			assert.equal(
				isActiveDailyDate({ noteDate: '2026-09-01', today: TODAY, latestExistingDate }),
				true,
			);
			assert.equal(
				isActiveDailyDate({ noteDate: '2026-08-16', today: TODAY, latestExistingDate }),
				false,
			);
		});
	});

	void it('activates today in an empty vault', () => {
		assert.equal(
			isActiveDailyDate({ noteDate: TODAY, today: TODAY, latestExistingDate: null }),
			true,
		);
		assert.equal(
			isActiveDailyDate({ noteDate: '2026-08-16', today: TODAY, latestExistingDate: null }),
			false,
		);
	});

	void it('activates a note whose name is not a date, such as the template', () => {
		// Hiding open tasks in `_templates/Daily note template.md` would make the
		// template look broken.
		for (const noteDate of ['Daily note template', 'Some note', '']) {
			assert.equal(
				isActiveDailyDate({ noteDate, today: TODAY, latestExistingDate: TODAY }),
				true,
			);
		}
	});
});
