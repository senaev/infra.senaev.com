import { UnixTimeMs } from '../types/Time/UnixTimeMs';

import { createIncrementalIntegerGenerator } from './createIncrementalIntegerGenerator';
import { callFunctions } from './Function/callFunctions/callFunctions';
import { Latch, LatchCallback } from './Latch/Latch';
import { PositiveInteger } from './Number/PositiveInteger';
import { UnsignedInteger } from './Number/UnsignedInteger';
import { Signal } from './Signal';

export type AbortableProcessAbortReason = string | undefined;

export type VisualizedProcessesTree = {
    name: string;
    id: UnsignedInteger;
    status: string | undefined;
    startTimestamp: UnixTimeMs;
    children: VisualizedProcessesTree[];
};

export type VisualizedProcessesTreeChangeAdd = {
    type: 'add';
    id: PositiveInteger;
    name: string;
    startTimestamp: UnixTimeMs;
    parentId: PositiveInteger;
};

export type VisualizedProcessesTreeChangeStatus = {
    type: 'status';
    id: PositiveInteger;
    status: string | undefined;
};
export type VisualizedProcessesTreeChangeDelete = {
    type: 'delete';
    id: PositiveInteger;
};

export type VisualizedProcessesTreeChange =
    | VisualizedProcessesTreeChangeAdd
    | VisualizedProcessesTreeChangeStatus
    | VisualizedProcessesTreeChangeDelete;

export type VisualizedProcessesTreeChangeCallback = (change: VisualizedProcessesTreeChange) => void;

const incrementalIntegerGenerator = createIncrementalIntegerGenerator();

export type AbortableProcessStatus = string;

export class AbortableProcess {
    public readonly id = incrementalIntegerGenerator();

    private readonly abortLatch = new Latch<AbortableProcessAbortReason>();
    private readonly children = new Set<AbortableProcess>();
    private readonly startTimestamp: UnixTimeMs = Date.now();

    private _status = new Signal<AbortableProcessStatus>('');
    private _visualizedProcessesTreeSubscribers = new Set<VisualizedProcessesTreeChangeCallback>();

    public constructor(private readonly name: string) {
        this.abortLatch.subscribe(() => {
            this.dispatchVisualizedProcessesTreeChange({
                type: 'delete',
                id: this.id,
            });
        });

        this._status.subscribe((nextStatus) => {
            this.dispatchVisualizedProcessesTreeChange({
                type: 'status',
                id: this.id,
                status: nextStatus,
            });
        });
    }

    public isAborted(): boolean {
        return this.abortLatch.isDispatched();
    }

    public abort(reason: AbortableProcessAbortReason): void {
        this.abortLatch.dispatch(reason);
    }

    public subscribeAbort(callback: LatchCallback<AbortableProcessAbortReason>): VoidFunction {
        return this.abortLatch.subscribe(callback);
    }

    public unsubscribe(callback: LatchCallback<AbortableProcessAbortReason>): void {
        this.abortLatch.unsubscribe(callback);
    }

    public setStatus(status: AbortableProcessStatus): void {
        this._status.next(status);
    }

    public child({
        name,
        parentNewStatus,
    }: {
        name: string;
        parentNewStatus?: AbortableProcessStatus;
    }): AbortableProcess {
        const childProcess = new AbortableProcess(name);

        if (parentNewStatus) {
            this.setStatus(parentNewStatus);
        }

        this.abortLatch.subscribe(() => {
            childProcess.abort('PARENT_ABORT');
        });

        childProcess.subscribeVisualizedProcessesTreeChange(this.dispatchVisualizedProcessesTreeChange);

        this.children.add(childProcess);
        this.dispatchVisualizedProcessesTreeChange({
            type: 'add',
            id: childProcess.id,
            name,
            parentId: this.id,
            startTimestamp: childProcess.startTimestamp,
        });

        childProcess.subscribeAbort(() => {
            this.children.delete(childProcess);
        });

        return childProcess;
    }

    public subscribeVisualizedProcessesTreeChange(callback: VisualizedProcessesTreeChangeCallback): VoidFunction {
        this._visualizedProcessesTreeSubscribers.add(callback);

        return () => {
            this._visualizedProcessesTreeSubscribers.delete(callback);
        };
    }

    private readonly dispatchVisualizedProcessesTreeChange = (change: VisualizedProcessesTreeChange): void => {
        callFunctions(this._visualizedProcessesTreeSubscribers, change);
    };

    public toJSON(): VisualizedProcessesTree {
        const result: VisualizedProcessesTree = {
            name: this.name,
            id: this.id,
            status: this._status.value(),
            startTimestamp: this.startTimestamp,
            children: Array.from(
                this.children.values(),
                (process) => process.toJSON()
            ),
        };

        return result;
    }
}
