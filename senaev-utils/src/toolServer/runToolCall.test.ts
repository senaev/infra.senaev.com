import pino from 'pino';
import {
    describe, expect, it,
} from 'vitest';

import { runToolCall } from './runToolCall';
import { ToolError } from './ToolError';

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

    it('answers a ToolError with its status, code, message and details, also when thrown synchronously', async () => {
        const reply = await runToolCall({
            name: 'patch',
            logger,
            run: () => {
                throw new ToolError('conflict', 'The file changed', { currentHash: 'abc' });
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
