export type VaultToolErrorCode =
    | 'invalid_arguments'
    | 'unknown_tool'
    | 'forbidden_path'
    | 'not_found'
    | 'already_exists'
    | 'conflict'
    | 'ambiguous';

const HTTP_STATUS_BY_CODE: Record<VaultToolErrorCode, number> = {
    invalid_arguments: 400,
    unknown_tool: 404,
    forbidden_path: 403,
    not_found: 404,
    already_exists: 409,
    conflict: 409,
    ambiguous: 409,
};

/** An expected failure whose message is safe and useful to show to ChatGPT. */
export class VaultToolError extends Error {
    public readonly code: VaultToolErrorCode;
    public readonly details: Record<string, unknown> | undefined;

    public constructor(code: VaultToolErrorCode, message: string, details?: Record<string, unknown>) {
        super(message);
        this.code = code;
        this.details = details;
    }

    public get httpStatus(): number {
        return HTTP_STATUS_BY_CODE[this.code];
    }
}

export function invalidArguments(message: string): VaultToolError {
    return new VaultToolError('invalid_arguments', message);
}
