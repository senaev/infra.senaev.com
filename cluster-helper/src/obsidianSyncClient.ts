import type { Signal } from 'senaev-utils/src/utils/Signal/Signal';
import {
    createMtlsClient, type MtlsClient, type MtlsFetch,
} from 'senaev-utils/src/utils/mtls/mtlsClient';
import type { TlsCredentials } from 'senaev-utils/src/utils/mtls/tlsCredentials';

import { OBSIDIAN_SYNC_URL } from './env';

let client: MtlsClient | undefined;

/** Must run before the first call. The credentials are renewed by their owner. */
export function startObsidianSyncClient(credentials: Signal<TlsCredentials>): void {
    client = createMtlsClient({
        origin: OBSIDIAN_SYNC_URL,
        credentials,
    });
}

export async function stopObsidianSyncClient(): Promise<void> {
    await client?.close();
}

/** Talks only to obsidian-sync, which authenticates this service by its client certificate. */
export const obsidianSyncFetch: MtlsFetch = (url, init) => {
    if (client === undefined) {
        return Promise.reject(new Error('The obsidian-sync client is not started'));
    }

    return client.fetch(url, init);
};
