import { Milliseconds } from '../types/Time/Milliseconds';

import { AbortableProcess } from './AbortableProcess';

export function promiseTimeout(timeoutMs: Milliseconds, {
    abortable,
}: {
    abortable?: AbortableProcess;
} = {}): Promise<void> {
    return new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
            if (abortable) {
                abortable.unsubscribe(clearTimeoutId);
            }

            resolve();
        }, timeoutMs);

        const clearTimeoutId = () => {
            clearTimeout(timeoutId);
        };

        if (abortable) {
            abortable.subscribeAbort(clearTimeoutId);
        }
    });
}
