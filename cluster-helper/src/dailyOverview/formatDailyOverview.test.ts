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
            '🔔 <b>Доброе утро!</b>',
            'Сегодня суббота, 29 ноября. Вот что важно не пропустить:',
            '',
            '<b>События сегодня:</b>',
            '<code>@yavladimirov</code> birthday (39) 🥳',
            '<code>@sk-danil</code> birthday (37) 🥳',
            '',
            '<b>Завтра:</b>',
            '<code>Mother\'s Day</code> 💃',
            '',
            '<b>Что приготовить сегодня:</b>',
            '🍳 <a href="https://mastereat.ru/">mastereat.ru</a>',
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

        expect(text).toContain('<code>@x</code> death anniversary (31) ⚰️\n<code>@x</code> wedding 💍');
    });

    it('leaves out an empty day', () => {
        const text = formatDailyOverview(overview([], [milestone({})]));

        expect(text).not.toContain('События сегодня');
        expect(text).toContain('не пропустить:\n\n<b>Завтра:</b>');
    });

    it('says so when both days are empty, without promising anything to miss', () => {
        expect(formatDailyOverview(overview([], []))).toBe([
            '🔔 <b>Доброе утро!</b>',
            'Сегодня суббота, 29 ноября.',
            '',
            'Сегодня и завтра событий нет 🤷‍♂️',
            '',
            '<b>Что приготовить сегодня:</b>',
            '🍳 <a href="https://mastereat.ru/">mastereat.ru</a>',
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

        expect(text).toContain('Сегодня пятница, 1 января.');
    });

    it('escapes HTML in the note name', () => {
        expect(formatDailyOverview(overview([milestone({ fileName: 'Tom & <Jerry>' })], []))).toContain('<code>Tom &amp; &lt;Jerry&gt;</code>');
    });
});
