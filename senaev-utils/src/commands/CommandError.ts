export type CommandErrorCode =
    | 'invalid_arguments'
    | 'forbidden_path'
    | 'not_found'
    | 'already_exists'
    | 'conflict'
    | 'ambiguous'
    | 'command_failed';

/** An expected command failure with a message safe to return to its caller. */
export class CommandError extends Error {
    public readonly code: CommandErrorCode;
    public readonly details: Record<string, unknown> | undefined;

    public constructor(code: CommandErrorCode, message: string, details?: Record<string, unknown>) {
        super(message);
        this.code = code;
        this.details = details;
    }
}

export function invalidArguments(message: string): CommandError {
    return new CommandError('invalid_arguments', message);
}
