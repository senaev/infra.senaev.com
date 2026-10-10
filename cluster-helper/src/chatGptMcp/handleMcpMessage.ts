import { isObject } from 'senaev-utils/src/types/Object/Object';
import { stringifyUnknownError } from 'senaev-utils/src/utils/Error/stringifyUnknownError/stringifyUnknownError';

import { logger } from '../logger';

import {
    findTool, listMcpTools, type ToolFamily, type ToolReply,
} from './toolFamilies';

// A minimal stateless MCP server over Streamable HTTP: every JSON-RPC request gets a plain
// `application/json` response, so there are no sessions and no SSE streams to manage.
// https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#streamable-http

const SUPPORTED_PROTOCOL_VERSIONS = [
    '2025-06-18',
    '2025-03-26',
    '2024-11-05',
];
const LATEST_PROTOCOL_VERSION = '2025-06-18';

const JSON_RPC_INVALID_REQUEST = -32600;
const JSON_RPC_METHOD_NOT_FOUND = -32601;
const JSON_RPC_INVALID_PARAMS = -32602;

export type McpServerOptions = {
    /** Per-tool auth policy that ChatGPT reads to show its account linking UI. */
    securitySchemes?: readonly Record<string, unknown>[];
};

type JsonRpcId = string | number | null;

export type JsonRpcResponse = {
    jsonrpc: '2.0';
    id: JsonRpcId;
} & ({ result: unknown } | { error: { code: number; message: string } });

function success(id: JsonRpcId, result: unknown): JsonRpcResponse {
    return {
        jsonrpc: '2.0',
        id,
        result,
    };
}

function failure(id: JsonRpcId, code: number, message: string): JsonRpcResponse {
    return {
        jsonrpc: '2.0',
        id,
        error: {
            code,
            message,
        },
    };
}

function toolResult(text: string, isError: boolean, structuredContent?: Record<string, unknown>) {
    return {
        content: [
            {
                type: 'text',
                text,
            },
        ],
        ...structuredContent && { structuredContent },
        isError,
    };
}

/**
 * Forwards the call unchanged and returns the backend reply as both structured content and
 * its JSON text, as the MCP spec recommends for structured results. A failed transport
 * becomes a tool error too, so ChatGPT can tell the user instead of retrying blind.
 */
async function forwardToolCall(family: ToolFamily, toolName: string, args: unknown) {
    let reply: ToolReply;

    try {
        reply = await family.call(toolName, args ?? {});
    } catch (error) {
        logger.error({
            err: error,
            tool: `${family.prefix}${toolName}`,
        }, '❌ Failed to call a backend tool');

        return toolResult(`${family.backendName} is not available right now: ${stringifyUnknownError(error)}`, true);
    }

    return toolResult(JSON.stringify(reply.body), reply.isError, reply.body);
}

function callTool(params: unknown, families: readonly ToolFamily[]) {
    const found = isObject(params) ? findTool(families, params.name) : null;

    return found === null || !isObject(params)
        ? null
        : forwardToolCall(found.family, found.toolName, params.arguments);
}

/** What to log about one message: never the arguments, which hold the diary text. */
export function describeMcpExchange(message: unknown, response: JsonRpcResponse | null) {
    const request = isObject(message) ? message : {};
    const params = isObject(request.params) ? request.params : {};

    return {
        method: request.method,
        tool: params.name,
        protocolVersion: params.protocolVersion,
        clientInfo: params.clientInfo,
        error: response !== null && 'error' in response ? response.error : undefined,
        isToolError: response !== null && 'result' in response && isObject(response.result)
            ? response.result.isError
            : undefined,
    };
}

/**
 * Handles one JSON-RPC message. Returns `null` for notifications, which per the transport
 * spec get `202 Accepted` with no body.
 */
export async function handleMcpMessage(
    message: unknown,
    families: readonly ToolFamily[],
    { securitySchemes }: McpServerOptions = {}
): Promise<JsonRpcResponse | null> {
    if (!isObject(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
        return failure(null, JSON_RPC_INVALID_REQUEST, 'Invalid JSON-RPC message');
    }

    const {
        id, method, params,
    } = message;

    if (id === undefined) {
        return null;
    }

    if (typeof id !== 'string' && typeof id !== 'number') {
        return failure(null, JSON_RPC_INVALID_REQUEST, 'Invalid JSON-RPC id');
    }

    switch (method) {
    case 'initialize': {
        const requested = isObject(params) ? params.protocolVersion : undefined;
        const protocolVersion = typeof requested === 'string' && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
            ? requested
            : LATEST_PROTOCOL_VERSION;

        return success(id, {
            protocolVersion,
            capabilities: { tools: {} },
            serverInfo: {
                name: 'senaev-diary',
                version: '1.0.0',
            },
        });
    }

    case 'ping':
        return success(id, {});
    case 'tools/list':
        return success(id, {
            tools: listMcpTools(families).map((tool) => {
                return {
                    ...tool,
                    ...securitySchemes && { securitySchemes },
                };
            }),
        });
    case 'tools/call': {
        const result = await callTool(params, families);

        return result === null
            ? failure(id, JSON_RPC_INVALID_PARAMS, `Unknown tool, the tools are: ${listMcpTools(families).map((tool) => tool.name).join(', ')}`)
            : success(id, result);
    }

    default:
        return failure(id, JSON_RPC_METHOD_NOT_FOUND, `Method not found: ${method}`);
    }
}
