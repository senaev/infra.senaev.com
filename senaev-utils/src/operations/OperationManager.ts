import { createHash, randomUUID } from 'node:crypto';

import { ToolError, invalidArguments } from '../toolServer/ToolError';

import { scheduleDeadline, withOperationContext } from './operationContext';

export const OBSERVATION_MS = 5000;
export const DEFAULT_TIMEOUT_SECONDS = 60;
const MAX_LOG_CHARS = 128_000;
const PAGE_CHARS = 30_000;
const MAX_RESULT_CHARS = 4_000_000;
const MAX_RECORDS = 100;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

type State = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timed_out' | 'interrupted';

type LogEntry = { cursor: number; stream: 'stdout' | 'stderr'; text: string };

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
    result?: Record<string, unknown>;
    changedPaths: string[];
    logs: LogEntry[];
    nextCursor: number;
    truncated: boolean;
};

type Entry = {
    data: RecordData;
    controller: AbortController;
    run: () => Promise<Record<string, unknown>>;
    done: Promise<void>;
    finish: () => void;
};

const terminal = (state: State) => state !== 'queued' && state !== 'running';

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

/** Single backend executor. Admission is serialized; state lives only in memory; control calls bypass FIFO. */
export class OperationManager {
    private readonly entries = new Map<string, Entry>();
    private readonly queue: Entry[] = [];
    private active: Entry | undefined;
    private lock: Promise<void> = Promise.resolve();
    private closing = false;

    public constructor(private readonly backend: string) {}

    private static appendLog(data: RecordData, stream: 'stdout' | 'stderr', text: string): void {
        for (let offset = 0; offset < text.length; offset += PAGE_CHARS) {
            data.logs.push({
                cursor: data.nextCursor++,
                stream,
                text: text.slice(offset, offset + PAGE_CHARS),
            });
        }

        let size = data.logs.reduce((sum, entry) => sum + entry.text.length, 0);

        while (size > MAX_LOG_CHARS) {
            size -= data.logs.shift()?.text.length ?? 0;
            data.truncated = true;
        }

        data.updatedAt = Date.now();
    }

    public async launch(options: {
        tool: string; args: Record<string, unknown>; run: () => Promise<Record<string, unknown>>;
    }): Promise<Record<string, unknown>> {
        const {
            tool, args, run,
        } = options;
        const timeoutSeconds = executionTimeout(args.timeoutSeconds);
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

            if (this.active !== undefined && this.queue.length >= 5) {
                throw new ToolError('QUEUE_FULL', 'Five operations are already waiting; retry after a slot is free');
            }

            this.prune();
            const data: RecordData = {
                id: `${this.backend}-${randomUUID()}`,
                tool,
                fingerprint,
                state: 'queued',
                queuedAt: Date.now(),
                updatedAt: Date.now(),
                timeoutSeconds,
                changedPaths: [],
                logs: [],
                nextCursor: 0,
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
            const observe = this.active === undefined;

            if (observe) {
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

        if (terminal(data.state) && data.result !== undefined) {
            return {
                ...data.result,
                operation: this.view(data),
            };
        }

        return {
            status: 'ok',
            operation: this.view(data),
        };
    }

    public async control(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
        if (name === 'operations') {
            return { operations: [...this.entries.values()].reverse().slice(0, MAX_RECORDS).map((entry) => this.view(entry.data)) };
        }

        const entry = this.entries.get(String(args.id));

        if (entry === undefined) {
            throw new ToolError('not_found', 'Operation not found in this backend');
        }

        if (name === 'operation_cancel') {
            await this.exclusive(() => {
                if (entry.data.state === 'queued') {
                    this.queue.splice(this.queue.indexOf(entry), 1);
                    entry.data.state = 'cancelled';
                    entry.data.updatedAt = Date.now();
                    entry.data.result = {
                        status: 'error',
                        code: 'cancelled',
                        message: 'Cancelled before execution',
                    };
                    entry.run = () => Promise.resolve({});
                    entry.finish();
                } else if (entry.data.state === 'running') {
                    entry.controller.abort(new Error('cancelled'));
                }
            });
        }

        const cursor = args.cursor ?? 0;

        if (typeof cursor !== 'number' || !Number.isInteger(cursor) || cursor < 0 || cursor > entry.data.nextCursor) {
            throw invalidArguments('cursor must be an integer from 0 to nextCursor');
        }

        const logs: LogEntry[] = [];
        let chars = 0;

        for (const log of entry.data.logs) {
            if (log.cursor >= cursor && chars + log.text.length <= PAGE_CHARS) {
                logs.push(log);
                chars += log.text.length;
            } else if (log.cursor >= cursor) {
                break;
            }
        }

        const nextCursor = logs.length > 0 ? (logs[logs.length - 1]?.cursor ?? cursor) + 1 : Math.max(cursor, entry.data.logs[0]?.cursor ?? entry.data.nextCursor);
        const response: Record<string, unknown> = {
            operation: this.view(entry.data),
            logs,
            nextCursor,
            firstAvailableCursor: entry.data.logs[0]?.cursor ?? entry.data.nextCursor,
            logsTruncated: entry.data.truncated,
        };

        if (name === 'operation_result' && entry.data.result !== undefined) {
            const serialized = JSON.stringify(entry.data.result);
            const offset = args.offset ?? 0;

            if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0 || offset > serialized.length) {
                throw invalidArguments('offset must be an integer within the serialized result');
            }

            if (serialized.length <= PAGE_CHARS) {
                response.result = entry.data.result;
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

        this.active?.controller.abort(new Error('interrupted'));
        await this.active?.done;
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

    private view(data: RecordData): Record<string, unknown> {
        return {
            id: data.id,
            backend: this.backend,
            tool: data.tool,
            state: data.state,
            queuedAt: data.queuedAt,
            startedAt: data.startedAt ?? null,
            updatedAt: data.updatedAt,
            timeoutSeconds: data.timeoutSeconds,
            changedPaths: data.changedPaths,
            pollAfterMs: terminal(data.state) ? 0 : 1000,
        };
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
            if (JSON.stringify(result).length > MAX_RESULT_CHARS) {
                throw new ToolError('command_failed', 'Result exceeds retained result quota; narrow the query');
            }

            data.result = result;
            data.state = result.status === 'error' || typeof result.exitCode === 'number' && result.exitCode !== 0 ? 'failed' : 'completed';
        } catch (error) {
            if (controller.signal.aborted) {
                const { reason } = controller.signal;

                data.state = 'cancelled';
                if (reason instanceof Error && (reason.message === 'timed_out' || reason.message === 'interrupted')) {
                    data.state = reason.message;
                }

                data.result = {
                    status: 'error',
                    code: data.state,
                    message: `Operation ${data.state}`,
                };
            } else if (error instanceof ToolError) {
                data.state = 'failed';
                data.result = {
                    status: 'error',
                    code: error.code,
                    message: error.message,
                    ...error.details !== undefined && { details: error.details },
                };
            } else {
                data.state = 'failed';
                data.result = {
                    status: 'error',
                    code: 'internal_error',
                    message: 'Operation failed; inspect backend logs',
                };
            }
        } finally {
            stopDeadline();
            data.changedPaths = [...changedPaths];
            data.updatedAt = Date.now();
            entry.run = () => Promise.resolve({});
            entry.finish();
            await this.exclusive(() => {
                this.active = undefined;
                if (!this.closing) {
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
