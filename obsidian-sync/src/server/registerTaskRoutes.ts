import { serializeTask } from 'senaev-utils/src/obsidianTasks/taskLine';
import { isObject } from 'senaev-utils/src/types/Object/Object';

import { logger } from '../logger';
import { prependTaskLine } from '../tasks/prependTaskLine';

import type { VaultServer } from './createVaultServer';

export function registerTaskRoutes(server: VaultServer): void {
    server.post<{ Body: unknown }>('/tasks', async (request, reply) => {
        const { body } = request;

        if (!isObject(body)) {
            return reply.code(400).type('text/plain').send('Request body must be a JSON object');
        }

        const { title, date } = body;

        if (typeof title !== 'string' || title.trim() === '') {
            return reply
                .code(400)
                .type('text/plain')
                .send('Field "title" is required and must be a non-empty string');
        }

        if (date !== undefined && date !== null && typeof date !== 'string') {
            return reply
                .code(400)
                .type('text/plain')
                .send('Field "date" must be a string or null');
        }

        const normalizedDate = typeof date === 'string' && date.trim() !== '' ? date.trim() : null;
        const line = serializeTask({
            status: 'open',
            description: title.trim(),
            source: null,
            priority: 'normal',
            dueDate: normalizedDate,
            closedDate: null,
            recurrence: null,
        });

        try {
            await prependTaskLine(line);
        } catch (error) {
            logger.error(error, '❌ Failed to write task to vault');

            return reply.code(500).type('text/plain').send('Internal Server Error');
        }

        logger.info({ line }, '✅ Task added');

        return reply.code(201).type('text/plain').send('Created');
    });
}
