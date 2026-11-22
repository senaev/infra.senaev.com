import type { MtlsClient } from 'senaev-utils/src/utils/mtls/mtlsClient';

export type ClusterHelperTelegram = ReturnType<typeof createClusterHelperTelegram>;

/**
 * Posts to Telegram through cluster-helper. Every call goes through the mTLS client, because
 * cluster-helper allows only vpn-subscription, by the name in its client certificate. The client
 * talks only to `origin`, whose host must be the DNS name in the certificate of cluster-helper.
 */
export function createClusterHelperTelegram({ client, origin }: { client: Pick<MtlsClient, 'fetch'>; origin: string }) {
    return {
        sendMessage: ({ chatId, text }: { chatId: string; text: string }): Promise<Response> => client.fetch(`${origin}/telegram/send-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chatId,
                text,
            }),
        }),
    };
}
