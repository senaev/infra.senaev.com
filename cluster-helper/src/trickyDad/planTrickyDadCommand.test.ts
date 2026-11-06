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
        WEBHOOK_DOMAIN: 'example.com',
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
        provider: 'llm-server',
        attempts: [
            {
                provider: 'llm-server',
                durationMs: 5,
                error: null,
            },
        ],
    }) as ReturnType<typeof callLlmJson>);
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
    it('asks llm-server first and OpenRouter second', async () => {
        answerWith({
            actions: [
                {
                    type: 'add_shopping_items',
                    items: ['Хлеб'],
                },
            ],
            error: null,
        });

        await planTrickyDadCommand('купи хлеб', 'Tricky Dad');

        expect(getRequest().providers.map(({ name }) => name)).toEqual([
            'llm-server',
            'openrouter',
        ]);
    });

    it('lets the model choose several actions for a multi-action source', async () => {
        answerWith({
            actions: [
                {
                    type: 'add_shopping_items',
                    items: ['Хлеб'],
                },
                {
                    type: 'add_tasks',
                    tasks: [
                        {
                            title: 'Позвонить в банк',
                            due_date: '2026-11-07',
                        },
                    ],
                },
            ],
            error: null,
        });

        const plan = await planTrickyDadCommand('купи хлеб, а папа пусть завтра позвонит в банк', 'Tricky Dad');

        expect(plan.isFallback).toBe(false);
        expect(plan.llmProvider).toBe('llm-server');
        expect(plan.actions.map(({
            type, entries, reportChatId,
        }) => [
            type,
            entries,
            reportChatId,
        ])).toEqual([
            [
                'add_shopping_items',
                ['Хлеб'],
                'tricky-dad-chat',
            ],
            [
                'add_tasks',
                ['Позвонить в банк'],
                'tasks-chat',
            ],
        ]);

        const { schema } = getRequest().jsonSchema;
        const variants = (schema as { properties: { actions: { items: { anyOf: Array<{ properties: { type: { enum: string[] } } }> } } } })
            .properties.actions.items.anyOf;

        expect(variants.map(({ properties }) => properties.type.enum)).toEqual([
            ['add_tasks'],
            ['add_shopping_items'],
        ]);
    });

    it('keeps the system prompt stable and puts the date last, for the llm-server prompt cache', async () => {
        answerWith({
            actions: [
                {
                    type: 'add_shopping_items',
                    items: ['Хлеб'],
                },
            ],
            error: null,
        });

        await planTrickyDadCommand('купи хлеб', 'Tricky Dad');

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

    it('asks only for task arguments in the task-only Obsidian Tasks chat', async () => {
        answerWith({
            tasks: [
                {
                    title: 'Купить хлеб',
                    due_date: null,
                },
            ],
        });

        const plan = await planTrickyDadCommand('купить хлеб', 'Obsidian Tasks');

        expect(plan.actions.map(({ type }) => type)).toEqual(['add_tasks']);
        expect(getRequest().jsonSchema.name).toBe('add_tasks');
        expect(getRequest().messages[0]?.content).not.toContain('add_shopping_items');
    });

    it('rejects an unknown action type, so the next provider tries', async () => {
        answerWith({
            actions: [{ type: 'delete_everything' }],
            error: null,
        });

        await expect(planTrickyDadCommand('удали всё', 'Tricky Dad')).rejects.toThrow('unknown action type');
    });

    it('rejects an empty answer without a reason, so the next provider tries', async () => {
        answerWith({
            actions: [],
            error: null,
        });

        await expect(planTrickyDadCommand('привет', 'Tricky Dad')).rejects.toThrow('actions is empty');
    });

    it('rejects invalid arguments, so the next provider tries', async () => {
        answerWith({
            tasks: [
                {
                    title: 'Позвонить',
                    due_date: 'завтра',
                },
            ],
        });

        await expect(planTrickyDadCommand('позвонить завтра', 'Obsidian Tasks')).rejects.toThrow('due_date must be YYYY-MM-DD');
    });

    it('saves the raw command with the fallback action when the model gives a reason for no actions', async () => {
        answerWith({
            actions: [],
            error: 'Это приветствие',
        });

        const plan = await planTrickyDadCommand('привет', 'Tricky Dad');

        expect(plan.isFallback).toBe(true);
        expect(plan.error).toBe('❌ LLM: Это приветствие');
        expect(plan.actions.map(({ type, entries }) => [
            type,
            entries,
        ])).toEqual([
            [
                'add_shopping_items',
                ['привет'],
            ],
        ]);
    });

    it('saves the raw command as a task in Obsidian Tasks when no provider answers', async () => {
        vi.mocked(callLlmJson).mockResolvedValue({
            value: null,
            provider: null,
            attempts: [],
        });

        const plan = await planTrickyDadCommand('позвонить маме', 'Obsidian Tasks');

        expect(plan.isFallback).toBe(true);
        expect(plan.error).toBe('❌ No LLM provider gave a usable answer');
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
