import {
    describe, expect, it,
} from 'vitest';

import type { Milestone, MilestonesOverview } from '../obsidianSyncApi';

import { formatDailyOverview } from './formatDailyOverview';

function milestone(overrides: Partial<Milestone>): Milestone {
    return {
        fileName: '@x',
        path: '_people/@x.md',
        type: 'birthday',
        age: null,
        emoji: '🥳',
        ...overrides,
    };
}

function overview(today: Milestone[], tomorrow: Milestone[]): MilestonesOverview {
    return {
        today: {
            date: '2025-11-29',
            milestones: today,
        },
        tomorrow: {
            date: '2025-11-30',
            milestones: tomorrow,
        },
    };
}

describe('formatDailyOverview', () => {
    it('lists today and tomorrow in separate sections, with the note name as code', () => {
        const text = formatDailyOverview(overview(
            [
                milestone({
                    fileName: '@yavladimirov',
                    age: 39,
                }),
                milestone({
                    fileName: '@sk-danil',
                    age: 37,
                }),
            ],
            [
                milestone({
                    fileName: 'Mother\'s Day',
                    type: 'holiday',
                    emoji: '💃',
                }),
            ]
        ));

        expect(text).toBe([
            '## 🔔 Доброе утро субботы, 29 ноября',
            '',
            '### Сегодня',
            '- ==@\u2060yavladimirov== birthday (39) 🥳',
            '- ==@\u2060sk-danil== birthday (37) 🥳',
            '',
            '### Завтра',
            '- ==Mother\'s Day== 🔜',
            '',
            '### Что приготовить',
            '🍳 [mastereat.ru](https://mastereat.ru/)',
            '',
            'Хорошего дня, ваш Умный Папа ❤️',
        ].join('\n'));
    });

    it('words a death anniversary and falls back to the type name for an unknown type', () => {
        const text = formatDailyOverview(overview(
            [
                milestone({
                    type: 'death',
                    age: 31,
                    emoji: '⚰️',
                }),
                milestone({
                    type: 'wedding',
                    emoji: '💍',
                }),
            ],
            []
        ));

        expect(text).toContain('- ==@\u2060x== death anniversary (31) ⚰️\n- ==@\u2060x== wedding 💍');
    });

    it('leaves out an empty day', () => {
        const text = formatDailyOverview(overview([], [milestone({})]));

        expect(text).not.toContain('### Сегодня');
        expect(text).toContain('29 ноября\n\n### Завтра');
    });

    it('says so when both days are empty', () => {
        expect(formatDailyOverview(overview([], []))).toBe([
            '## 🔔 Доброе утро субботы, 29 ноября',
            '',
            'Сегодня и завтра событий нет 🤷‍♂️',
            '',
            '### Что приготовить',
            '🍳 [mastereat.ru](https://mastereat.ru/)',
            '',
            'Хорошего дня, ваш Умный Папа ❤️',
        ].join('\n'));
    });

    it('names the day by the date it is given, whatever the local time zone', () => {
        const text = formatDailyOverview({
            today: {
                date: '2027-01-01',
                milestones: [],
            },
            tomorrow: {
                date: '2027-01-02',
                milestones: [],
            },
        });

        expect(text).toContain('## 🔔 Доброе утро пятницы, 1 января\n');
    });

    it('puts every weekday in the genitive case', () => {
        const headers = [
            '2026-01-04',
            '2026-01-05',
            '2026-01-06',
            '2026-01-07',
            '2026-01-08',
            '2026-01-09',
            '2026-01-10',
        ].map((date) => formatDailyOverview({
            today: {
                date,
                milestones: [],
            },
            tomorrow: {
                date,
                milestones: [],
            },
        }).split('\n')[0]);

        expect(headers).toEqual([
            '## 🔔 Доброе утро воскресенья, 4 января',
            '## 🔔 Доброе утро понедельника, 5 января',
            '## 🔔 Доброе утро вторника, 6 января',
            '## 🔔 Доброе утро среды, 7 января',
            '## 🔔 Доброе утро четверга, 8 января',
            '## 🔔 Доброе утро пятницы, 9 января',
            '## 🔔 Доброе утро субботы, 10 января',
        ]);
    });

    it('breaks every @username with a word joiner, so Telegram does not link it', () => {
        expect(formatDailyOverview(overview([milestone({ fileName: '@anna & @bob' })], []))).toContain('- ==@\u2060anna & @\u2060bob== birthday 🥳');
    });

    it('escapes markdown characters in the note name', () => {
        expect(formatDailyOverview(overview([milestone({ fileName: '*Tom* & [Jerry] a==b' })], []))).toContain('- ==\\*Tom\\* & \\[Jerry\\] a\\=\\=b== birthday 🥳');
    });
});
