import {
    isSameTlsFiles,
    isTlsCredentialsValidAt,
    parseTlsCredentials,
    readTlsFiles,
    type TlsCredentials,
} from './tlsCredentials';

export const TLS_POLL_INTERVAL_MS = 30_000;

export type TlsCredentialsWatcher = {
    /** The credentials the service uses now: the first valid one, or the newest valid renewal. */
    credentials: TlsCredentials;
    stop: () => void;
};

type WatchOptions = {
    /** Called with each set of renewed credentials that is complete and not expired. */
    onChange: (credentials: TlsCredentials) => void;
    /** Called for a snapshot that cannot be used, or a certificate that is not valid now. The services log it. */
    onError: (error: Error) => void;
};

function toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

/**
 * Loads the files that cert-manager keeps renewed in a mounted Secret, and polls them. Kubelet
 * replaces the mounted files some time after a renewal, and polling avoids watchers that depend
 * on inodes. A snapshot that is incomplete, mixed up or not valid now (expired, or not yet
 * valid) is reported and ignored, so the last good credentials stay in use. The credentials in use
 * are reported once when they expire, because no renewal may arrive to change the files.
 *
 * The first read must succeed: without any credentials the service cannot start. If those first
 * credentials are not valid, the service still starts, reports it, and uses the renewed files on
 * a later poll.
 */
export async function watchTlsCredentials({ onChange, onError }: WatchOptions): Promise<TlsCredentialsWatcher> {
    let stopped = false;
    const watcher: TlsCredentialsWatcher = {
        credentials: parseTlsCredentials(await readTlsFiles()),
        stop: () => {
            stopped = true;
            clearInterval(timer);
        },
    };
    let polling = false;
    let invalidityReported = false;
    const reportInvalidityOnce = () => {
        if (invalidityReported || isTlsCredentialsValidAt(watcher.credentials, new Date())) {
            return;
        }

        invalidityReported = true;
        onError(new Error('The TLS certificate in use is not valid now'));
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

            if (isSameTlsFiles(latest, watcher.credentials)) {
                reportInvalidityOnce();

                return;
            }

            const credentials = parseTlsCredentials(latest);

            if (!isTlsCredentialsValidAt(credentials, new Date())) {
                throw new Error('The renewed TLS certificate is not valid now');
            }

            onChange(credentials);
            watcher.credentials = credentials;
            invalidityReported = false;
        } catch (error) {
            onError(toError(error));
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
