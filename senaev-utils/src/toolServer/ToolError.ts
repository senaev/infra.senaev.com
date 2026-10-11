export type ToolErrorCode =
    | 'invalid_arguments'
    | 'unknown_tool'
    | 'forbidden_path'
    | 'not_found'
    | 'already_exists'
    | 'conflict'
    | 'ambiguous'
    | 'command_failed'
    | 'QUEUE_FULL';

const HTTP_STATUS_BY_CODE: Record<ToolErrorCode, number> = {
    QUEUE_FULL: 429,
    invalid_arguments: 400,
    unknown_tool: 404,
    forbidden_path: 403,
    not_found: 404,
    already_exists: 409,
    conflict: 409,
    ambiguous: 409,
    command_failed: 422,
};

/** An expected command failure with a message safe to return to its caller. */
export class ToolError extends Error {
    public readonly code: ToolErrorCode;
    public readonly details: Record<string, unknown> | undefined;

    public constructor(code: ToolErrorCode, message: string, details?: Record<string, unknown>) {
        super(message);
        this.code = code;
        this.details = details;
    }

    public get httpStatus(): number {
        return HTTP_STATUS_BY_CODE[this.code];
    }
}

export function invalidArguments(message: string): ToolError {
    return new ToolError('invalid_arguments', message);
}
