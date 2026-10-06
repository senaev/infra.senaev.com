import { isObject } from 'senaev-utils/src/types/Object/Object';

// A minimal stateless MCP server over Streamable HTTP: every JSON-RPC request gets a plain
// `application/json` response, so there are no sessions and no SSE streams to manage.
// https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#streamable-http

const SUPPORTED_PROTOCOL_VERSIONS = [
    '2025-06-18',
    '2025-03-26',
    '2024-11-05',
];
const LATEST_PROTOCOL_VERSION = '2025-06-18';

const TOOL_NAME = 'save_diary_text';

const JSON_RPC_INVALID_REQUEST = -32600;
const JSON_RPC_METHOD_NOT_FOUND = -32601;
const JSON_RPC_INVALID_PARAMS = -32602;

// ChatGPT reads these instructions to decide what to send, so they are the only place
// where the "edit lightly, do not compose" rules can be enforced.
const EDITING_RULES = [
    'Send only the text the user has just written, as a new separate record.',
    'Do not combine it with earlier messages or earlier records, and do not summarize or rewrite it.',
    'Do not add a date, a title, a heading or any other text of your own.',
    'You may only fix typos and grammatical errors, and split the text into sentences and paragraphs.',
    'Keep the original language of the text; never translate it.',
].join(' ');

const ORDER_RULE = 'First write the edited text in your reply to the user, and only then call this tool with exactly that text.';
const CONFIRMATION_RULE = 'Do not repeat the text. Reply only with a short confirmation that contains the path.';

const SAVE_DIARY_TEXT_TOOL = {
    name: TOOL_NAME,
    title: 'Save diary text',
    description: `Appends a piece of text to the owner's diary draft in the Obsidian vault. ${EDITING_RULES} ${ORDER_RULE}`,
    inputSchema: {
        type: 'object',
        properties: {
            text: {
                type: 'string',
                description: `The text the user wrote. ${EDITING_RULES}`,
            },
        },
        required: ['text'],
        additionalProperties: false,
    },
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
    },
};

/** Writes the text and returns the vault-relative path it went to. */
export type SaveDiaryText = (text: string) => Promise<string>;

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

async function callTool(params: unknown, saveDiaryText: SaveDiaryText) {
    if (!isObject(params) || params.name !== TOOL_NAME) {
        return null;
    }

    const text = isObject(params.arguments) ? params.arguments.text : undefined;

    if (typeof text !== 'string' || text.trim() === '') {
        return toolResult('Field "text" is required and must be a non-empty string', true);
    }

    const path = await saveDiaryText(text.trim());

    return toolResult(`Saved to ${path}. ${CONFIRMATION_RULE}`, false, { path });
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
    saveDiaryText: SaveDiaryText,
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
            tools: [
                {
                    ...SAVE_DIARY_TEXT_TOOL,
                    ...securitySchemes && { securitySchemes },
                },
            ],
        });
    case 'tools/call': {
        const result = await callTool(params, saveDiaryText);

        return result === null
            ? failure(id, JSON_RPC_INVALID_PARAMS, `Unknown tool, the only one is "${TOOL_NAME}"`)
            : success(id, result);
    }

    default:
        return failure(id, JSON_RPC_METHOD_NOT_FOUND, `Method not found: ${method}`);
    }
}
