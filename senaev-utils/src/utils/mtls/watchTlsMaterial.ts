import {
    isSameTlsFiles,
    isTlsMaterialValidAt,
    parseTlsMaterial,
    readTlsFiles,
    type TlsFiles,
    type TlsMaterial,
} from './tlsMaterial';

const DEFAULT_POLL_INTERVAL_MS = 30_000;

export type TlsMaterialWatcher = {
    /** The material the service uses now: the first valid one, or the newest valid renewal. */
    material: TlsMaterial;
    stop: () => void;
};

type WatchOptions = {
    directory: string;
    /** Called with each renewed material that is complete and not expired. */
    onChange: (material: TlsMaterial) => void;
    /** Called for a snapshot that cannot be used, or an expired certificate. The services log it. */
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
 * on inodes. A snapshot that is incomplete, mixed up or already expired is reported and ignored,
 * so the last good material stays in use.
 *
 * The first read must succeed: without any material the service cannot start. If that first
 * material is already expired, the service still starts, reports it, and uses the renewed files
 * on a later poll.
 */
export async function watchTlsMaterial({
    directory,
    onChange,
    onError,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    now = () => new Date(),
    readFiles = readTlsFiles,
}: WatchOptions): Promise<TlsMaterialWatcher> {
    let files = await readFiles(directory);
    const watcher: TlsMaterialWatcher = {
        material: parseTlsMaterial(files),
        stop: () => clearInterval(timer),
    };
    let polling = false;

    if (!isTlsMaterialValidAt(watcher.material, now())) {
        onError(new Error('The loaded TLS certificate is expired'));
    }

    const poll = async () => {
        if (polling) {
            return;
        }

        polling = true;

        try {
            const latest = await readFiles(directory);

            if (isSameTlsFiles(latest, files)) {
                return;
            }

            const material = parseTlsMaterial(latest);

            if (!isTlsMaterialValidAt(material, now())) {
                throw new Error('The renewed TLS certificate is already expired');
            }

            onChange(material);
            watcher.material = material;
            files = latest;
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
