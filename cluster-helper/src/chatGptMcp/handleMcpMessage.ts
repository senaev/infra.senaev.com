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

const TOOL_NAME = 'upsert_diary_entry';

const JSON_RPC_INVALID_REQUEST = -32600;
const JSON_RPC_METHOD_NOT_FOUND = -32601;
const JSON_RPC_INVALID_PARAMS = -32602;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const UPSERT_DIARY_ENTRY_TOOL = {
    name: TOOL_NAME,
    title: 'Save diary entry',
    description: 'Saves the full final diary entry for a day into the owner\'s Obsidian vault.',
    inputSchema: {
        type: 'object',
        properties: {
            date: {
                type: 'string',
                pattern: '^\\d{4}-\\d{2}-\\d{2}$',
                description: 'Day of the entry in ISO format YYYY-MM-DD, e.g. 2026-09-28',
            },
            title: {
                type: 'string',
                description: 'Optional but preferred title, e.g. "Monday, September 28"',
            },
            content: {
                type: 'string',
                description: 'Full final diary entry text for that day',
            },
        },
        required: [
            'date',
            'content',
        ],
        additionalProperties: false,
    },
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
    },
};

export type DiaryEntry = {
    date: string;
    title: string | undefined;
    content: string;
};

/** Writes the entry and returns the vault-relative path it went to. */
export type SaveDiaryEntry = (entry: DiaryEntry) => Promise<string>;

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

export function parseDiaryEntry(args: unknown): DiaryEntry | string {
    if (!isObject(args)) {
        return 'Arguments must be an object';
    }

    const {
        date, title, content,
    } = args;

    if (typeof date !== 'string' || !ISO_DAY.test(date)) {
        return 'Field "date" is required and must be in YYYY-MM-DD format';
    }

    if (title !== undefined && title !== null && typeof title !== 'string') {
        return 'Field "title" must be a string';
    }

    if (typeof content !== 'string' || content.trim() === '') {
        return 'Field "content" is required and must be a non-empty string';
    }

    return {
        date,
        title: typeof title === 'string' && title.trim() !== '' ? title.trim() : undefined,
        content: content.trim(),
    };
}

async function callTool(params: unknown, saveDiaryEntry: SaveDiaryEntry) {
    if (!isObject(params) || params.name !== TOOL_NAME) {
        return null;
    }

    const entry = parseDiaryEntry(params.arguments);

    if (typeof entry === 'string') {
        return toolResult(entry, true);
    }

    const path = await saveDiaryEntry(entry);

    return toolResult(`Saved diary entry for ${entry.date} to ${path}`, false, {
        date: entry.date,
        path,
    });
}

/**
 * Handles one JSON-RPC message. Returns `null` for notifications, which per the transport
 * spec get `202 Accepted` with no body.
 */
export async function handleMcpMessage(message: unknown, saveDiaryEntry: SaveDiaryEntry): Promise<JsonRpcResponse | null> {
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
        return success(id, { tools: [UPSERT_DIARY_ENTRY_TOOL] });
    case 'tools/call': {
        const result = await callTool(params, saveDiaryEntry);

        return result === null
            ? failure(id, JSON_RPC_INVALID_PARAMS, `Unknown tool, the only one is "${TOOL_NAME}"`)
            : success(id, result);
    }

    default:
        return failure(id, JSON_RPC_METHOD_NOT_FOUND, `Method not found: ${method}`);
    }
}
