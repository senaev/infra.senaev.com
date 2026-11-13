import {
    beforeEach, describe, expect, it, vi,
} from 'vitest';

import { callLlmJson } from '../llm/callLlmJson';

import { planTrickyDadCommand } from './planTrickyDadCommand';

vi.mock('../env', () => {
    return {
        OBSIDIAN_TASKS_CHAT_ID: 'tasks-chat',
        TRICKY_DAD_CHAT_ID: 'tricky-dad-chat',
        LLM_SERVER_URL: 'http://llm-server:8080',
        OPENROUTER_API_KEY: 'key',
        API_DOMAIN: 'example.com',
    };
});

vi.mock('../llm/callLlmJson', () => {
    return { callLlmJson: vi.fn() };
});

vi.mock('../obsidianSyncApi', () => {
    return { addObsidianTasks: vi.fn() };
});

vi.mock('./actions/addItemsToSupabaseGroceryList', () => {
    return { addItemsToSupabaseGroceryList: vi.fn() };
});

type CallLlmJsonArgs = Parameters<typeof callLlmJson>[0];

/** Makes the mocked LLM give `answer` to the real `parse` of the request, as a provider would. */
function answerWith(answer: unknown): void {
    vi.mocked(callLlmJson).mockImplementation(({ parse }) => Promise.resolve({
        value: parse(answer),
        provider: 'openrouter',
        attempts: [
            {
                provider: 'openrouter',
                durationMs: 5,
                error: null,
            },
        ],
    }) as ReturnType<typeof callLlmJson>);
}

function answerWithNothing(): void {
    vi.mocked(callLlmJson).mockResolvedValue({
        value: null,
        provider: null,
        attempts: [
            {
                provider: 'openrouter',
                durationMs: 100,
                error: 'invalid response',
            },
        ],
    });
}

function getRequest(): CallLlmJsonArgs {
    const args = vi.mocked(callLlmJson).mock.calls[0]?.[0];

    if (!args) {
        throw new Error('callLlmJson was not called');
    }

    return args;
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('planTrickyDadCommand', () => {
    it('asks only the enabled providers: OpenRouter, not the disabled llm-server', async () => {
        answerWith({ items: ['Хлеб'] });

        await planTrickyDadCommand('купи хлеб', 'Tricky Dad Telegram chat');

        expect(getRequest().providers.map(({ name }) => name)).toEqual(['openrouter']);
    });

    it.each([
        'Tricky Dad Telegram chat',
        'Alisa',
    ] as const)('asks only for shopping items, never for tasks, from %s', async (source) => {
        answerWith({ items: ['Арбуз'] });

        const plan = await planTrickyDadCommand('попроси умного папу купить арбуз', source);

        expect(getRequest().jsonSchema.name).toBe('add_shopping_items');
        expect(getRequest().messages[0]?.content).not.toContain('add_tasks');
        expect(plan.isCommandFallback).toBe(false);
        expect(plan.llmProvider).toBe('openrouter');
        expect(plan.actions.map(({
            type, entries, reportChatId,
        }) => [
            type,
            entries,
            reportChatId,
        ])).toEqual([
            [
                'add_shopping_items',
                ['Арбуз'],
                'tricky-dad-chat',
            ],
        ]);
    });

    it('asks only for tasks, never for shopping items, from the Tasks chat', async () => {
        answerWith({
            tasks: [
                {
                    title: 'Купить хлеб',
                    date: null,
                },
            ],
        });

        const plan = await planTrickyDadCommand('купить хлеб', 'Tasks Telegram chat');

        expect(plan.actions.map(({ type }) => type)).toEqual(['add_tasks']);
        expect(getRequest().jsonSchema.name).toBe('add_tasks');
        expect(getRequest().messages[0]?.content).not.toContain('add_shopping_items');
    });

    it('keeps the system prompt stable and puts the date last, for the provider prompt cache', async () => {
        answerWith({ items: ['Хлеб'] });

        await planTrickyDadCommand('купи хлеб', 'Tricky Dad Telegram chat');

        const [
            system,
            user,
        ] = getRequest().messages;

        expect(system?.content).toMatch(/Today's date is \d{4}-\d{2}-\d{2}\.$/);
        expect(user).toEqual({
            role: 'user',
            content: 'купи хлеб',
        });
    });

    it('rejects whitespace-only shopping items, so the next provider tries', async () => {
        answerWith({ items: ['  '] });

        await expect(planTrickyDadCommand('купить', 'Tricky Dad Telegram chat')).rejects.toThrow('every item must be a non-empty string');
    });

    it('rejects an answer that is not an object, so the next provider tries', async () => {
        answerWith(['Хлеб']);

        await expect(planTrickyDadCommand('купи хлеб', 'Alisa')).rejects.toThrow('add_shopping_items must be an object');
    });

    it('rejects invalid arguments, so the next provider tries', async () => {
        answerWith({
            tasks: [
                {
                    title: 'Позвонить',
                    date: 'завтра',
                },
            ],
        });

        await expect(planTrickyDadCommand('позвонить завтра', 'Tasks Telegram chat')).rejects.toThrow('date must be a real YYYY-MM-DD');
    });

    it.each([
        '2026-02-30',
        '2026-13-01',
        '2026-11-00',
    ])('rejects a nonexistent calendar date %s', async (date) => {
        answerWith({
            tasks: [
                {
                    title: 'Позвонить',
                    date,
                },
            ],
        });

        await expect(planTrickyDadCommand('позвонить', 'Tasks Telegram chat')).rejects.toThrow('date must be a real YYYY-MM-DD');
    });

    it('accepts a real leap day', async () => {
        answerWith({
            tasks: [
                {
                    title: 'Позвонить',
                    date: '2028-02-29',
                },
            ],
        });

        const plan = await planTrickyDadCommand('позвонить', 'Tasks Telegram chat');

        expect(plan.isCommandFallback).toBe(false);
        expect(plan.actions).toHaveLength(1);
    });

    it('saves the raw command to the shopping list from Alisa when no provider answers', async () => {
        answerWithNothing();

        const plan = await planTrickyDadCommand('купи арбуз', 'Alisa');

        expect(plan.isCommandFallback).toBe(true);
        expect(plan.error).toBe('❌ No LLM provider gave a usable answer');
        expect(plan.llmAttempts[0]?.error).toBe('invalid response');
        expect(plan.actions.map(({ type, entries }) => [
            type,
            entries,
        ])).toEqual([
            [
                'add_shopping_items',
                ['купи арбуз'],
            ],
        ]);
    });

    it('saves the raw command as a task in Obsidian Tasks when no provider answers', async () => {
        answerWithNothing();

        const plan = await planTrickyDadCommand('позвонить маме', 'Tasks Telegram chat');

        expect(plan.isCommandFallback).toBe(true);
        expect(plan.actions.map(({ type, entries }) => [
            type,
            entries,
        ])).toEqual([
            [
                'add_tasks',
                ['позвонить маме'],
            ],
        ]);
    });
});
