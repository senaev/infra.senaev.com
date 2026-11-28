import type { FastifyInstance } from 'fastify';
import { isPositiveInteger } from 'senaev-utils/src/types/Number/PositiveInteger';
import { isObjectOrArray } from 'senaev-utils/src/types/Object/Object';
import { isString } from 'senaev-utils/src/utils/String/isString';
import { isNonEmptyString } from 'senaev-utils/src/utils/String/NonEmptyString/NonEmptyString';
import { registerMtlsCallerAllowlist } from 'senaev-utils/src/utils/mtls/registerMtlsCallerAllowlist';

import { ALLOWED_CALLERS } from './callers';
import { type ExecutionManager, MAX_TIMEOUT_SECONDS } from './executionManager';
import { toPublicExecution } from './executionRecord';

// Also the name of the systemd unit on the host, so only characters that systemd keeps as they are.
const EXECUTION_ID = /^[A-Za-z0-9-]{1,64}$/;
const MAX_COMMAND_BYTES = 16 * 1024;

type ExecutionRequestBody = {
    host: string;
    command: string;
    timeoutSeconds: number;
};

function isExecutionRequestBody(value: unknown): value is ExecutionRequestBody {
    if (!isObjectOrArray(value)) {
        return false;
    }

    const {
        host, command, timeoutSeconds,
    } = value;

    if (!isString(host)) {
        return false;
    }

    if (!isNonEmptyString(command) || Buffer.byteLength(command) > MAX_COMMAND_BYTES) {
        return false;
    }

    return isPositiveInteger(timeoutSeconds) && timeoutSeconds <= MAX_TIMEOUT_SECONDS;
}

function errorBody(code: string, message: string) {
    return {
        status: 'error',
        code,
        message,
    };
}

export function registerExecutionRoutes(
    server: Pick<FastifyInstance, 'addHook' | 'delete' | 'get' | 'put'>,
    manager: Pick<ExecutionManager, 'start' | 'get' | 'stop'>
): void {
    // First, so it covers every route below.
    registerMtlsCallerAllowlist(server, ALLOWED_CALLERS);

    server.put<{ Params: { executionId: string }; Body: unknown }>('/executions/:executionId', async (request, reply) => {
        const { executionId } = request.params;

        if (!EXECUTION_ID.test(executionId)) {
            return reply.code(400).send(errorBody('invalid_execution_id', 'The execution ID must be 1-64 letters, digits or dashes'));
        }

        if (!isExecutionRequestBody(request.body)) {
            return reply.code(400).send(errorBody(
                'invalid_request',
                `Expected { host, command (1-${MAX_COMMAND_BYTES} bytes), timeoutSeconds (1-${MAX_TIMEOUT_SECONDS}) }`
            ));
        }

        const result = await manager.start({
            executionId,
            host: request.body.host,
            command: request.body.command,
            timeoutSeconds: request.body.timeoutSeconds,
        });

        if (result.kind === 'started') {
            return reply.code(202).send({ execution: toPublicExecution(result.record) });
        }

        if (result.kind === 'existing') {
            return reply.code(200).send({ execution: toPublicExecution(result.record) });
        }

        if (result.kind === 'conflict') {
            return reply.code(409).send(errorBody('execution_id_conflict', 'This execution ID was used for another request'));
        }

        if (result.kind === 'hosts-unavailable') {
            return reply.code(503).send(errorBody('hosts_unavailable', 'The list of cluster nodes cannot be read; try again later'));
        }

        if (result.kind === 'unknown-host') {
            return reply.code(400).send(errorBody('unknown_host', 'This host is not a node of the cluster'));
        }

        return reply.code(429).send(errorBody('busy', 'Another command is running; try again later'));
    });

    server.get<{ Params: { executionId: string } }>('/executions/:executionId', (request, reply) => {
        const record = EXECUTION_ID.test(request.params.executionId)
            ? manager.get(request.params.executionId)
            : undefined;

        if (record === undefined) {
            return reply.code(404).send(errorBody('not_found', 'No such execution'));
        }

        return reply.send({ execution: toPublicExecution(record) });
    });

    server.delete<{ Params: { executionId: string } }>('/executions/:executionId', async (request, reply) => {
        const { executionId } = request.params;

        if (!EXECUTION_ID.test(executionId)) {
            return reply.code(404).send(errorBody('not_found', 'No such execution'));
        }

        const result = await manager.stop(executionId);

        if (result.kind === 'not-found') {
            return reply.code(404).send(errorBody('not_found', 'No such execution'));
        }

        if (result.kind === 'stop-failed') {
            return reply.code(502).send(errorBody('stop_failed', 'The command could not be stopped on its host; try again'));
        }

        // 202: the command has stopped, and its result is saved soon after; 200: nothing ran any more.
        return reply.code(result.kind === 'stopped' ? 202 : 200).send({ execution: toPublicExecution(result.record) });
    });
}
