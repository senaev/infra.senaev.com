import type { MtlsClient } from 'senaev-utils/src/utils/mtls/mtlsClient';

/** The host must match the DNS name in cluster-helper's certificate. */
export const CLUSTER_HELPER_URL = 'https://cluster-helper.senaev-com.svc.cluster.local:8443';

export type ClusterHelperTelegramApi = ReturnType<typeof createClusterHelperTelegramApi>;

/**
 * Posts to Telegram through cluster-helper. Every call goes through the mTLS client, because
 * cluster-helper allows only vpn-subscription, by the name in its client certificate.
 */
export function createClusterHelperTelegramApi(client: Pick<MtlsClient, 'fetch'>) {
    return {
        sendMessage: ({ chatId, text }: { chatId: string; text: string }): Promise<Response> => client.fetch(`${CLUSTER_HELPER_URL}/telegram/send-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chatId,
                text,
            }),
        }),
    };
}
