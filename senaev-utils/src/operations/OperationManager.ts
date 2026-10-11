import { createHash, randomUUID } from 'node:crypto';
import {
    mkdir, readdir, readFile, rename, unlink, writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

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

/** Single backend executor. Admission and persistence are serialized; control calls bypass FIFO. */
export class OperationManager {
    private readonly entries = new Map<string, Entry>();
    private readonly queue: Entry[] = [];
    private active: Entry | undefined;
    private lock: Promise<void> = Promise.resolve();
    private readonly ready: Promise<void>;
    private unavailable = false;
    private closing = false;

    public constructor(private readonly directory: string, private readonly backend: string) {
        this.ready = this.recover();
        void this.ready.catch(() => undefined);
    }

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
        await this.ready;
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
        const admitted = await this.exclusive(async () => {
            if (this.unavailable || this.closing) {
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

            await this.prune();
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

            await this.persist(data);
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
        await this.ready;
        if (name === 'operations') {
            return { operations: [...this.entries.values()].reverse().slice(0, MAX_RECORDS).map((entry) => this.view(entry.data)) };
        }

        const entry = this.entries.get(String(args.id));

        if (entry === undefined) {
            throw new ToolError('not_found', 'Operation not found in this backend');
        }

        if (name === 'operation_cancel') {
            await this.exclusive(async () => {
                if (entry.data.state === 'queued') {
                    this.queue.splice(this.queue.indexOf(entry), 1);
                    entry.data.state = 'cancelled';
                    entry.data.updatedAt = Date.now();
                    entry.data.result = {
                        status: 'error',
                        code: 'cancelled',
                        message: 'Cancelled before execution',
                    };
                    await this.persist(entry.data);
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
        await this.ready;
        this.closing = true;
        this.active?.controller.abort(new Error('interrupted'));
        await this.active?.done;
        await this.lock;
    }

    private exclusive<T>(run: () => Promise<T>): Promise<T> {
        const next = this.lock.then(run);

        this.lock = next.then(() => undefined, () => undefined);

        return next;
    }

    private async persist(data: RecordData): Promise<void> {
        const path = join(this.directory, `${data.id}.json`);
        const temporary = `${path}.tmp`;

        await writeFile(temporary, JSON.stringify(data), { mode: 0o600 });
        await rename(temporary, path);
    }

    private async recover(): Promise<void> {
        await mkdir(this.directory, {
            recursive: true,
            mode: 0o700,
        });
        for (const filename of await readdir(this.directory)) {
            if (!filename.startsWith(`${this.backend}-`) || !filename.endsWith('.json')) {
                continue;
            }

            const data = JSON.parse(await readFile(join(this.directory, filename), 'utf8')) as RecordData;

            if (`${data.id}.json` !== filename) {
                throw new Error('Invalid operation state filename');
            }

            if (!terminal(data.state)) {
                data.state = 'interrupted';
                data.updatedAt = Date.now();
                data.result = {
                    status: 'error',
                    code: 'interrupted',
                    message: 'Backend restarted; operation was not replayed',
                };
                await this.persist(data);
            }

            this.entries.set(data.id, {
                data,
                controller: new AbortController(),
                run: () => Promise.resolve({}),
                done: Promise.resolve(),
                finish: () => undefined,
            });
        }

        await this.prune();
    }

    private async prune(): Promise<void> {
        const finished = [...this.entries.values()].filter((entry) => terminal(entry.data.state))
            .sort((a, b) => b.data.updatedAt - a.data.updatedAt);

        for (const [
            index,
            entry,
        ] of finished.entries()) {
            if (index < MAX_RECORDS && Date.now() - entry.data.updatedAt < RETENTION_MS) {
                continue;
            }

            await unlink(join(this.directory, `${entry.data.id}.json`));
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
        let logTimer: ReturnType<typeof setTimeout> | undefined;
        let persistenceFailure: unknown;
        const changedPaths = new Set<string>();
        const persistLogs = () => {
            logTimer = undefined;
            void this.exclusive(() => this.persist(data)).catch((error: unknown) => {
                persistenceFailure = error;
                this.unavailable = true;
                controller.abort(new Error('Operation storage failed'));
            });
        };

        try {
            data.state = 'running';
            data.startedAt = Date.now();
            data.updatedAt = data.startedAt;
            await this.exclusive(() => this.persist(data));
            stopDeadline = scheduleDeadline(data.timeoutSeconds, () => controller.abort(new Error('timed_out')));
            const result = await withOperationContext({
                signal: controller.signal,
                changedPaths,
                log: (stream, text) => {
                    OperationManager.appendLog(data, stream, text);
                    if (logTimer === undefined) {
                        logTimer = setTimeout(persistLogs, 250);
                    }
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
            clearTimeout(logTimer);
            data.changedPaths = [...changedPaths];
            data.updatedAt = Date.now();
            try {
                await this.exclusive(() => this.persist(data));
                if (persistenceFailure !== undefined) {
                    this.unavailable = true;
                }
            } catch {
                this.unavailable = true;
                data.state = 'interrupted';
                data.result = {
                    status: 'error',
                    code: 'storage_failed',
                    message: 'Operation result could not be persisted',
                };
            }

            entry.finish();
            await this.exclusive(async () => {
                this.active = undefined;
                if (!this.unavailable && !this.closing) {
                    const next = this.queue.shift();

                    if (next !== undefined) {
                        this.active = next;
                        void this.execute(next);
                    }
                }

                await this.prune();
            }).catch(() => {
                this.unavailable = true;
            });
        }
    }
}
