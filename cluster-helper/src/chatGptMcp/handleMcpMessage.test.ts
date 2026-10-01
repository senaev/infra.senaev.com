import {
    describe, expect, it, vi,
} from 'vitest';

import { formatDiaryEntry } from './formatDiaryEntry';
import { handleMcpMessage } from './handleMcpMessage';

const PATH = '@senaev/daily_note_draft.md';

function request(method: string, params?: unknown) {
    return {
        jsonrpc: '2.0',
        id: 1,
        method,
        ...params !== undefined && { params },
    };
}

describe('handleMcpMessage', () => {
    it('negotiates the requested protocol version on initialize', async () => {
        const response = await handleMcpMessage(request('initialize', { protocolVersion: '2025-03-26' }), vi.fn());

        expect(response).toMatchObject({
            id: 1,
            result: {
                protocolVersion: '2025-03-26',
                capabilities: { tools: {} },
            },
        });
    });

    it('returns no response for a notification', async () => {
        expect(await handleMcpMessage({
            jsonrpc: '2.0',
            method: 'notifications/initialized',
        }, vi.fn())).toBeNull();
    });

    it('lists the single upsert_diary_entry tool', async () => {
        const response = await handleMcpMessage(request('tools/list'), vi.fn());

        expect(response).toMatchObject({ result: { tools: [{ name: 'upsert_diary_entry' }] } });
    });

    it('saves the entry and returns the date and path', async () => {
        const save = vi.fn().mockResolvedValue(PATH);
        const response = await handleMcpMessage(request('tools/call', {
            name: 'upsert_diary_entry',
            arguments: {
                date: '2026-09-28',
                title: 'Monday, September 28',
                content: 'Full edited diary entry text',
            },
        }), save);

        expect(save).toHaveBeenCalledWith({
            date: '2026-09-28',
            title: 'Monday, September 28',
            content: 'Full edited diary entry text',
        });
        expect(response).toMatchObject({
            result: {
                isError: false,
                structuredContent: {
                    date: '2026-09-28',
                    path: PATH,
                },
            },
        });
    });

    it('reports invalid arguments as a tool error without saving', async () => {
        const save = vi.fn();
        const response = await handleMcpMessage(request('tools/call', {
            name: 'upsert_diary_entry',
            arguments: {
                date: '28.09.2026',
                content: 'text',
            },
        }), save);

        expect(save).not.toHaveBeenCalled();
        expect(response).toMatchObject({ result: { isError: true } });
    });

    it('rejects an unknown tool and an unknown method', async () => {
        expect(await handleMcpMessage(request('tools/call', { name: 'other' }), vi.fn()))
            .toMatchObject({ error: { code: -32602 } });
        expect(await handleMcpMessage(request('resources/list'), vi.fn()))
            .toMatchObject({ error: { code: -32601 } });
    });
});

describe('formatDiaryEntry', () => {
    it('puts the date and the title in the heading', () => {
        expect(formatDiaryEntry({
            date: '2026-09-28',
            title: 'Monday, September 28',
            content: 'Text',
        })).toBe('# 2026-09-28 Monday, September 28\n\nText');
    });

    it('uses only the date when there is no title', () => {
        expect(formatDiaryEntry({
            date: '2026-09-28',
            title: undefined,
            content: 'Text',
        })).toBe('# 2026-09-28\n\nText');
    });
});
