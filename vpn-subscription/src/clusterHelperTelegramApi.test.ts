import {
    describe, expect, it, vi,
} from 'vitest';

import { createClusterHelperTelegramApi } from './clusterHelperTelegramApi';

describe('createClusterHelperTelegramApi', () => {
    it('posts the message to the send-message route of cluster-helper through the client', async () => {
        const response = new Response(null, { status: 204 });
        const fetch = vi.fn().mockResolvedValue(response);
        const telegramApi = createClusterHelperTelegramApi({ fetch });

        expect(await telegramApi.sendMessage({
            chatId: '42',
            text: 'hello',
        })).toBe(response);
        expect(fetch).toHaveBeenCalledExactlyOnceWith('https://cluster-helper.senaev-com.svc.cluster.local:8443/telegram/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chatId: '42',
                text: 'hello',
            }),
        });
    });
});
