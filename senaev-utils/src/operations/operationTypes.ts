export type ExecutionPolicy = 'queued' | 'parallel';
export type OperationState = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timed_out' | 'interrupted';

export type OperationView = {
    id: string;
    backend: string;
    tool: string;
    state: OperationState;
    queuedAt: number;
    startedAt: number | null;
    updatedAt: number;
    timeoutSeconds: number;
    executionPolicy: ExecutionPolicy;
    changedPaths: string[];
    pollAfterMs: number;
};

export type OperationLog = { cursor: number; stream: 'stdout' | 'stderr'; text: string };
export type OperationLaunchReply = Record<string, unknown> & { operation: OperationView };
export type OperationObservation = {
    operation: OperationView;
    logs: OperationLog[];
    nextCursor: number;
    firstAvailableCursor: number;
    logsTruncated: boolean;
    result?: Record<string, unknown>;
    resultJson?: string;
    nextOffset?: number | null;
    totalChars?: number;
};

export function isTerminalOperation(state: OperationState): boolean {
    return state !== 'queued' && state !== 'running';
}
