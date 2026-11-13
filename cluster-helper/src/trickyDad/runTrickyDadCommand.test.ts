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
        API_DOMAIN: 'example.com',
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

beforeEach(() => {
    vi.clearAllMocks();
});

describe('runTrickyDadCommand', () => {
    it('adds the shopping items from Alisa to the shopping list, and never a task', async () => {
        answerWith({ items: ['Арбуз'] });

        const result = await runTrickyDadCommand('попроси умного папу купить арбуз', 'Alisa');

        expect(addItemsToSupabaseGroceryList).toHaveBeenCalledWith(['Арбуз']);
        expect(addObsidianTasks).not.toHaveBeenCalled();
        expect(result.llmProvider).toBe('openrouter');
        expect(result.actionResults.map(({ error }) => error)).toEqual([null]);
    });

    it('adds the tasks from the Tasks chat with their source, and never a shopping item', async () => {
        answerWith({
            tasks: [
                {
                    title: 'Позвонить в банк',
                    date: null,
                },
            ],
        });

        await runTrickyDadCommand('позвонить в банк', 'Tasks Telegram chat');

        expect(addObsidianTasks).toHaveBeenCalledWith([
            {
                title: 'Позвонить в банк',
                date: null,
                source: 'Tasks Telegram chat',
            },
        ]);
        expect(addItemsToSupabaseGroceryList).not.toHaveBeenCalled();
    });

    it('reports a failed action', async () => {
        answerWith({ items: ['Хлеб'] });
        vi.mocked(addItemsToSupabaseGroceryList).mockRejectedValue(new Error('Supabase is down'));

        const result = await runTrickyDadCommand('купи хлеб', 'Tricky Dad Telegram chat');

        expect(result.actionResults[0]?.error).toContain('❌ Failed to run add_shopping_items: ');
        expect(result.actionResults[0]?.error).toContain('Supabase is down');
    });
});
