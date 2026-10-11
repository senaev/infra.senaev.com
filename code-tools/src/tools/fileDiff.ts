import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';

import { operationContext, throwIfOperationAborted } from 'senaev-utils/src/operations/operationContext';
import type { FileDiff } from 'senaev-utils/src/toolServer/createFileDiff';

// Diff can be quadratic. Run it in a disposable worker so the backend event loop,
// deadline and cancellation endpoints stay responsive; wait for termination on abort.
export async function fileDiff(path: string, before: string, after: string): Promise<FileDiff> {
    throwIfOperationAborted();
    const signal = operationContext()?.signal;
    const worker = new Worker(`
        const { parentPort, workerData } = require('node:worker_threads');
        const { createTwoFilesPatch } = require(workerData.module);
        const patch = createTwoFilesPatch('a/' + workerData.path, 'b/' + workerData.path,
            workerData.before, workerData.after, undefined, undefined, { context: 3 })
            .replace(/^=+\\n/, '');
        parentPort.postMessage({ diff: patch.slice(0, 20000), diffTruncated: patch.length > 20000 });
    `, {
        eval: true,
        execArgv: [],
        workerData: {
            module: createRequire(__filename).resolve('diff', {
                paths: [createRequire(__filename).resolve('senaev-utils/package.json')],
            }),
            path,
            before,
            after,
        },
    });

    try {
        return await new Promise<FileDiff>((resolve, reject) => {
            const abort = () => reject(signal?.reason);
            const cleanup = () => signal?.removeEventListener('abort', abort);

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
            signal?.addEventListener('abort', abort, { once: true });
            if (signal?.aborted) {
                abort();
            }
        });
    } finally {
        await worker.terminate();
    }
}
