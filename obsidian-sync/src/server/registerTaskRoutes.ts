import {
    findTaskFieldsError, serializeTask, type TaskFields,
} from 'senaev-utils/src/obsidianTasks/taskLine';
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

        const {
            title, date, source,
        } = body;

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

        if (source !== undefined && source !== null && typeof source !== 'string') {
            return reply.code(400).type('text/plain').send('Field "source" must be a string or null');
        }

        const task: TaskFields = {
            status: 'open',
            description: title.trim(),
            source: source ?? null,
            priority: 'normal',
            dueDate: typeof date === 'string' && date.trim() !== '' ? date.trim() : null,
            closedDate: null,
            recurrence: null,
        };
        const validationError = findTaskFieldsError(task);

        if (validationError !== null) {
            return reply.code(400).type('text/plain').send(`Invalid task: ${validationError}`);
        }

        const line = serializeTask(task);

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
