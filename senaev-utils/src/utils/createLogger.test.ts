import pino from 'pino';
import {
    describe, expect, it,
} from 'vitest';

import { LOGGER_OPTIONS } from './createLogger';

describe('createLogger', () => {
    it('writes the level as its name, so that Datadog can read it', () => {
        const lines: string[] = [];
        const logger = pino(LOGGER_OPTIONS, { write: (line: string) => lines.push(line) });

        logger.error('broken');
        logger.info('fine');

        expect(lines.map((line) => (JSON.parse(line) as { level: unknown }).level)).toEqual([
            'error',
            'info',
        ]);
    });
});
