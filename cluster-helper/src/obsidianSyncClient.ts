import {
    createMtlsClient, type MtlsClient, type MtlsFetch,
} from 'senaev-utils/src/utils/mtls/mtlsClient';
import { watchTlsCredentials, type TlsCredentialsWatcher } from 'senaev-utils/src/utils/mtls/watchTlsCredentials';

import { OBSIDIAN_SYNC_URL } from './env';
import { logger } from './logger';

let client: MtlsClient | undefined;
let certificates: TlsCredentialsWatcher | undefined;

/**
 * Loads the client certificate and keeps it renewed. Must finish before the first call.
 * `directory` is for tests: the mounted Secret is always in the default place.
 */
export async function startObsidianSyncClient(directory?: string): Promise<void> {
    certificates = await watchTlsCredentials({
        ...directory !== undefined && { directory },
        onChange: (credentials) => {
            client?.updateCredentials(credentials);
            logger.info({ validTo: credentials.validTo.toISOString() }, '🔐 Loaded the renewed mTLS certificate');
        },
        onError: (error) => logger.error({ err: error }, '❌ mTLS certificate files cannot be used, keeping the last valid ones'),
    });
    client = createMtlsClient({
        origin: OBSIDIAN_SYNC_URL,
        credentials: certificates.credentials,
    });
}

export async function stopObsidianSyncClient(): Promise<void> {
    certificates?.stop();
    await client?.close();
}

/** Talks only to obsidian-sync, which authenticates this service by its client certificate. */
export const obsidianSyncFetch: MtlsFetch = (url, init) => {
    if (client === undefined) {
        return Promise.reject(new Error('The obsidian-sync client is not started'));
    }

    return client.fetch(url, init);
};
