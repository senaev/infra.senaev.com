import {
    afterEach, describe, expect, it, vi,
} from 'vitest';

import { insertSupabaseRows } from './supabase';

vi.mock('./env', () => {
    return {
        SUPABASE_PROJECT_URL: 'https://supabase.example',
        SUPABASE_PUBLISHABLE_KEY: 'key',
    };
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('insertSupabaseRows', () => {
    it('bounds the write request to 30 seconds', async () => {
        const { signal } = new AbortController();
        const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(signal);
        const fetchMock = vi.fn().mockResolvedValue({ ok: true });

        vi.stubGlobal('fetch', fetchMock);

        await insertSupabaseRows('items', [{ title: 'Bread' }]);

        expect(timeout).toHaveBeenCalledWith(30_000);
        expect(fetchMock).toHaveBeenCalledWith('https://supabase.example/rest/v1/items', expect.objectContaining({ signal }));
    });

    it('keeps the abort signal attached while reading an error response body', async () => {
        const controller = new AbortController();
        const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
        const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
            const signal = init.signal as AbortSignal;

            return Promise.resolve({
                ok: false,
                status: 503,
                text: () => new Promise((_resolve, reject) => {
                    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
                }),
            });
        });

        vi.stubGlobal('fetch', fetchMock);

        const write = insertSupabaseRows('items', [{ title: 'Bread' }]);
        const assertion = expect(write).rejects.toThrow('Supabase write timed out');

        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        controller.abort(new Error('Supabase write timed out'));
        await assertion;
        expect(timeout).toHaveBeenCalledWith(30_000);
    });
});
