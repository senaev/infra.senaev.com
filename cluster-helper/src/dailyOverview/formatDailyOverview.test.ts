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
            '<b>События сегодня:</b>',
            '<code>@yavladimirov</code> birthday (39) 🥳',
            '<code>@sk-danil</code> birthday (37) 🥳',
            '',
            '<b>Завтра:</b>',
            '<code>Mother\'s Day</code> 💃',
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
        expect(text.startsWith('<b>Завтра:</b>')).toBe(true);
    });

    it('says so when both days are empty', () => {
        expect(formatDailyOverview(overview([], []))).toBe('Сегодня и завтра событий нет 🤷‍♂️\n\nХорошего дня, ваш Умный Папа ❤️');
    });

    it('escapes HTML in the note name', () => {
        expect(formatDailyOverview(overview([milestone({ fileName: 'Tom & <Jerry>' })], []))).toContain('<code>Tom &amp; &lt;Jerry&gt;</code>');
    });
});
