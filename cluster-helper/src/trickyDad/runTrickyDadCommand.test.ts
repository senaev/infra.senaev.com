import {
    beforeEach, describe, expect, it, vi,
} from 'vitest';

import { callLlmJson } from '../llm/callLlmJson';
import { addObsidianTasks } from '../obsidianSyncApi';

import { addItemsToSupabaseGroceryList } from './actions/addItemsToSupabaseGroceryList';
import { runTrickyDadCommand } from './runTrickyDadCommand';

vi.mock('../env', () => {
    return {
        OBSIDIAN_TASKS_CHAT_ID: 'tasks-chat',
        TRICKY_DAD_CHAT_ID: 'tricky-dad-chat',
        LLM_SERVER_URL: null,
        OPENROUTER_API_KEY: 'key',
        WEBHOOK_DOMAIN: 'example.com',
    };
});

vi.mock('../logger', () => {
    return {
        logger: {
            info: vi.fn(),
            error: vi.fn(),
        },
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

const SHOPPING_AND_TASK_ANSWER = {
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
                    date: null,
                },
            ],
        },
    ],
    error: null,
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callLlmJson).mockImplementation(({ parse }) => Promise.resolve({
        value: parse(SHOPPING_AND_TASK_ANSWER),
        provider: 'openrouter',
        attempts: [
            {
                provider: 'openrouter',
                durationMs: 5,
                error: null,
            },
        ],
    }) as ReturnType<typeof callLlmJson>);
});

describe('runTrickyDadCommand', () => {
    it('runs every planned action and marks tasks with their source', async () => {
        const result = await runTrickyDadCommand('купи хлеб, папа позвонит в банк', 'Alisa');

        expect(addItemsToSupabaseGroceryList).toHaveBeenCalledWith(['Хлеб']);
        expect(addObsidianTasks).toHaveBeenCalledWith([
            {
                title: 'Позвонить в банк 🌱 Alisa',
                due_date: null,
            },
        ]);
        expect(result.llmProvider).toBe('openrouter');
        expect(result.actionResults.map(({ error }) => error)).toEqual([
            null,
            null,
        ]);
    });

    it('reports a failed action and still runs the next one', async () => {
        vi.mocked(addItemsToSupabaseGroceryList).mockRejectedValue(new Error('Supabase is down'));

        const result = await runTrickyDadCommand('купи хлеб, папа позвонит в банк', 'Tricky Dad');

        expect(result.actionResults[0]?.error).toContain('❌ Failed to run add_shopping_items: ');
        expect(result.actionResults[0]?.error).toContain('Supabase is down');
        expect(result.actionResults[1]?.error).toBeNull();
        expect(addObsidianTasks).toHaveBeenCalledTimes(1);
    });
});
