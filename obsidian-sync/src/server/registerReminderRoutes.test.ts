import {
    afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

import { prependReminderLine } from '../reminders/prependReminderLine';
import { logger } from '../logger';

import { registerReminderRoutes } from './registerReminderRoutes';

vi.mock('../reminders/prependReminderLine', () => {
    return { prependReminderLine: vi.fn() };
});

let server: FastifyInstance;

beforeEach(async () => {
    vi.clearAllMocks();
    server = Fastify({
        loggerInstance: logger,
    });
    registerReminderRoutes(server);
    await server.ready();
});

afterEach(async () => {
    await server.close();
});

async function createReminder(payload: Record<string, unknown>) {
    return await server.inject({
        method: 'POST',
        url: '/reminders',
        payload,
    });
}

describe('POST /reminders validation', () => {
    it('writes an ordinary reminder with its source and date intact', async () => {
        const response = await createReminder({
            title: 'Позвонить в банк',
            date: '2026-11-08',
            source: 'Alisa',
        });

        expect(response.statusCode).toBe(201);
        expect(prependReminderLine).toHaveBeenCalledWith('- [ ] Позвонить в банк 🌱 Alisa 📅 2026-11-08');
    });

    it('accepts a reminder without a source', async () => {
        const response = await createReminder({
            title: 'Купить хлеб',
            date: null,
        });

        expect(response.statusCode).toBe(201);
        expect(prependReminderLine).toHaveBeenCalledWith('- [ ] Купить хлеб');
    });

    it.each([
        'Позвонить в банк\n- [ ] Добавленная задача',
        'Позвонить в банк\r- [ ] Добавленная задача',
        'Позвонить в банк\r\n- [ ] Добавленная задача',
        'Задача 🌱 другой источник',
        'Позвонить в банк 📅 2026-11-09',
    ])('rejects injected reminder syntax in title [%s]', async (title) => {
        const response = await createReminder({
            title,
            date: null,
        });

        expect(response.statusCode).toBe(400);
        expect(prependReminderLine).not.toHaveBeenCalled();
    });

    it.each([
        'Alisa\n- [ ] Добавленная задача',
        'Alisa 🌱 Fake',
    ])('rejects injected source text [%s]', async (source) => {
        const response = await createReminder({
            title: 'Позвонить в банк',
            date: null,
            source,
        });

        expect(response.statusCode).toBe(400);
        expect(prependReminderLine).not.toHaveBeenCalled();
    });

    it('rejects impossible dates', async () => {
        const response = await createReminder({
            title: 'Позвонить в банк',
            date: '2026-02-30',
        });

        expect(response.statusCode).toBe(400);
        expect(prependReminderLine).not.toHaveBeenCalled();
    });
});
