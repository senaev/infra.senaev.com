import {
    createMtlsClient, type MtlsClient, type MtlsFetch,
} from 'senaev-utils/src/utils/mtls/mtlsClient';
import { watchTlsMaterial, type TlsMaterialWatcher } from 'senaev-utils/src/utils/mtls/watchTlsMaterial';

import { MTLS_DIR, OBSIDIAN_SYNC_URL } from './env';
import { logger } from './logger';

let client: MtlsClient | undefined;
let certificates: TlsMaterialWatcher | undefined;

/** Loads the client certificate and keeps it renewed. Must finish before the first call. */
export async function startObsidianSyncClient(): Promise<void> {
    certificates = await watchTlsMaterial({
        directory: MTLS_DIR,
        onChange: (material) => {
            client?.updateMaterial(material);
            logger.info({ notAfter: material.notAfter.toISOString() }, '🔐 Loaded the renewed mTLS certificate');
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
