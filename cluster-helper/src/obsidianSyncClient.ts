import {
    createMtlsClient, type MtlsClient, type MtlsFetch,
} from 'senaev-utils/src/utils/mtls/mtlsClient';
import { watchTlsMaterial, type TlsMaterialWatcher } from 'senaev-utils/src/utils/mtls/watchTlsMaterial';

import { OBSIDIAN_SYNC_URL } from './env';
import { logger } from './logger';

let client: MtlsClient | undefined;
let certificates: TlsMaterialWatcher | undefined;

/**
 * Loads the client certificate and keeps it renewed. Must finish before the first call.
 * `directory` is for tests: the mounted Secret is always in the default place.
 */
export async function startObsidianSyncClient(directory?: string): Promise<void> {
    certificates = await watchTlsMaterial({
        ...directory !== undefined && { directory },
        onChange: (material) => {
            client?.updateMaterial(material);
            logger.info({ validTo: material.validTo.toISOString() }, '🔐 Loaded the renewed mTLS certificate');
        },
        onError: (error) => logger.error({ err: error }, '❌ mTLS certificate files cannot be used, keeping the last valid ones'),
    });
    client = createMtlsClient({
        origin: OBSIDIAN_SYNC_URL,
        material: certificates.material,
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
