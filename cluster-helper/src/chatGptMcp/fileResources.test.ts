import {
    expect, it, vi,
} from 'vitest';
import { vaultFileResourceUri } from 'senaev-utils/src/obsidianVaultTools/vaultFileResource';

import { handleMcpMessage, describeMcpExchange } from './handleMcpMessage';
import { createToolFamilies } from './toolFamilies';

const uri = vaultFileResourceUri('payslips/a.pdf', 'a'.repeat(64));
const resource = {
    type: 'resource_link',
    uri,
    name: 'a.pdf',
    mimeType: 'application/pdf',
    size: 3,
};
const request = (method: string, params: unknown) => {
    return {
        jsonrpc: '2.0',
        id: 1,
        method,
        params,
    };
};

it('preserves download resource links on direct and deferred completion', async () => {
    const callVaultTool = vi.fn().mockResolvedValue({
        isError: false,
        body: {
            status: 'ok',
            resource,
        },
    });
    const families = createToolFamilies({
        callVaultTool,
        callCodeTool: vi.fn(),
    });

    expect(await handleMcpMessage(request('tools/call', {
        name: 'obsidian-download',
        arguments: { path: 'payslips/a.pdf' },
    }), families))
        .toMatchObject({ result: { content: expect.arrayContaining([resource]) } });
    callVaultTool.mockResolvedValue({
        isError: false,
        body: {
            status: 'ok',
            operation: {
                tool: 'download',
                state: 'completed',
            },
            result: { resource },
        },
    });
    expect(await handleMcpMessage(request('tools/call', {
        name: 'obsidian-operation_result',
        arguments: { id: 'id' },
    }), families))
        .toMatchObject({ result: { content: expect.arrayContaining([resource]) } });
});

it('reads binary resources without copying base64 into text or structured results', async () => {
    const contents = [
        {
            uri,
            mimeType: 'application/pdf',
            blob: 'AP+A',
        },
    ];
    const readVaultResource = vi.fn().mockResolvedValue({
        isError: false,
        body: {
            status: 'ok',
            contents,
        },
    });
    const families = createToolFamilies({
        callVaultTool: vi.fn(),
        callCodeTool: vi.fn(),
        readVaultResource,
    });
    const { signal } = new AbortController();
    const response = await handleMcpMessage(request('resources/read', { uri }), families, { signal });

    expect(readVaultResource).toHaveBeenCalledWith(uri, signal);

    expect(response).toEqual({
        jsonrpc: '2.0',
        id: 1,
        result: { contents },
    });
    expect(describeMcpExchange(request('resources/read', { uri }), response)).not.toHaveProperty('arguments', { uri });
    expect(await handleMcpMessage(request('initialize', {}), families)).toMatchObject({ result: { capabilities: { resources: {} } } });
});

it('rejects foreign URIs before backend access and sanitizes transport errors', async () => {
    const readVaultResource = vi.fn().mockRejectedValue(new Error('internal-secret-address'));
    const families = createToolFamilies({
        callVaultTool: vi.fn(),
        callCodeTool: vi.fn(),
        readVaultResource,
    });

    expect(await handleMcpMessage(request('resources/read', { uri: 'https://evil.test/a' }), families)).toHaveProperty('error');
    expect(readVaultResource).not.toHaveBeenCalled();
    const response = await handleMcpMessage(request('resources/read', { uri }), families);

    expect(response).toHaveProperty('error');
    expect(JSON.stringify(response)).not.toContain('internal-secret-address');
});
