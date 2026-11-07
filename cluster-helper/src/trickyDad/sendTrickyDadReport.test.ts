import {
    describe, expect, it, vi,
} from 'vitest';

import type { PlannedTrickyDadAction } from './actions/TrickyDadAction';
import type { TrickyDadCommandResult } from './runTrickyDadCommand';
import {
    formatTrickyDadReport, getTrickyDadReportChatIds, isTrickyDadCommandFailed,
} from './sendTrickyDadReport';

vi.mock('../env', () => {
    return {
        OBSIDIAN_TASKS_CHAT_ID: 'tasks-chat',
        TRICKY_DAD_CHAT_ID: 'tricky-dad-chat',
        TG_TOKEN_SENAEV_COM_BOT: 'token',
    };
});

vi.mock('../obsidianSyncApi', () => {
    return { addObsidianTasks: vi.fn() };
});

vi.mock('./actions/addItemsToSupabaseGroceryList', () => {
    return { addItemsToSupabaseGroceryList: vi.fn() };
});

function buildAction(type: string, emoji: string, reportChatId: string, entries: string[]): PlannedTrickyDadAction {
    return {
        type,
        emoji,
        reportChatId,
        entries,
        run: () => Promise.resolve([]),
    };
}

const SHOPPING = buildAction('add_shopping_items', '🛒', 'tricky-dad-chat', ['Хлеб']);
const TASKS = buildAction('add_tasks', '👉', 'tasks-chat', ['Позвонить в банк']);

function buildResult(overrides: Partial<TrickyDadCommandResult> = {}): TrickyDadCommandResult {
    return {
        isCommandFallback: false,
        error: null,
        llmProvider: 'llm-server',
        llmAttempts: [
            {
                provider: 'llm-server',
                durationMs: 8500,
                error: null,
            },
        ],
        llmDurationMs: 8500,
        actionResults: [
            {
                action: SHOPPING,
                output: [],
                durationMs: 120,
                error: null,
            },
        ],
        ...overrides,
    };
}

describe('getTrickyDadReportChatIds', () => {
    it('sends a shopping result from the Tricky Dad chat only there', () => {
        expect(getTrickyDadReportChatIds(buildResult(), 'Tricky Dad Telegram chat')).toEqual(['tricky-dad-chat']);
    });

    it('sends a task from the Tricky Dad chat to the tasks chat and back to the source chat', () => {
        const result = buildResult({
            actionResults: [
                {
                    action: TASKS,
                    output: [],
                    durationMs: 1,
                    error: null,
                },
            ],
        });

        expect(getTrickyDadReportChatIds(result, 'Tricky Dad Telegram chat')).toEqual([
            'tasks-chat',
            'tricky-dad-chat',
        ]);
    });

    it('sends a command fallback to the tasks chat, where failures are watched', () => {
        expect(getTrickyDadReportChatIds(buildResult({ isCommandFallback: true }), 'Alisa')).toEqual(['tasks-chat']);
    });
});

describe('isTrickyDadCommandFailed', () => {
    it('does not count an LLM provider fallback as a failure', () => {
        const result = buildResult({
            llmProvider: 'openrouter',
            llmAttempts: [
                {
                    provider: 'llm-server',
                    durationMs: 90000,
                    error: 'timed out',
                },
                {
                    provider: 'openrouter',
                    durationMs: 900,
                    error: null,
                },
            ],
        });

        expect(isTrickyDadCommandFailed(result)).toBe(false);
    });

    it('counts a failed action as a failure', () => {
        const result = buildResult({
            actionResults: [
                {
                    action: SHOPPING,
                    output: [],
                    durationMs: 1,
                    error: '❌ Failed to run add_shopping_items: down',
                },
            ],
        });

        expect(isTrickyDadCommandFailed(result)).toBe(true);
    });
});

describe('formatTrickyDadReport', () => {
    it('lists the entries of every action and the LLM attempts', () => {
        const text = formatTrickyDadReport({
            command: 'купи хлеб, папа позвонит в банк',
            source: 'Tricky Dad Telegram chat',
            durationSeconds: '9.10',
            result: buildResult({
                llmProvider: 'openrouter',
                llmAttempts: [
                    {
                        provider: 'llm-server',
                        durationMs: 90000,
                        error: 'llm-server request timed out after 90000ms',
                    },
                    {
                        provider: 'openrouter',
                        durationMs: 900,
                        error: null,
                    },
                ],
                actionResults: [
                    {
                        action: SHOPPING,
                        output: [],
                        durationMs: 120,
                        error: null,
                    },
                    {
                        action: TASKS,
                        output: ['<found> 1'],
                        durationMs: 300,
                        error: null,
                    },
                ],
            }),
        });

        expect(text).toContain('🛒 <b>Хлеб</b>');
        expect(text).toContain('👉 <b>Позвонить в банк</b>\n&lt;found&gt; 1');
        expect(text).toContain('📍 Куда: 🛒 add_shopping_items, 👉 add_tasks');
        expect(text).toContain('🤖 LLM: llm-server 90000ms ❌ → openrouter 900ms ✅');
        expect(text).toContain('❌ llm-server: llm-server request timed out after 90000ms');
        expect(text).toContain('🗄️ add_tasks: 300ms');
    });

    it('marks command fallback entries with ❌', () => {
        const text = formatTrickyDadReport({
            command: 'привет',
            source: 'Tricky Dad Telegram chat',
            durationSeconds: '1.00',
            result: buildResult({
                isCommandFallback: true,
                error: '❌ LLM: Это приветствие',
            }),
        });

        expect(text).toContain('❌ <b>Хлеб</b>');
        expect(text).toContain('📍 Куда: ❌ command fallback → 🛒 add_shopping_items');
        expect(text).toContain('❌ LLM: Это приветствие');
    });
});
