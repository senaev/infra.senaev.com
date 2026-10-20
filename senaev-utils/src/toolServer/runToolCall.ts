import type { Logger } from 'pino';

import { OperationError } from '../operations/OperationError';
import { type CommandErrorCode, CommandError } from '../commands/CommandError';

const HTTP_STATUS_BY_CODE: Record<CommandErrorCode | OperationError['code'], number> = {
    file_too_large: 413,
    binary_file: 415,
    download_failed: 502,
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

export type ToolCallReply = {
    statusCode: number;
    body: Record<string, unknown>;
};

/**
 * Runs one command call for an HTTP route. Success is `200 {status:'ok', ...result}`; a
 * command or admission error gets its mapped HTTP status and safe message; anything else is
 * a 500 that hides the error.
 *
 * Logs only the tool name and timing: the arguments and results can hold private text.
 */
export async function runToolCall({
    name, logger, run,
}: { name: string; logger: Logger; run: () => Promise<Record<string, unknown>> }): Promise<ToolCallReply> {
    const startedAt = performance.now();

    try {
        const result = await run();

        logger.info({
            tool: name,
            durationMs: Math.round(performance.now() - startedAt),
        }, '✅ Tool call');

        return {
            statusCode: 200,
            body: {
                status: 'ok',
                ...result,
            },
        };
    } catch (error) {
        if (error instanceof CommandError || error instanceof OperationError) {
            logger.info({
                tool: name,
                code: error.code,
            }, '⚠️ Tool call failed');

            return {
                statusCode: HTTP_STATUS_BY_CODE[error.code],
                body: {
                    status: 'error',
                    code: error.code,
                    message: error.message,
                    ...error.details !== undefined && { details: error.details },
                },
            };
        }

        logger.error({
            err: error,
            tool: name,
        }, '❌ Tool call crashed');

        return {
            statusCode: 500,
            body: {
                status: 'error',
                code: 'internal_error',
                message: 'Internal Server Error',
            },
        };
    }
}
