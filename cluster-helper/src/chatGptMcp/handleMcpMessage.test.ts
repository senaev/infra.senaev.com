import {
    describe, expect, it, vi,
} from 'vitest';

import { handleMcpMessage, type McpToolHandlers } from './handleMcpMessage';
import { OBSIDIAN_TOOLS } from './obsidianTools';

function request(method: string, params?: unknown) {
    return {
        jsonrpc: '2.0',
        id: 1,
        method,
        ...params !== undefined && { params },
    };
}

function handlers(overrides: Partial<McpToolHandlers> = {}): McpToolHandlers {
    return {
        callVaultTool: vi.fn(),
        ...overrides,
    };
}

describe('handleMcpMessage', () => {
    it('negotiates the requested protocol version on initialize', async () => {
        const response = await handleMcpMessage(request('initialize', { protocolVersion: '2025-03-26' }), handlers());

        expect(response).toMatchObject({
            id: 1,
            result: {
                protocolVersion: '2025-03-26',
                capabilities: { tools: {} },
            },
        });
    });

    it('initializes without calling obsidian-sync', async () => {
        const callVaultTool = vi.fn();
        const response = await handleMcpMessage(request('initialize'), handlers({ callVaultTool }));

        expect(callVaultTool).not.toHaveBeenCalled();
        expect(response).not.toHaveProperty('result.instructions');
    });

    it('returns no response for a notification', async () => {
        expect(await handleMcpMessage({
            jsonrpc: '2.0',
            method: 'notifications/initialized',
        }, handlers())).toBeNull();
    });

    it('lists every Obsidian tool, each with the auth policy and the AGENTS.md fallback', async () => {
        const securitySchemes = [{ type: 'oauth2' }];
        const response = await handleMcpMessage(request('tools/list'), handlers(), { securitySchemes });
        const { tools } = (response as {
            result: { tools: { name: string; description: string; securitySchemes: unknown }[] };
        }).result;

        expect(tools.map((tool) => tool.name)).toEqual([
            'obsidian-list',
            'obsidian-search',
            'obsidian-read',
            'obsidian-links',
            'obsidian-create',
            'obsidian-patch',
            'obsidian-diary_append',
        ]);
        expect(tools.every((tool) => tool.securitySchemes === securitySchemes)).toBe(true);
        expect(tools.every((tool) => tool.description.includes('read AGENTS.md with obsidian-read'))).toBe(true);
    });

    it('uses only tool names that OpenAI function calling accepts', () => {
        for (const tool of OBSIDIAN_TOOLS) {
            expect(tool.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
        }
    });

    it('rejects an unknown tool, the removed save_diary_text, and an unknown method', async () => {
        expect(await handleMcpMessage(request('tools/call', { name: 'other' }), handlers()))
            .toMatchObject({ error: { code: -32602 } });
        expect(await handleMcpMessage(request('tools/call', { name: 'save_diary_text' }), handlers()))
            .toMatchObject({ error: { code: -32602 } });
        expect(await handleMcpMessage(request('resources/list'), handlers()))
            .toMatchObject({ error: { code: -32601 } });
    });
});

describe('Obsidian tool proxy', () => {
    it('forwards each obsidian- tool to the vault tool of the same name with the arguments unchanged', async () => {
        const callVaultTool = vi.fn().mockResolvedValue({
            isError: false,
            body: { status: 'ok' },
        });

        for (const tool of OBSIDIAN_TOOLS) {
            const args = {
                any: ['thing'],
                tool: tool.name,
            };

            await handleMcpMessage(request('tools/call', {
                name: tool.name,
                arguments: args,
            }), handlers({ callVaultTool }));

            expect(callVaultTool).toHaveBeenLastCalledWith(tool.name.slice('obsidian-'.length), args);
        }

        expect(callVaultTool).toHaveBeenCalledTimes(OBSIDIAN_TOOLS.length);
    });

    it('sends empty arguments as an empty object', async () => {
        const callVaultTool = vi.fn().mockResolvedValue({
            isError: false,
            body: { status: 'ok' },
        });

        await handleMcpMessage(request('tools/call', { name: 'obsidian-list' }), handlers({ callVaultTool }));

        expect(callVaultTool).toHaveBeenCalledWith('list', {});
    });

    it('returns the vault reply as structured content and as its JSON text', async () => {
        const body = {
            status: 'ok',
            entries: [{ path: 'Note.md' }],
        };
        const response = await handleMcpMessage(request('tools/call', {
            name: 'obsidian-list',
            arguments: {},
        }), handlers({
            callVaultTool: vi.fn().mockResolvedValue({
                isError: false,
                body,
            }),
        }));

        expect(response).toMatchObject({
            result: {
                isError: false,
                structuredContent: body,
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(body),
                    },
                ],
            },
        });
    });

    it('passes a vault error through as a tool error with its message and details', async () => {
        const body = {
            status: 'error',
            code: 'conflict',
            message: 'The note changed since it was read',
            details: { currentHash: 'abc' },
        };
        const response = await handleMcpMessage(request('tools/call', {
            name: 'obsidian-patch',
            arguments: {},
        }), handlers({
            callVaultTool: vi.fn().mockResolvedValue({
                isError: true,
                body,
            }),
        }));

        expect(response).toMatchObject({
            result: {
                isError: true,
                structuredContent: body,
            },
        });
    });

    it('turns an unreachable obsidian-sync into a tool error, not a protocol error', async () => {
        const response = await handleMcpMessage(request('tools/call', {
            name: 'obsidian-search',
            arguments: { queries: ['x'] },
        }), handlers({ callVaultTool: vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')) }));

        expect(response).toMatchObject({
            result: {
                isError: true,
                content: [{ text: expect.stringContaining('connect ECONNREFUSED') }],
            },
        });
    });

    it('does not forward an obsidian- name that is not a known tool', async () => {
        const callVaultTool = vi.fn();
        const response = await handleMcpMessage(request('tools/call', { name: 'obsidian-delete' }), handlers({ callVaultTool }));

        expect(callVaultTool).not.toHaveBeenCalled();
        expect(response).toMatchObject({ error: { code: -32602 } });
    });
});
