import {
    isSameTlsFiles,
    isTlsCredentialsValidAt,
    MTLS_DIRECTORY,
    parseTlsCredentials,
    readTlsFiles,
    type TlsFiles,
    type TlsCredentials,
} from './tlsCredentials';

const DEFAULT_POLL_INTERVAL_MS = 30_000;

export type TlsCredentialsWatcher = {
    /** The credentials the service uses now: the first valid one, or the newest valid renewal. */
    credentials: TlsCredentials;
    stop: () => void;
};

type WatchOptions = {
    /** Defaults to where the Helm templates mount the Secret. A test may use another one. */
    directory?: string;
    /** Called with each set of renewed credentials that is complete and not expired. */
    onChange: (credentials: TlsCredentials) => void;
    /** Called for a snapshot that cannot be used, or a certificate that is not valid now. The services log it. */
    onError: (error: Error) => void;
    pollIntervalMs?: number;
    now?: () => Date;
    readFiles?: (directory: string) => Promise<TlsFiles>;
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
export async function watchTlsCredentials({
    directory = MTLS_DIRECTORY,
    onChange,
    onError,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    now = () => new Date(),
    readFiles = readTlsFiles,
}: WatchOptions): Promise<TlsCredentialsWatcher> {
    let files = await readFiles(directory);
    let stopped = false;
    const watcher: TlsCredentialsWatcher = {
        credentials: parseTlsCredentials(files),
        stop: () => {
            stopped = true;
            clearInterval(timer);
        },
    };
    let polling = false;
    let invalidityReported = false;
    const reportInvalidityOnce = () => {
        if (invalidityReported || isTlsCredentialsValidAt(watcher.credentials, now())) {
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
            const latest = await readFiles(directory);

            if (stopped) {
                return;
            }

            if (isSameTlsFiles(latest, files)) {
                reportInvalidityOnce();

                return;
            }

            const credentials = parseTlsCredentials(latest);

            if (!isTlsCredentialsValidAt(credentials, now())) {
                throw new Error('The renewed TLS certificate is not valid now');
            }

            onChange(credentials);
            watcher.credentials = credentials;
            files = latest;
            invalidityReported = false;
        } catch (error) {
            onError(toError(error));
        } finally {
            polling = false;
        }
    };
    const timer = setInterval(() => {
        void poll();
    }, pollIntervalMs);

    timer.unref();

    return watcher;
}
