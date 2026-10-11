import { setTimeout as pause } from 'node:timers/promises';

import {
    isTerminalOperation, type OperationLaunchReply, type OperationObservation,
} from '../operationTypes';

type Control = (args: { id: string; offset?: number }) => Promise<OperationObservation>;

/** Test clients must resolve handles and every result page before dependent calls. */
export async function completeOperation<T extends OperationLaunchReply>(first: T, control: Control): Promise<T> {
    if (isTerminalOperation(first.operation.state)) {
        return first;
    }

    const retained = await awaitOperation(first.operation.id, control);

    return {
        ...first,
        ...retained.result,
        operation: retained.operation,
    };
}

export async function awaitOperation(id: string, control: Control): Promise<OperationObservation> {
    let retained = await control({ id });

    for (let attempt = 0; attempt < 200 && !isTerminalOperation(retained.operation.state); attempt++) {
        await pause(100);
        retained = await control({ id });
    }

    if (!isTerminalOperation(retained.operation.state)) {
        throw new Error(`Operation ${id} did not finish within the test budget`);
    }

    if (retained.resultJson !== undefined) {
        let serialized = retained.resultJson;
        let offset = retained.nextOffset;

        while (offset !== null && offset !== undefined) {
            const page = await control({
                id,
                offset,
            });

            if (page.resultJson === undefined || page.nextOffset === offset) {
                throw new Error('Invalid retained result page');
            }

            serialized += page.resultJson;
            offset = page.nextOffset;
        }

        retained.result = JSON.parse(serialized) as Record<string, unknown>;
    }

    if (retained.result === undefined) {
        throw new Error(`Terminal operation ${id} has no retained result`);
    }

    return retained;
}
