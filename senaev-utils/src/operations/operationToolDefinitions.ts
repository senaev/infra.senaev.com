import {
    READ_ONLY_ANNOTATIONS, type ToolDefinition,
} from '../toolServer/toolDefinition';

import type { OperationToolName } from './operationCommands';
import { DEFAULT_TIMEOUT_SECONDS, OBSERVATION_MS } from './operationLimits';

export const MANAGED_TOOL_PROPERTIES = {
    executionPolicy: {
        type: 'string',
        enum: [
            'queued',
            'parallel',
        ],
        description: 'Default: queued (one running, five waiting). parallel starts immediately outside FIFO, with no additional concurrency limit. Both policies use the same observation, timeout, cancellation and retry contract. Parallel work may observe intermediate filesystem state or race with mutations.',
    },
    timeoutSeconds: {
        type: 'integer',
        minimum: 1,
        description: `Execution timeout in seconds, excluding queue waiting. Default: ${DEFAULT_TIMEOUT_SECONDS}. No API maximum.`,
    },
    requestId: {
        type: 'string',
        minLength: 1,
        maxLength: 200,
        description: 'Optional retry key. Identical arguments reuse the operation while its record remains in this backend process. Restart or expiration loses deduplication; inspect side effects before retrying a mutation.',
    },
};

export function createManagedToolDescription(prefix: string): string {
    return [
        `If idle, starts execution and observes for up to ${OBSERVATION_MS / 1000} seconds: returns the final result/error or an operation handle.`,
        'executionPolicy defaults to queued: if busy, immediately returns a queued handle; one FIFO operation runs and at most five wait. QUEUE_FULL means no operation was admitted.',
        `executionPolicy parallel starts independently of FIFO and observes for up to ${OBSERVATION_MS / 1000} seconds, without an additional concurrency limit. It does not guarantee a consistent filesystem snapshot or serialize conflicting mutations.`,
        `An accepted handle is not completion. Poll ${prefix}operation_status, then ${prefix}operation_result; wait for completed before dependent commands.`,
        `Use ${prefix}operation_cancel to stop queued or running work. timeoutSeconds defaults to ${DEFAULT_TIMEOUT_SECONDS} and excludes queue waiting; it has no API maximum.`,
        'Operations and requestId deduplication live only in memory. Restart loses IDs, logs, results and queued work; old IDs return not_found and work is never replayed.',
    ].join(' ');
}

const ID_PROPERTY = {
    id: {
        type: 'string',
        minLength: 1,
        description: 'The opaque operation ID returned by this backend. Never use an OS PID.',
    },
};
const CURSOR_PROPERTY = {
    cursor: {
        type: 'integer',
        minimum: 0,
        description: 'Replayable log cursor. Default: 0. Continue from nextCursor; logsTruncated and firstAvailableCursor report discarded output.',
    },
};

export const OPERATION_TOOL_DEFINITIONS = {
    operations: {
        title: 'List recent operations',
        description: 'Lists every active operation and up to 100 retained terminal operations in this backend process, newest first. Includes state, effective timeout and timestamps. Bypasses the execution queue. Restart loses every record.',
        inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
        },
        annotations: READ_ONLY_ANNOTATIONS,
    },
    operation_status: {
        title: 'Read operation status and logs',
        description: 'Immediately returns operation state and a bounded page of stdout/stderr with replayable cursors. Bypasses the queue and never consumes output globally. Respect operation.pollAfterMs between polls. This observation does not cancel execution when disconnected.',
        inputSchema: {
            type: 'object',
            properties: {
                ...ID_PROPERTY,
                ...CURSOR_PROPERTY,
            },
            required: ['id'],
            additionalProperties: false,
        },
        annotations: READ_ONLY_ANNOTATIONS,
    },
    operation_result: {
        title: 'Retrieve an operation result',
        description: 'Immediately returns current state and a log page; includes the retained final result when available. Check operation.state for completed, failed, cancelled, timed_out or interrupted. Small results use result; large results use resultJson, nextOffset and totalChars. Concatenate resultJson pages before parsing JSON. Retention is bounded; results are snapshots. Bypasses the queue.',
        inputSchema: {
            type: 'object',
            properties: {
                ...ID_PROPERTY,
                ...CURSOR_PROPERTY,
                offset: {
                    type: 'integer',
                    minimum: 0,
                    description: 'Character offset in serialized result JSON. Default: 0. Continue from nextOffset until null.',
                },
            },
            required: ['id'],
            additionalProperties: false,
        },
        annotations: READ_ONLY_ANNOTATIONS,
    },
    operation_cancel: {
        title: 'Cancel an operation',
        description: 'Requests cancellation outside the queue. Queued work never starts; running work retains its slot until cooperative cleanup and subprocess termination finish. Poll until terminal. Repeating cancellation is safe. Cancellation does not undo completed filesystem changes.',
        inputSchema: {
            type: 'object',
            properties: ID_PROPERTY,
            required: ['id'],
            additionalProperties: false,
        },
        annotations: {
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: true,
            openWorldHint: false,
        },
    },
} as const satisfies Record<OperationToolName, ToolDefinition>;

export {
    isOperationToolName, readOperationArguments, type OperationToolName,
} from './operationCommands';
