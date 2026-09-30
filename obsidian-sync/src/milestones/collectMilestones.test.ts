import {
    describe, expect, it,
} from 'vitest';

import { parseIsoCalendarDay } from './calendarDay';
import { collectMilestones, type VaultNote } from './collectMilestones';
import { readFixture } from './fixtures/readFixture';
import { parseMilestonesConfig } from './milestonesConfig';

const CONFIG = parseMilestonesConfig(readFixture('milestones.json'));

function note(path: string, frontmatter: Record<string, unknown>): VaultNote {
    return {
        path,
        basename: (path.split('/').pop() ?? '').replace(/\.md$/, ''),
        frontmatter,
    };
}

function milestonesOn(notes: VaultNote[], isoDay: string, invalidRules: string[] = []) {
    const today = parseIsoCalendarDay(isoDay);

    if (!today) {
        throw new Error(`bad test day ${isoDay}`);
    }

    return collectMilestones(notes, CONFIG, today, (_note, rule) => {
        invalidRules.push(rule);
    });
}

/** `fileName type age` per milestone, so a test reads as one line per milestone. */
function summaryOn(notes: VaultNote[], isoDay: string): { today: string[]; tomorrow: string[] } {
    const { today, tomorrow } = milestonesOn(notes, isoDay);

    const summarize = (day: typeof today) => day.milestones.map(({
        fileName, type, age,
    }) => `${fileName} ${type} ${String(age)}`);

    return {
        today: summarize(today),
        tomorrow: summarize(tomorrow),
    };
}

describe('collectMilestones', () => {
    it('returns both days with their dates and every field of a milestone', () => {
        const notes = [
            note('_people/@mom.md', { birthday: '1964-04-14' }),
            note('_wiki/milestones/Day.md', { holiday: '0001-04-15' }),
        ];

        expect(milestonesOn(notes, '2026-04-14')).toEqual({
            today: {
                date: '2026-04-14',
                milestones: [
                    {
                        fileName: '@mom',
                        path: '_people/@mom.md',
                        type: 'birthday',
                        age: 62,
                        emoji: '🥳',
                    },
                ],
            },
            tomorrow: {
                date: '2026-04-15',
                milestones: [
                    {
                        fileName: 'Day',
                        path: '_wiki/milestones/Day.md',
                        type: 'holiday',
                        age: null,
                        emoji: '💃',
                    },
                ],
            },
        });
    });

    it('gives empty lists for a day without milestones', () => {
        expect(summaryOn([], '2026-04-14')).toEqual({
            today: [],
            tomorrow: [],
        });
    });
});

describe('calculated milestones (`holiday-rule`)', () => {
    const mothersDay = (extra: Record<string, unknown> = {}) => [
        note('_wiki/milestones/Mother\'s Day.md', {
            'holiday-rule': 'FREQ=YEARLY;BYMONTH=11;BYDAY=-1SU',
            ...extra,
        }),
    ];

    it('is listed today on the calculated date, without an age', () => {
        expect(summaryOn(mothersDay(), '2026-11-29')).toEqual({
            today: ['Mother\'s Day holiday null'],
            tomorrow: [],
        });
    });

    it('is listed as tomorrow on the day before', () => {
        expect(summaryOn(mothersDay(), '2026-11-28')).toEqual({
            today: [],
            tomorrow: ['Mother\'s Day holiday null'],
        });
    });

    it('is gone the day after', () => {
        expect(summaryOn(mothersDay(), '2026-11-30')).toEqual({
            today: [],
            tomorrow: [],
        });
    });

    it('looks at the next year when tomorrow is 1 January', () => {
        const notes = [note('New Year.md', { 'holiday-rule': 'FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1' })];

        expect(summaryOn(notes, '2026-12-31').tomorrow).toEqual(['New Year holiday null']);
    });

    it('is hidden by `milestones-hidden: true`', () => {
        expect(summaryOn(mothersDay({ 'milestones-hidden': true }), '2026-11-29').today).toEqual([]);
    });

    it('is ignored for a type without a rule property, or when the rule is not a string', () => {
        const notes = [
            note('_people/@x.md', { 'birthday-rule': 'FREQ=YEARLY;BYMONTH=11;BYDAY=-1SU' }),
            note('Other.md', { 'holiday-rule': 42 }),
        ];

        expect(summaryOn(notes, '2026-11-29').today).toEqual([]);
    });

    it('reports an invalid rule and does not match it', () => {
        const invalidRules: string[] = [];
        const { today } = milestonesOn([note('Bad.md', { 'holiday-rule': 'sometime' })], '2026-11-29', invalidRules);

        expect(today.milestones).toEqual([]);
        // Once for today, once for tomorrow.
        expect(invalidRules).toEqual([
            'sometime',
            'sometime',
        ]);
    });
});

describe('milestones-hidden', () => {
    it('hides every milestone of the note, today and tomorrow', () => {
        const notes = [
            note('_people/@x.md', {
                birthday: '1964-04-14',
                death: '1964-04-15',
                'milestones-hidden': true,
            }),
        ];

        expect(summaryOn(notes, '2026-04-14')).toEqual({
            today: [],
            tomorrow: [],
        });
    });

    for (const value of [
        false,
        'true',
        'yes',
        1,
        null,
    ]) {
        it(`does not hide for ${JSON.stringify(value)}`, () => {
            const notes = [
                note('_people/@mom.md', {
                    birthday: '1964-04-14',
                    'milestones-hidden': value,
                }),
            ];

            expect(summaryOn(notes, '2026-04-14').today).toEqual(['@mom birthday 62']);
        });
    }
});

describe('frontmatter milestones', () => {
    it('computes the age, ignoring the year for matching', () => {
        const notes = [note('_people/@mom.md', { birthday: '1964-04-14' })];

        expect(summaryOn(notes, '2026-04-14').today).toEqual(['@mom birthday 62']);
        expect(summaryOn(notes, '2031-04-14').today).toEqual(['@mom birthday 67']);
    });

    it('computes tomorrow\'s age with tomorrow\'s year', () => {
        const notes = [note('_people/@x.md', { birthday: '2000-01-01' })];

        expect(summaryOn(notes, '2026-12-31').tomorrow).toEqual(['@x birthday 27']);
    });

    it('gives no age for a placeholder year', () => {
        const notes = [note('_wiki/milestones/New Year 🎄.md', { holiday: '0001-12-31' })];

        expect(summaryOn(notes, '2026-12-31').today).toEqual(['New Year 🎄 holiday null']);
    });

    it('lists several types from one note, in config order', () => {
        const notes = [
            note('_people/@x.md', {
                death: '1995-05-02',
                birthday: '1936-05-02',
            }),
        ];

        expect(summaryOn(notes, '2026-05-02').today).toEqual([
            '@x birthday 90',
            '@x death 31',
        ]);
    });

    it('accepts a Date value', () => {
        const notes = [note('_people/@mom.md', { birthday: new Date('1964-04-14') })];

        expect(summaryOn(notes, '2026-04-14').today).toEqual(['@mom birthday 62']);
    });

    it('skips an unknown property, another date and an unparsable value', () => {
        const notes = [
            note('_people/@other.md', { anniversary: '0001-04-14' }),
            note('_people/@later.md', { birthday: '0001-04-16' }),
            note('_people/@unparsable.md', { birthday: 'sometime in April' }),
        ];

        expect(summaryOn(notes, '2026-04-14')).toEqual({
            today: [],
            tomorrow: [],
        });
    });

    it('crosses month and year ends when looking at tomorrow', () => {
        expect(summaryOn([note('@x.md', { birthday: '0001-05-01' })], '2026-04-30').tomorrow).toEqual(['@x birthday null']);
        expect(summaryOn([note('@x.md', { birthday: '0001-01-01' })], '2026-12-31').tomorrow).toEqual(['@x birthday null']);
    });

    it('matches 29 February in a leap year', () => {
        expect(summaryOn([note('@x.md', { birthday: '2000-02-29' })], '2028-02-29').today).toEqual(['@x birthday 28']);
    });
});

describe('parseMilestonesConfig', () => {
    it('rejects an unsupported version', () => {
        expect(() => parseMilestonesConfig({
            ...CONFIG,
            version: 2,
        })).toThrow(/version/);
    });

    it('rejects a type without an emoji', () => {
        expect(() => parseMilestonesConfig({
            version: 1,
            hiddenProperty: 'h',
            minKnownYear: 1901,
            types: [{ property: 'birthday' }],
        })).toThrow(/emoji/);
    });
});
