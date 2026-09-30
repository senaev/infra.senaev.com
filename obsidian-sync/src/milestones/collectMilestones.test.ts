import {
    describe, expect, it,
} from 'vitest';

import { parseIsoCalendarDay } from './calendarDay';
import { collectMilestoneLines, type VaultNote } from './collectMilestones';
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

function linesOn(notes: VaultNote[], isoDay: string, invalidRules: string[] = []): string[] {
    const today = parseIsoCalendarDay(isoDay);

    if (!today) {
        throw new Error(`bad test day ${isoDay}`);
    }

    return collectMilestoneLines(notes, CONFIG, today, (_note, rule) => {
        invalidRules.push(rule);
    });
}

describe('calculated milestones (`holiday-rule`)', () => {
    const mothersDay = (extra: Record<string, unknown> = {}) => [
        note('_wiki/milestones/Mother\'s Day.md', {
            'holiday-rule': 'FREQ=YEARLY;BYMONTH=11;BYDAY=-1SU',
            ...extra,
        }),
    ];

    it('is listed on the calculated date without an age', () => {
        expect(linesOn(mothersDay(), '2026-11-29')).toEqual(['Mother\'s Day 💃']);
    });

    it('is announced with 🔜 on the day before', () => {
        expect(linesOn(mothersDay(), '2026-11-28')).toEqual(['Mother\'s Day 🔜']);
    });

    it('is gone the day after and two days before', () => {
        expect(linesOn(mothersDay(), '2026-11-30')).toEqual([]);
        expect(linesOn(mothersDay(), '2026-11-27')).toEqual([]);
    });

    it('looks at the next year when tomorrow is 1 January', () => {
        const notes = [note('New Year.md', { 'holiday-rule': 'FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1' })];

        expect(linesOn(notes, '2026-12-31')).toEqual(['New Year 🔜']);
    });

    it('is hidden by `milestones-hidden: true`', () => {
        expect(linesOn(mothersDay({ 'milestones-hidden': true }), '2026-11-29')).toEqual([]);
    });

    it('is ignored for a type without a rule property, or when the rule is not a string', () => {
        const notes = [
            note('_people/@x.md', { 'birthday-rule': 'FREQ=YEARLY;BYMONTH=11;BYDAY=-1SU' }),
            note('Other.md', { 'holiday-rule': 42 }),
        ];

        expect(linesOn(notes, '2026-11-29')).toEqual([]);
    });

    it('reports an invalid rule and does not match it', () => {
        const invalidRules: string[] = [];

        expect(linesOn([note('Bad.md', { 'holiday-rule': 'sometime' })], '2026-11-29', invalidRules)).toEqual([]);
        // Once for tomorrow, once for today.
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

        expect(linesOn(notes, '2026-04-14')).toEqual([]);
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

            expect(linesOn(notes, '2026-04-14')).toEqual(['@mom birthday (62) 🥳']);
        });
    }
});

describe('frontmatter milestones', () => {
    it('renders a birthday with the age, ignoring the year for matching', () => {
        const notes = [note('_people/@mom.md', { birthday: '1964-04-14' })];

        expect(linesOn(notes, '2026-04-14')).toEqual(['@mom birthday (62) 🥳']);
        expect(linesOn(notes, '2031-04-14')).toEqual(['@mom birthday (67) 🥳']);
    });

    it('omits the age for a placeholder year', () => {
        const notes = [note('_wiki/milestones/New Year 🎄.md', { holiday: '0001-12-31' })];

        expect(linesOn(notes, '2026-12-31')).toEqual(['New Year 🎄 💃']);
    });

    it('lists several types from one note, in config order', () => {
        const notes = [
            note('_people/@x.md', {
                death: '1995-05-02',
                birthday: '1936-05-02',
            }),
        ];

        expect(linesOn(notes, '2026-05-02')).toEqual([
            '@x birthday (90) 🥳',
            '@x death anniversary (31) ⚰️',
        ]);
    });

    it('accepts a Date value', () => {
        const notes = [note('_people/@mom.md', { birthday: new Date('1964-04-14') })];

        expect(linesOn(notes, '2026-04-14')).toEqual(['@mom birthday (62) 🥳']);
    });

    it('puts tomorrow before today, marking only tomorrow with 🔜', () => {
        const notes = [
            note('_people/@today.md', { birthday: '0001-04-14' }),
            note('_people/@tomorrow.md', { birthday: '0001-04-15' }),
        ];

        expect(linesOn(notes, '2026-04-14')).toEqual([
            '@tomorrow birthday 🔜',
            '@today birthday 🥳',
        ]);
    });

    it('skips an unknown property, another date and an unparsable value', () => {
        const notes = [
            note('_people/@other.md', { anniversary: '0001-04-14' }),
            note('_people/@later.md', { birthday: '0001-04-16' }),
            note('_people/@unparsable.md', { birthday: 'sometime in April' }),
        ];

        expect(linesOn(notes, '2026-04-14')).toEqual([]);
    });

    it('crosses month and year ends when looking at tomorrow', () => {
        expect(linesOn([note('@x.md', { birthday: '0001-05-01' })], '2026-04-30')).toEqual(['@x birthday 🔜']);
        expect(linesOn([note('@x.md', { birthday: '0001-01-01' })], '2026-12-31')).toEqual(['@x birthday 🔜']);
    });

    it('matches 29 February in a leap year', () => {
        expect(linesOn([note('@x.md', { birthday: '2000-02-29' })], '2028-02-29')).toEqual(['@x birthday (28) 🥳']);
    });

    it('inserts `$&` in a note name literally', () => {
        expect(linesOn([note('@$&.md', { birthday: '0001-04-14' })], '2026-04-14')).toEqual(['@$& birthday 🥳']);
    });
});

describe('parseMilestonesConfig', () => {
    it('rejects an unsupported version', () => {
        expect(() => parseMilestonesConfig({
            ...CONFIG,
            version: 2,
        })).toThrow(/version/);
    });

    it('rejects a type without a template', () => {
        expect(() => parseMilestonesConfig({
            version: 1,
            hiddenProperty: 'h',
            minKnownYear: 1901,
            tomorrowEmoji: '🔜',
            types: [
                {
                    property: 'birthday',
                    emoji: '🥳',
                },
            ],
        })).toThrow(/template/);
    });
});
