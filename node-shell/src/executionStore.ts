import {
    link, mkdir, readdir, readFile, rename, rm, stat, writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

import type { ExecutionRecord } from './executionRecord';

export type ExecutionStore = {
    /** Creates the record only if none exists for its ID; returns whether it created it. */
    create: (record: ExecutionRecord) => Promise<boolean>;
    read: (executionId: string) => Promise<ExecutionRecord | undefined>;
    update: (record: ExecutionRecord) => Promise<void>;
    list: () => Promise<ExecutionRecord[]>;
    /** Deletes the records whose file is older than `maxAgeMs`; returns how many. */
    removeOlderThan: (maxAgeMs: number, now: Date) => Promise<number>;
};

const SUFFIX = '.json';

function isAlreadyExists(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'EEXIST';
}

function isNotFound(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/**
 * One JSON file per execution, in a host directory that survives restarts of the pod. Every
 * write goes to a temporary file first, so a record is never half written. `create` links the
 * temporary file to the final name, which fails when the name exists: of two requests with the
 * same ID only one starts the command, also across restarts. The files hold the output, so the
 * directory is readable only by root on the host.
 */
export async function createExecutionStore(directory: string): Promise<ExecutionStore> {
    await mkdir(directory, {
        recursive: true,
        mode: 0o700,
    });

    let temporaryCounter = 0;
    const pathOf = (executionId: string) => join(directory, `${executionId}${SUFFIX}`);
    const writeTemporary = async (record: ExecutionRecord): Promise<string> => {
        temporaryCounter += 1;

        const path = join(directory, `.${record.executionId}.${process.pid}.${temporaryCounter}.tmp`);

        await writeFile(path, JSON.stringify(record), { mode: 0o600 });

        return path;
    };

    const read = async (executionId: string): Promise<ExecutionRecord | undefined> => {
        try {
            return JSON.parse(await readFile(pathOf(executionId), 'utf8')) as ExecutionRecord;
        } catch (error) {
            if (isNotFound(error)) {
                return undefined;
            }

            throw error;
        }
    };

    return {
        async create(record) {
            const temporary = await writeTemporary(record);

            try {
                await link(temporary, pathOf(record.executionId));

                return true;
            } catch (error) {
                if (isAlreadyExists(error)) {
                    return false;
                }

                throw error;
            } finally {
                await rm(temporary, { force: true });
            }
        },
        read,
        async update(record) {
            await rename(await writeTemporary(record), pathOf(record.executionId));
        },
        async list() {
            const names = (await readdir(directory)).filter((name) => name.endsWith(SUFFIX) && !name.startsWith('.'));
            const records = await Promise.all(names.map((name) => read(name.slice(0, -SUFFIX.length))));

            return records.filter((record) => record !== undefined);
        },
        async removeOlderThan(maxAgeMs, now) {
            let removed = 0;

            for (const name of await readdir(directory)) {
                const path = join(directory, name);

                try {
                    if (now.getTime() - (await stat(path)).mtimeMs > maxAgeMs) {
                        await rm(path, { force: true });
                        removed += 1;
                    }
                } catch (error) {
                    if (!isNotFound(error)) {
                        throw error;
                    }
                }
            }

            return removed;
        },
    };
}
