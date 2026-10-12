import pino from 'pino';
import {
    describe, expect, it,
} from 'vitest';

import { OperationError } from '../operations/OperationError';
import { CommandError } from '../commands/CommandError';

import { runToolCall } from './runToolCall';

const logger = pino({ level: 'silent' });

describe('runToolCall', () => {
    it('answers 200 with the result next to status ok', async () => {
        const reply = await runToolCall({
            name: 'read',
            logger,
            run: () => Promise.resolve({ content: 'x' }),
        });

        expect(reply).toEqual({
            statusCode: 200,
            body: {
                status: 'ok',
                content: 'x',
            },
        });
    });

    it('answers a CommandError with its status, code, message and details, also when thrown synchronously', async () => {
        const reply = await runToolCall({
            name: 'patch',
            logger,
            run: () => {
                throw new CommandError('conflict', 'The file changed', { currentHash: 'abc' });
            },
        });

        expect(reply).toEqual({
            statusCode: 409,
            body: {
                status: 'error',
                code: 'conflict',
                message: 'The file changed',
                details: { currentHash: 'abc' },
            },
        });
    });

    it.each([
        [
            'invalid_arguments',
            400,
        ],
        [
            'forbidden_path',
            403,
        ],
        [
            'not_found',
            404,
        ],
        [
            'already_exists',
            409,
        ],
        [
            'conflict',
            409,
        ],
        [
            'ambiguous',
            409,
        ],
        [
            'command_failed',
            422,
        ],
    ] as const)('maps command code %s to HTTP %i', async (code, statusCode) => {
        const error = new CommandError(code, 'Safe message');
        const reply = await runToolCall({
            name: 'test',
            logger,
            run: () => {
                throw error;
            },
        });

        expect(reply).toEqual({
            statusCode,
            body: {
                status: 'error',
                code,
                message: 'Safe message',
            },
        });
        expect(error).not.toHaveProperty('httpStatus');
    });

    it.each([
        [
            'QUEUE_FULL',
            429,
        ],
        [
            'unknown_tool',
            404,
        ],
    ] as const)('maps routing/admission code %s to HTTP %i', async (code, statusCode) => {
        const error = new OperationError(code, 'Cannot admit command');
        const reply = await runToolCall({
            name: 'read',
            logger,
            run: () => {
                throw error;
            },
        });

        expect(error).not.toBeInstanceOf(CommandError);
        expect(reply).toEqual({
            statusCode,
            body: {
                status: 'error',
                code,
                message: 'Cannot admit command',
            },
        });
    });

    it('hides an unexpected error behind a 500', async () => {
        const reply = await runToolCall({
            name: 'read',
            logger,
            run: () => Promise.reject(new Error('/secret/path is broken')),
        });

        expect(reply).toEqual({
            statusCode: 500,
            body: {
                status: 'error',
                code: 'internal_error',
                message: 'Internal Server Error',
            },
        });
    });
});
