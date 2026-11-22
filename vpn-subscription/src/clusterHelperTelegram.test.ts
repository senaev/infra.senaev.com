import {
    describe, expect, it, vi,
} from 'vitest';

import { createClusterHelperTelegram } from './clusterHelperTelegram';

describe('createClusterHelperTelegram', () => {
    it('posts the message to the send-message route of cluster-helper through the client', async () => {
        const response = new Response(null, { status: 204 });
        const fetch = vi.fn().mockResolvedValue(response);
        const telegram = createClusterHelperTelegram({
            client: { fetch },
            origin: 'https://cluster-helper.test:8443',
        });

        expect(await telegram.sendMessage({
            chatId: '42',
            text: 'hello',
        })).toBe(response);
        expect(fetch).toHaveBeenCalledExactlyOnceWith('https://cluster-helper.test:8443/telegram/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chatId: '42',
                text: 'hello',
            }),
        });
    });
});
