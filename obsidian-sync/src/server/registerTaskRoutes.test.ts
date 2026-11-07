import {
    afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

import { prependTaskLine } from '../tasks/prependTaskLine';

import { createVaultServer, type VaultServer } from './createVaultServer';
import { registerTaskRoutes } from './registerTaskRoutes';

vi.mock('../tasks/prependTaskLine', () => {
    return { prependTaskLine: vi.fn() };
});

let server: VaultServer;

beforeEach(async () => {
    vi.clearAllMocks();
    server = createVaultServer();
    registerTaskRoutes(server);
    await server.ready();
});

afterEach(async () => {
    await server.close();
});

async function createTask(payload: Record<string, unknown>) {
    return await server.inject({
        method: 'POST',
        url: '/tasks',
        payload,
    });
}

describe('POST /tasks validation', () => {
    it('writes an ordinary task with its source and due date intact', async () => {
        const response = await createTask({
            title: 'Позвонить в банк',
            date: '2026-11-08',
            source: 'Alisa',
        });

        expect(response.statusCode).toBe(201);
        expect(prependTaskLine).toHaveBeenCalledWith('- [ ] Позвонить в банк 🌱 Alisa 📅 2026-11-08');
    });

    it('accepts a task without a source', async () => {
        const response = await createTask({
            title: 'Купить хлеб',
            date: null,
        });

        expect(response.statusCode).toBe(201);
        expect(prependTaskLine).toHaveBeenCalledWith('- [ ] Купить хлеб');
    });

    it.each([
        'Позвонить в банк\n- [ ] Добавленная задача',
        'Позвонить в банк\r- [ ] Добавленная задача',
        'Позвонить в банк\r\n- [ ] Добавленная задача',
        'Задача 🌱 другой источник',
        'Позвонить в банк 📅 2026-11-09',
    ])('rejects injected task syntax in title [%s]', async (title) => {
        const response = await createTask({
            title,
            date: null,
        });

        expect(response.statusCode).toBe(400);
        expect(prependTaskLine).not.toHaveBeenCalled();
    });

    it.each([
        'Alisa\n- [ ] Добавленная задача',
        'Alisa 🌱 Fake',
    ])('rejects injected source text [%s]', async (source) => {
        const response = await createTask({
            title: 'Позвонить в банк',
            date: null,
            source,
        });

        expect(response.statusCode).toBe(400);
        expect(prependTaskLine).not.toHaveBeenCalled();
    });

    it('rejects impossible dates', async () => {
        const response = await createTask({
            title: 'Позвонить в банк',
            date: '2026-02-30',
        });

        expect(response.statusCode).toBe(400);
        expect(prependTaskLine).not.toHaveBeenCalled();
    });
});
