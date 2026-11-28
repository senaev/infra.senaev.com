import {
    findReminderFieldsError, serializeReminder, type ReminderFields,
} from 'senaev-utils/src/obsidianReminders/reminderLine';
import { isObjectOrArray } from 'senaev-utils/src/types/Object/Object';
import type { FastifyInstance } from 'fastify';

import { logger } from '../logger';
import { prependReminderLine } from '../reminders/prependReminderLine';

export function registerReminderRoutes(server: Pick<FastifyInstance, 'post'>): void {
    server.post<{ Body: unknown }>('/reminders', async (request, reply) => {
        const { body } = request;

        if (!isObjectOrArray(body)) {
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

        const reminder: ReminderFields = {
            status: 'open',
            description: title.trim(),
            source: source ?? null,
            priority: 'normal',
            date: typeof date === 'string' && date.trim() !== '' ? date.trim() : null,
            closedDate: null,
            recurrence: null,
        };
        const validationError = findReminderFieldsError(reminder);

        if (validationError !== null) {
            return reply.code(400).type('text/plain').send(`Invalid reminder: ${validationError}`);
        }

        const line = serializeReminder(reminder);

        try {
            await prependReminderLine(line);
        } catch (error) {
            logger.error(error, '❌ Failed to write reminder to vault');

            return reply.code(500).type('text/plain').send('Internal Server Error');
        }

        logger.info({ line }, '✅ Reminder added');

        return reply.code(201).type('text/plain').send('Created');
    });
}
