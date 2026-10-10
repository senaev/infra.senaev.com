import type { Logger } from 'pino';

import { ToolError } from './ToolError';

export type ToolCallReply = {
    statusCode: number;
    body: Record<string, unknown>;
};

/**
 * Runs one MCP tool call for an HTTP route. Success is `200 {status:'ok', ...result}`; a
 * `ToolError` answers with its own status and a message meant for ChatGPT; anything else is
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
        if (error instanceof ToolError) {
            logger.info({
                tool: name,
                code: error.code,
            }, '⚠️ Tool call failed');

            return {
                statusCode: error.httpStatus,
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
