import type { Logger } from 'pino';

import { Signal } from '../Signal/Signal';

import {
    isSameTlsFiles,
    isTlsCredentialsValidAt,
    parseTlsCredentials,
    readTlsFiles,
    type TlsCredentials,
} from './tlsCredentials';

export const TLS_POLL_INTERVAL_MS = 30_000;

export type TlsCredentialsWatcher = {
    /**
     * The credentials the service uses now: the first valid ones, or the newest valid renewal.
     * Subscribers get each renewal that is complete and not expired.
     */
    credentials: Signal<TlsCredentials>;
    stop: () => void;
};

type WatchOptions = {
    /** Gets each renewal, and each snapshot that cannot be used or certificate that is not valid now. */
    logger: Pick<Logger, 'info' | 'error'>;
};

const FILES_UNUSABLE_MESSAGE = '❌ mTLS certificate files cannot be used, keeping the last valid ones';

function toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

/**
 * Loads the files that cert-manager keeps renewed in a mounted Secret, and polls them. Kubelet
 * replaces the mounted files some time after a renewal, and polling avoids watchers that depend
 * on inodes. A snapshot that is incomplete, mixed up or not valid now (expired, or not yet
 * valid) is logged and ignored, so the last good credentials stay in use. The credentials in use
 * are logged once when they expire, because no renewal may arrive to change the files.
 *
 * One watcher serves all the servers and clients of a process: each of them subscribes to the
 * signal. The process that creates the watcher calls `stop()`.
 *
 * The first read must succeed: without any credentials the service cannot start. If those first
 * credentials are not valid, the service still starts, logs it, and uses the renewed files on
 * a later poll.
 */
export async function watchTlsCredentials({ logger }: WatchOptions): Promise<TlsCredentialsWatcher> {
    let stopped = false;
    const initialCredentials = parseTlsCredentials(await readTlsFiles());
    const credentials = new Signal(initialCredentials);
    const watcher: TlsCredentialsWatcher = {
        credentials,
        stop: () => {
            stopped = true;
            clearInterval(timer);
        },
    };
    let polling = false;
    let invalidityReported = false;
    const reportInvalidityOnce = () => {
        if (invalidityReported || isTlsCredentialsValidAt(credentials.getValue(), new Date())) {
            return;
        }

        invalidityReported = true;
        logger.error({ err: new Error('The TLS certificate in use is not valid now') }, FILES_UNUSABLE_MESSAGE);
    };

    reportInvalidityOnce();

    const poll = async () => {
        if (polling) {
            return;
        }

        polling = true;

        try {
            const latest = await readTlsFiles();

            if (stopped) {
                return;
            }

            if (isSameTlsFiles(latest, credentials.getValue())) {
                reportInvalidityOnce();

                return;
            }

            const renewed = parseTlsCredentials(latest);

            if (!isTlsCredentialsValidAt(renewed, new Date())) {
                throw new Error('The renewed TLS certificate is not valid now');
            }

            invalidityReported = false;
            logger.info({ validTo: renewed.validTo.toISOString() }, '🔐 Loaded the renewed mTLS certificate');
            credentials.dispatch(renewed);
        } catch (error) {
            logger.error({ err: toError(error) }, FILES_UNUSABLE_MESSAGE);
        } finally {
            polling = false;
        }
    };
    const timer = setInterval(() => {
        void poll();
    }, TLS_POLL_INTERVAL_MS);

    timer.unref();

    return watcher;
}
