export type OperationErrorCode = 'QUEUE_FULL' | 'unknown_tool';

/** An expected routing or admission failure, independent of HTTP. */
export class OperationError extends Error {
    public readonly details = undefined;

    public constructor(public readonly code: OperationErrorCode, message: string) {
        super(message);
    }
}
