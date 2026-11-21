import {
    afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

import { prependRecommendationsRecord } from '../jobSearch/prependRecommendationsRecord';

import { createVaultServer, type VaultServer } from './createVaultServer';
import { registerJobSearchRoutes } from './registerJobSearchRoutes';

vi.mock('../jobSearch/prependRecommendationsRecord', () => {
    return { prependRecommendationsRecord: vi.fn() };
});

let server: VaultServer;

beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(prependRecommendationsRecord).mockResolvedValue(true);
    server = createVaultServer();
    registerJobSearchRoutes(server);
    await server.ready();
});

afterEach(async () => {
    await server.close();
});

function post(payload: Record<string, unknown>) {
    return server.inject({
        method: 'POST',
        url: '/job-search/recommendations',
        payload,
    });
}

describe('POST /job-search/recommendations', () => {
    it('adds the record under a heading with the date and the UTC time', async () => {
        const response = await post({
            date: '2026-11-22',
            time: '04:00',
            text: '**Job search round, 2026-11-22**',
        });

        expect(response.statusCode).toBe(201);
        expect(prependRecommendationsRecord).toHaveBeenCalledWith('## [[2026-11-22]] 04:00 UTC', '**Job search round, 2026-11-22**');
    });

    it.each([
        {
            date: '22.11.2026',
            time: '04:00',
            text: 'x',
        },
        {
            date: '2026-11-22',
            time: '4am',
            text: 'x',
        },
        {
            date: '2026-11-22',
            time: '04:00',
            text: ' ',
        },
        {
            date: '2026-02-30',
            time: '04:00',
            text: 'x',
        },
        {
            date: '2026-11-22',
            time: '24:00',
            text: 'x',
        },
        {
            date: '2026-11-22',
            time: '04:60',
            text: 'x',
        },
    ])('rejects an invalid request: %o', async (payload) => {
        expect((await post(payload)).statusCode).toBe(400);
        expect(prependRecommendationsRecord).not.toHaveBeenCalled();
    });

    it('accepts a leap day', async () => {
        expect((await post({
            date: '2028-02-29',
            time: '23:59',
            text: 'x',
        })).statusCode).toBe(201);
    });

    it('answers 200 and adds nothing when a retry finds the record already there', async () => {
        vi.mocked(prependRecommendationsRecord).mockResolvedValueOnce(false);

        expect((await post({
            date: '2026-11-22',
            time: '04:00',
            text: 'x',
        })).statusCode).toBe(200);
    });

    it('answers 500 when the note cannot be written', async () => {
        vi.mocked(prependRecommendationsRecord).mockRejectedValueOnce(new Error('no note'));

        expect((await post({
            date: '2026-11-22',
            time: '04:00',
            text: 'x',
        })).statusCode).toBe(500);
    });
});
