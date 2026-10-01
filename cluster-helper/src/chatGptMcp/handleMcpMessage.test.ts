import {
    describe, expect, it, vi,
} from 'vitest';

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

    it('lists the single save_diary_text tool', async () => {
        const response = await handleMcpMessage(request('tools/list'), vi.fn());

        expect(response).toMatchObject({ result: { tools: [{ name: 'save_diary_text' }] } });
    });

    it('saves the text unchanged and returns the path', async () => {
        const save = vi.fn().mockResolvedValue(PATH);
        const response = await handleMcpMessage(request('tools/call', {
            name: 'save_diary_text',
            arguments: { text: '  Сегодня был хороший день.\n\nМы гуляли.  ' },
        }), save);

        expect(save).toHaveBeenCalledWith('Сегодня был хороший день.\n\nМы гуляли.');
        expect(response).toMatchObject({
            result: {
                isError: false,
                structuredContent: { path: PATH },
            },
        });
    });

    it('reports empty text as a tool error without saving', async () => {
        const save = vi.fn();
        const response = await handleMcpMessage(request('tools/call', {
            name: 'save_diary_text',
            arguments: { text: '   ' },
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
