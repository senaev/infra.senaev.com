import { createHash, randomUUID } from 'node:crypto';

import { ToolError, invalidArguments } from '../toolServer/ToolError';
import { scheduleDeadline } from '../utils/process/scheduleDeadline';

import { withOperationContext } from './operationContext';
import { DEFAULT_TIMEOUT_SECONDS, OBSERVATION_MS } from './operationLimits';
import {
    isTerminalOperation as terminal, type ExecutionPolicy, type OperationLog as LogEntry, type OperationState as State, type OperationView, type OperationLaunchReply,
} from './operationTypes';

export { DEFAULT_TIMEOUT_SECONDS, OBSERVATION_MS } from './operationLimits';
const MAX_LOG_CHARS = 128_000;
const PAGE_CHARS = 30_000;
const MAX_RESULT_CHARS = 1_000_000;
const MAX_RECORDS = 100;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export type { ExecutionPolicy } from './operationTypes';

type RecordData = {
    id: string;
    tool: string;
    requestId?: string;
    fingerprint: string;
    state: State;
    queuedAt: number;
    startedAt?: number;
    updatedAt: number;
    timeoutSeconds: number;
    executionPolicy: ExecutionPolicy;
    resultJson?: string;
    changedPaths: string[];
    logs: LogEntry[];
    nextCursor: number;
    logChars: number;
    logHead: number;
    truncated: boolean;
};

type Entry = {
    data: RecordData;
    controller: AbortController;
    run: () => Promise<Record<string, unknown>>;
    done: Promise<void>;
    finish: () => void;
};

function serializeResult(result: Record<string, unknown>, reportFailure: (error: unknown) => void): string {
    let serialized: string;

    try {
        serialized = JSON.stringify(result);
    } catch (error) {
        reportFailure(error);

        return JSON.stringify({
            status: 'error',
            code: 'internal_error',
            message: 'Result cannot be serialized',
        });
    }

    return serialized.length <= MAX_RESULT_CHARS
        ? serialized
        : JSON.stringify({
            status: 'error',
            code: 'command_failed',
            message: 'Result exceeds retained result quota; narrow the query',
        });
}

/** Canonical JSON makes request retries independent of object key order. */
function canonical(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(canonical).join(',')}]`;
    }

    if (value !== null && typeof value === 'object') {
        return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
            .map(([
                key,
                item,
            ]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
    }

    return JSON.stringify(value) ?? 'null';
}

export function executionTimeout(value: unknown): number {
    if (value === undefined) {
        return DEFAULT_TIMEOUT_SECONDS;
    }

    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
        throw invalidArguments('timeoutSeconds must be a positive integer number of seconds');
    }

    return value;
}

/** Backend executor with FIFO and independent parallel admission. Admission is serialized; state lives only in memory; control calls bypass FIFO. */
export class OperationManager {
    private readonly entries = new Map<string, Entry>();
    private readonly queue: Entry[] = [];
    private active: Entry | undefined;
    private readonly parallel = new Set<Entry>();
    private lock: Promise<void> = Promise.resolve();
    private closing = false;

    public constructor(
        private readonly backend: string,
        private readonly reportError?: (error: unknown, operation: { id: string; backend: string; tool: string }) => void
    ) {}

    private static appendLog(data: RecordData, stream: 'stdout' | 'stderr', text: string): void {
        // Cursors are text positions: polling a packed chunk can resume inside it.
        for (let offset = 0; offset < text.length;) {
            const last = data.logs.at(-1);
            const append = last?.stream === stream && last.text.length < PAGE_CHARS;
            const length = Math.min(text.length - offset, append ? PAGE_CHARS - last.text.length : PAGE_CHARS);
            const part = text.slice(offset, offset + length);

            if (append) {
                last.text += part;
            } else {
                data.logs.push({
                    cursor: data.nextCursor,
                    stream,
                    text: part,
                });
            }

            data.nextCursor += length;
            data.logChars += length;
            offset += length;
        }

        while (data.logChars > MAX_LOG_CHARS) {
            const first = data.logs[data.logHead];

            if (first === undefined) {
                break;
            }

            const removed = Math.min(data.logChars - MAX_LOG_CHARS, first.text.length);

            if (removed === first.text.length) {
                data.logHead++;
            } else {
                first.text = first.text.slice(removed);
                first.cursor += removed;
            }

            data.logChars -= removed;
            data.truncated = true;
        }

        if (data.logHead > data.logs.length / 2) {
            data.logs = data.logs.slice(data.logHead);
            data.logHead = 0;
        }

        data.updatedAt = Date.now();
    }

    public async launch(options: {
        tool: string; args: Record<string, unknown>; run: () => Promise<Record<string, unknown>>;
    }): Promise<OperationLaunchReply> {
        const {
            tool, args, run,
        } = options;
        const timeoutSeconds = executionTimeout(args.timeoutSeconds);
        const executionPolicy = args.executionPolicy === undefined ? 'queued' : args.executionPolicy;

        if (executionPolicy !== 'queued' && executionPolicy !== 'parallel') {
            throw invalidArguments('executionPolicy must be queued or parallel');
        }

        const { requestId } = args;

        if (requestId !== undefined && (typeof requestId !== 'string' || requestId.length === 0 || requestId.length > 200)) {
            throw invalidArguments('requestId must be a nonempty string of at most 200 characters');
        }

        const fingerprint = createHash('sha256').update(canonical({
            tool,
            args,
        })).digest('hex');
        const admitted = await this.exclusive(() => {
            if (this.closing) {
                throw new ToolError('conflict', 'Operation executor unavailable');
            }

            this.prune();
            if (requestId !== undefined) {
                const duplicate = [...this.entries.values()].find((entry) => entry.data.requestId === requestId);

                if (duplicate !== undefined) {
                    if (duplicate.data.fingerprint !== fingerprint) {
                        throw new ToolError('conflict', 'requestId was already used with different arguments');
                    }

                    return {
                        entry: duplicate,
                        observe: false,
                    };
                }
            }

            if (executionPolicy === 'queued' && this.active !== undefined && this.queue.length >= 5) {
                throw new ToolError('QUEUE_FULL', 'Five operations are already waiting; retry after a slot is free');
            }

            const data: RecordData = {
                id: `${this.backend}-${randomUUID()}`,
                tool,
                fingerprint,
                state: 'queued',
                queuedAt: Date.now(),
                updatedAt: Date.now(),
                timeoutSeconds,
                executionPolicy,
                changedPaths: [],
                logs: [],
                nextCursor: 0,
                logChars: 0,
                logHead: 0,
                truncated: false,
                ...typeof requestId === 'string' && { requestId },
            };
            let finish: () => void = () => undefined;
            const done = new Promise<void>((resolve) => {
                finish = resolve;
            });
            const entry: Entry = {
                data,
                controller: new AbortController(),
                run,
                done,
                finish,
            };

            this.entries.set(data.id, entry);
            const observe = executionPolicy === 'parallel' || this.active === undefined;

            if (executionPolicy === 'parallel') {
                this.parallel.add(entry);
                void this.execute(entry);
            } else if (observe) {
                this.active = entry;
                void this.execute(entry);
            } else {
                this.queue.push(entry);
            }

            return {
                entry,
                observe,
            };
        });

        if (admitted.observe) {
            let timer: ReturnType<typeof setTimeout> | undefined;

            await Promise.race([
                admitted.entry.done,
                new Promise<void>((resolve) => {
                    timer = setTimeout(resolve, OBSERVATION_MS);
                }),
            ]);
            clearTimeout(timer);
        }

        const { data } = admitted.entry;

        if (terminal(data.state) && data.resultJson !== undefined) {
            return {
                ...JSON.parse(data.resultJson) as Record<string, unknown>,
                operation: this.view(data),
            };
        }

        return {
            status: 'ok',
            operation: this.view(data),
        };
    }

    public async control(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
        this.prune();
        if (name === 'operations') {
            // Retention bounds terminal history; active work must always be discoverable.
            return { operations: [...this.entries.values()].reverse().map((entry) => this.view(entry.data)) };
        }

        const entry = this.entries.get(String(args.id));

        if (entry === undefined) {
            throw new ToolError('not_found', 'Operation not found in this backend');
        }

        const cursor = args.cursor ?? 0;

        if (typeof cursor !== 'number' || !Number.isInteger(cursor) || cursor < 0 || cursor > entry.data.nextCursor) {
            throw invalidArguments('cursor must be an integer from 0 to nextCursor');
        }

        if (name === 'operation_cancel') {
            await this.exclusive(() => {
                if (entry.data.state === 'queued') {
                    this.queue.splice(this.queue.indexOf(entry), 1);
                    entry.data.state = 'cancelled';
                    entry.data.updatedAt = Date.now();
                    entry.data.resultJson = JSON.stringify({
                        status: 'error',
                        code: 'cancelled',
                        message: 'Cancelled before execution',
                    });
                    entry.run = () => Promise.resolve({});
                    entry.finish();
                } else if (entry.data.state === 'running') {
                    entry.controller.abort(new Error('cancelled'));
                }
            });
        }

        const logs: LogEntry[] = [];
        let nextCursor = Math.max(cursor, entry.data.logs[entry.data.logHead]?.cursor ?? entry.data.nextCursor);
        let chars = 2;

        for (let index = entry.data.logHead; index < entry.data.logs.length; index++) {
            const log = entry.data.logs[index];

            if (log === undefined) {
                break;
            }

            const start = Math.max(nextCursor, log.cursor);
            const remaining = log.text.slice(start - log.cursor);

            if (remaining.length === 0) {
                continue;
            }

            const overhead = JSON.stringify({
                cursor: start,
                stream: log.stream,
                text: '',
            }).length + 1;
            const budget = PAGE_CHARS - chars - overhead;
            let length = Math.min(remaining.length, Math.max(0, budget));

            // Use the existing page quota for JSON metadata and escaped text too.
            while (length > 0 && JSON.stringify(remaining.slice(0, length)).length - 2 > budget) {
                length = Math.floor(length / 2);
            }

            if (length === 0) {
                break;
            }

            const item = {
                cursor: start,
                stream: log.stream,
                text: remaining.slice(0, length),
            };

            logs.push(item);
            chars += JSON.stringify(item).length + 1;
            nextCursor = start + length;
            if (length < remaining.length) {
                break;
            }
        }

        const response: Record<string, unknown> = {
            operation: this.view(entry.data),
            logs,
            nextCursor,
            firstAvailableCursor: entry.data.logs[entry.data.logHead]?.cursor ?? entry.data.nextCursor,
            logsTruncated: entry.data.truncated,
        };

        if (name === 'operation_result' && entry.data.resultJson !== undefined) {
            const serialized = entry.data.resultJson;
            const offset = args.offset ?? 0;

            if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0 || offset > serialized.length) {
                throw invalidArguments('offset must be an integer within the serialized result');
            }

            if (serialized.length <= PAGE_CHARS) {
                response.result = JSON.parse(serialized) as Record<string, unknown>;
            } else {
                response.resultJson = serialized.slice(offset, offset + PAGE_CHARS);
                response.nextOffset = offset + PAGE_CHARS < serialized.length ? offset + PAGE_CHARS : null;
                response.totalChars = serialized.length;
            }
        }

        return response;
    }

    public async close(): Promise<void> {
        this.closing = true;
        for (const entry of this.queue.splice(0)) {
            entry.data.state = 'cancelled';
            entry.run = () => Promise.resolve({});
            entry.finish();
        }

        const running = [
            ...this.parallel,
            ...this.active !== undefined ? [this.active] : [],
        ];

        for (const entry of running) {
            entry.controller.abort(new Error('interrupted'));
        }

        await Promise.all(running.map((entry) => entry.done));
        await this.lock;
        this.entries.clear();
    }

    private exclusive<T>(run: () => T | Promise<T>): Promise<T> {
        const next = this.lock.then(run);

        this.lock = next.then(() => undefined, () => undefined);

        return next;
    }

    private prune(): void {
        const finished = [...this.entries.values()].filter((entry) => terminal(entry.data.state)).reverse()
            .sort((a, b) => b.data.updatedAt - a.data.updatedAt);

        for (const [
            index,
            entry,
        ] of finished.entries()) {
            if (index < MAX_RECORDS && Date.now() - entry.data.updatedAt < RETENTION_MS) {
                continue;
            }

            this.entries.delete(entry.data.id);
        }
    }

    private view(data: RecordData): OperationView {
        return {
            id: data.id,
            backend: this.backend,
            tool: data.tool,
            state: data.state,
            queuedAt: data.queuedAt,
            startedAt: data.startedAt ?? null,
            updatedAt: data.updatedAt,
            timeoutSeconds: data.timeoutSeconds,
            executionPolicy: data.executionPolicy,
            changedPaths: data.changedPaths,
            pollAfterMs: terminal(data.state) ? 0 : 1000,
        };
    }

    private reportFailure(error: unknown, data: RecordData): void {
        try {
            this.reportError?.(error, {
                id: data.id,
                backend: this.backend,
                tool: data.tool,
            });
        } catch {
            // Diagnostic failures must not prevent terminal state or cleanup.
        }
    }

    private async execute(entry: Entry): Promise<void> {
        const { data, controller } = entry;
        let stopDeadline: () => void = () => undefined;
        const changedPaths = new Set<string>();

        try {
            data.state = 'running';
            data.startedAt = Date.now();
            data.updatedAt = data.startedAt;
            stopDeadline = scheduleDeadline(data.timeoutSeconds, () => controller.abort(new Error('timed_out')));
            const result = await withOperationContext({
                signal: controller.signal,
                changedPaths,
                log: (stream, text) => {
                    OperationManager.appendLog(data, stream, text);
                },
            }, entry.run);

            controller.signal.throwIfAborted();
            data.resultJson = serializeResult(result, (error) => this.reportFailure(error, data));
            const retained = JSON.parse(data.resultJson) as Record<string, unknown>;

            data.state = retained.status === 'error' || Object.hasOwn(retained, 'exitCode') && retained.exitCode !== 0 ? 'failed' : 'completed';
        } catch (error) {
            if (controller.signal.aborted) {
                const { reason } = controller.signal;

                data.state = 'cancelled';
                if (reason instanceof Error && (reason.message === 'timed_out' || reason.message === 'interrupted')) {
                    data.state = reason.message;
                }

                data.resultJson = JSON.stringify({
                    status: 'error',
                    code: data.state,
                    message: `Operation ${data.state}`,
                });
            } else if (error instanceof ToolError) {
                data.state = 'failed';
                data.resultJson = serializeResult({
                    status: 'error',
                    code: error.code,
                    message: error.message,
                    ...error.details !== undefined && { details: error.details },
                }, (serializationError) => this.reportFailure(serializationError, data));
            } else {
                this.reportFailure(error, data);

                data.state = 'failed';
                data.resultJson = JSON.stringify({
                    status: 'error',
                    code: 'internal_error',
                    message: 'Operation failed; inspect backend logs',
                });
            }
        } finally {
            stopDeadline();
            data.changedPaths = [...changedPaths];
            data.updatedAt = Date.now();
            entry.run = () => Promise.resolve({});
            entry.finish();
            await this.exclusive(() => {
                if (data.executionPolicy === 'parallel') {
                    this.parallel.delete(entry);
                } else {
                    this.active = undefined;
                }

                if (data.executionPolicy === 'queued' && !this.closing) {
                    const next = this.queue.shift();

                    if (next !== undefined) {
                        this.active = next;
                        void this.execute(next);
                    }
                }

                this.prune();
            });
        }
    }
}
