import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';

import type { CommandExecution } from '../commands/CommandExecution';

import {
    buildFileDiff, FILE_DIFF_OPTIONS, type FileDiff,
} from './createFileDiff';

// Diff can be quadratic. Run it in a disposable worker so the backend event loop,
// deadline and cancellation endpoints stay responsive; wait for termination on abort.
export async function createFileDiffAsync(path: string, before: string, after: string, execution: CommandExecution): Promise<FileDiff> {
    execution.throwIfAborted();
    const { signal } = execution;
    const worker = new Worker(`
        const { parentPort, workerData } = require('node:worker_threads');
        const { createTwoFilesPatch } = require(workerData.module);
        const build = eval('(' + workerData.build + ')');
        parentPort.postMessage(build(createTwoFilesPatch, { path: workerData.path,
            before: workerData.before, after: workerData.after }, workerData.options));
    `, {
        eval: true,
        execArgv: [],
        workerData: {
            module: createRequire(__filename).resolve('diff'),
            build: buildFileDiff.toString(),
            options: FILE_DIFF_OPTIONS,
            path,
            before,
            after,
        },
    });

    try {
        return await new Promise<FileDiff>((resolve, reject) => {
            const abort = () => reject(signal.reason);
            const cleanup = () => signal.removeEventListener('abort', abort);

            worker.once('message', (result: FileDiff) => {
                cleanup();
                resolve(result);
            });
            worker.once('error', (error) => {
                cleanup();
                reject(error);
            });
            worker.once('exit', (code) => {
                cleanup();
                reject(new Error(`Diff worker exited before returning a result (code ${code})`));
            });
            signal.addEventListener('abort', abort, { once: true });
            if (signal.aborted) {
                abort();
            }
        });
    } finally {
        await worker.terminate();
    }
}
