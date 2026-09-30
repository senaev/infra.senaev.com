import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { App } from 'obsidian';
import { getDailyNoteMilestones } from './milestones';

/** A note as the stub vault sees it: a path plus its frontmatter. */
interface StubNote {
	path: string;
	frontmatter?: Record<string, unknown>;
}

/**
 * Builds the slice of `App` that `getDailyNoteMilestones` uses: the markdown
 * file list, the frontmatter cache, and linkpath resolution for Mother's Day.
 */
function stubApp(notes: StubNote[], mothersDayPath: string | null = null): App {
	const files = notes.map((note) => ({
		path: note.path,
		basename: (note.path.split('/').pop() ?? '').replace(/\.md$/, ''),
	}));

	return {
		vault: { getMarkdownFiles: () => files },
		metadataCache: {
			getFileCache: (file: { path: string }) => ({
				frontmatter: notes.find((note) => note.path === file.path)?.frontmatter,
			}),
			getFirstLinkpathDest: () =>
				mothersDayPath === null ? null : { path: mothersDayPath },
		},
	} as unknown as App;
}

/** Local-time date, matching how a daily note's date reaches the collector. */
function day(year: number, month: number, date: number): Date {
	return new Date(year, month - 1, date);
}

function textsOn(app: App, noteDate: Date): string[] {
	return getDailyNoteMilestones(app, noteDate).map((milestone) => milestone.text);
}

describe("Mother's Day milestone", () => {
	const MOTHERS_DAY_2026 = day(2026, 11, 29);

	it('is listed on the last Sunday of November, worded like a holiday', () => {
		const app = stubApp([], "_wiki/milestones/Mother's Day.md");

		assert.deepEqual(textsOn(app, MOTHERS_DAY_2026), ["Mother's Day 🎉"]);
	});

	it('links to the note found by linkpath', () => {
		const app = stubApp([], "_wiki/milestones/Mother's Day.md");
		const [milestone] = getDailyNoteMilestones(app, MOTHERS_DAY_2026);

		assert.equal(milestone?.path, "_wiki/milestones/Mother's Day.md");
	});

	it('falls back to a vault-root path when the note is missing', () => {
		const app = stubApp([], null);
		const [milestone] = getDailyNoteMilestones(app, MOTHERS_DAY_2026);

		assert.equal(milestone?.path, "Mother's Day.md");
	});

	it('is announced with 🔜 on the day before', () => {
		const app = stubApp([], null);

		assert.deepEqual(textsOn(app, day(2026, 11, 28)), ["Mother's Day 🔜"]);
	});

	it('is gone the day after', () => {
		const app = stubApp([], null);

		assert.deepEqual(textsOn(app, day(2026, 11, 30)), []);
	});

	it('is not listed two days before', () => {
		const app = stubApp([], null);

		assert.deepEqual(textsOn(app, day(2026, 11, 27)), []);
	});

	it('is hidden when its note has `milestones-hidden: true`', () => {
		const path = "_wiki/milestones/Mother's Day.md";
		const app = stubApp([{ path, frontmatter: { 'milestones-hidden': true } }], path);

		assert.deepEqual(textsOn(app, MOTHERS_DAY_2026), []);
	});
});

describe('milestones-hidden', () => {
	const BIRTHDAY = '1964-04-14';
	const ON_BIRTHDAY = day(2026, 4, 14);

	it('hides every milestone of a note set to `true`', () => {
		const app = stubApp([
			{
				path: '_people/@x.md',
				frontmatter: { birthday: BIRTHDAY, death: BIRTHDAY, 'milestones-hidden': true },
			},
		]);

		assert.deepEqual(textsOn(app, ON_BIRTHDAY), []);
	});

	it('hides tomorrow’s milestones too', () => {
		const app = stubApp([
			{ path: '_people/@x.md', frontmatter: { birthday: BIRTHDAY, 'milestones-hidden': true } },
		]);

		assert.deepEqual(textsOn(app, day(2026, 4, 13)), []);
	});

	it('leaves other notes alone', () => {
		const app = stubApp([
			{ path: '_people/@hidden.md', frontmatter: { birthday: BIRTHDAY, 'milestones-hidden': true } },
			{ path: '_people/@mom.md', frontmatter: { birthday: BIRTHDAY } },
		]);

		assert.deepEqual(textsOn(app, ON_BIRTHDAY), ['@mom birthday (62) 🎉']);
	});

	for (const value of [false, 'true', 'yes', 1, null]) {
		it(`does not hide for ${JSON.stringify(value)}`, () => {
			const app = stubApp([
				{ path: '_people/@mom.md', frontmatter: { birthday: BIRTHDAY, 'milestones-hidden': value } },
			]);

			assert.deepEqual(textsOn(app, ON_BIRTHDAY), ['@mom birthday (62) 🎉']);
		});
	}
});

describe('frontmatter milestones', () => {
	it('renders a birthday with the age', () => {
		const app = stubApp([{ path: '_people/@mom.md', frontmatter: { birthday: '1964-04-14' } }]);

		assert.deepEqual(textsOn(app, day(2026, 4, 14)), ['@mom birthday (62) 🎉']);
	});

	it('omits the age for a placeholder year', () => {
		const app = stubApp([
			{ path: '_wiki/milestones/New Year 🎄.md', frontmatter: { holiday: '0001-12-31' } },
		]);

		assert.deepEqual(textsOn(app, day(2026, 12, 31)), ['New Year 🎄 🎉']);
	});

	it('renders a death anniversary with its own emoji', () => {
		const app = stubApp([{ path: '_people/@x.md', frontmatter: { death: '1995-03-08' } }]);

		assert.deepEqual(textsOn(app, day(2026, 3, 8)), ['@x death anniversary (31) 🕯️']);
	});

	it('lists several types from one note', () => {
		const app = stubApp([
			{ path: '_people/@x.md', frontmatter: { birthday: '1936-05-02', death: '1995-05-02' } },
		]);

		assert.deepEqual(textsOn(app, day(2026, 5, 2)), [
			'@x birthday (90) 🎉',
			'@x death anniversary (31) 🕯️',
		]);
	});

	it('accepts a Date, which Obsidian yields for an unquoted YAML date', () => {
		const app = stubApp([
			{ path: '_people/@mom.md', frontmatter: { birthday: new Date('1964-04-14') } },
		]);

		assert.deepEqual(textsOn(app, day(2026, 4, 14)), ['@mom birthday (62) 🎉']);
	});

	it('ignores the year when matching the day', () => {
		const app = stubApp([{ path: '_people/@mom.md', frontmatter: { birthday: '1964-04-14' } }]);

		assert.deepEqual(textsOn(app, day(2031, 4, 14)), ['@mom birthday (67) 🎉']);
	});

	it('puts tomorrow before today, marking only tomorrow with 🔜', () => {
		const app = stubApp([
			{ path: '_people/@today.md', frontmatter: { birthday: '0001-04-14' } },
			{ path: '_people/@tomorrow.md', frontmatter: { birthday: '0001-04-15' } },
		]);

		assert.deepEqual(textsOn(app, day(2026, 4, 14)), [
			'@tomorrow birthday 🔜',
			'@today birthday 🎉',
		]);
	});

	it('skips notes without frontmatter, an unknown property or another date', () => {
		const app = stubApp([
			{ path: '_people/@none.md' },
			{ path: '_people/@other.md', frontmatter: { anniversary: '0001-04-14' } },
			{ path: '_people/@later.md', frontmatter: { birthday: '0001-04-16' } },
			{ path: '_people/@unparsable.md', frontmatter: { birthday: 'sometime in April' } },
		]);

		assert.deepEqual(textsOn(app, day(2026, 4, 14)), []);
	});

	it('crosses a month boundary when looking at tomorrow', () => {
		const app = stubApp([{ path: '_people/@x.md', frontmatter: { birthday: '0001-05-01' } }]);

		assert.deepEqual(textsOn(app, day(2026, 4, 30)), ['@x birthday 🔜']);
	});

	it('crosses a year boundary when looking at tomorrow', () => {
		const app = stubApp([{ path: '_people/@x.md', frontmatter: { birthday: '0001-01-01' } }]);

		assert.deepEqual(textsOn(app, day(2026, 12, 31)), ['@x birthday 🔜']);
	});

	it('matches 29 February in a leap year', () => {
		const app = stubApp([{ path: '_people/@x.md', frontmatter: { birthday: '2000-02-29' } }]);

		assert.deepEqual(textsOn(app, day(2028, 2, 29)), ['@x birthday (28) 🎉']);
	});
});
