import {
    afterEach, describe, expect, it, vi,
} from 'vitest';

import { callCodeTool } from './codeToolsApi';

vi.mock('./env', () => {
    return {
        CODE_TOOLS_URL: 'http://code-tools:8080',
        INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS: 'internal-test',
    };
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('code operation proxy', () => {
    it('forwards managed launches and controls with a bounded observation transport timeout', async () => {
        const timeout = vi.spyOn(AbortSignal, 'timeout');
        const body = {
            status: 'ok',
            operation: {
                id: 'code-id',
                state: 'queued',
            },
        };
        const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(body))));

        vi.stubGlobal('fetch', fetchMock);
        for (const name of [
            'projects',
            'run',
            'list',
            'search',
            'clone',
            'read',
            'write',
            'patch',
            'operations',
            'operation_status',
            'operation_result',
            'operation_cancel',
        ]) {
            let args: Record<string, unknown> = { id: 'code-id' };

            if (name === 'run') {
                args = {
                    project: 'demo',
                    command: 'true',
                    timeoutSeconds: 10800,
                    requestId: 'retry',
                };
            } else if (name === 'list' || name === 'search') {
                args = {
                    project: 'demo',
                    timeoutSeconds: 10800,
                    requestId: 'retry',
                    ...name === 'search' ? { queries: ['needle'] } : {},
                };
            } else if (name === 'projects') {
                args = {
                    timeoutSeconds: 10800,
                    requestId: 'retry',
                };
            }

            expect(await callCodeTool(name, args)).toEqual({
                isError: false,
                body,
            });
            expect(timeout).toHaveBeenLastCalledWith(15000);
            expect(fetchMock).toHaveBeenLastCalledWith(`http://code-tools:8080/code/${name}`, expect.objectContaining({
                method: 'POST',
                body: JSON.stringify(args),
                headers: expect.objectContaining({ authorization: 'Bearer internal-test' }),
            }));
        }

        await callCodeTool('clone', { url: 'git@example.com:demo.git' });
        expect(timeout).toHaveBeenLastCalledWith(15000);
    });

    it('preserves QUEUE_FULL as a tool error rather than a transport failure', async () => {
        const body = {
            status: 'error',
            code: 'QUEUE_FULL',
            message: 'Queue full',
        };

        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status: 429 }))));
        expect(await callCodeTool('projects', {})).toEqual({
            isError: true,
            body,
        });
    });
});
