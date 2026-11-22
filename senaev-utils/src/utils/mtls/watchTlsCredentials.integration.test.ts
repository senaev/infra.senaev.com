import {
    afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

import { createTestCa, issueTestCertificate } from './testPki';
import {
    isTlsCredentialsValidAt, parseTlsCredentials, type TlsFiles,
} from './tlsCredentials';
import {
    TLS_POLL_INTERVAL_MS, watchTlsCredentials, type TlsCredentialsWatcher,
} from './watchTlsCredentials';

const mocks = vi.hoisted(() => {
    return { readTlsFiles: vi.fn<() => Promise<TlsFiles>>() };
});

vi.mock('./tlsCredentials', async (importOriginal) => {
    return {
        ...await importOriginal<typeof import('./tlsCredentials')>(),
        readTlsFiles: mocks.readTlsFiles,
    };
});

const HOUR_MS = 3_600_000;

const watchers: TlsCredentialsWatcher[] = [];

beforeEach(() => {
    mocks.readTlsFiles.mockReset();
});

afterEach(() => {
    watchers.splice(0).forEach((watcher) => watcher.stop());
    vi.useRealTimers();
});

function errorWith(message: string) {
    return [
        expect.objectContaining({ err: expect.objectContaining({ message }) }),
        expect.any(String),
    ];
}

async function issueFiles(options: { ca?: Awaited<ReturnType<typeof createTestCa>>; validFrom?: Date; validTo?: Date } = {}): Promise<TlsFiles> {
    const ca = options.ca ?? await createTestCa();

    return issueTestCertificate({
        ca,
        dnsName: 'service.test',
        usage: 'server',
        ...options.validFrom && { validFrom: options.validFrom },
        ...options.validTo && { validTo: options.validTo },
    });
}

describe('parseTlsCredentials', () => {
    it('accepts a key, a certificate and the CA that fit together', async () => {
        const files = await issueFiles();

        expect(parseTlsCredentials(files).validTo.getTime()).toBeGreaterThan(Date.now());
    });

    it('refuses a key of another certificate', async () => {
        const files = await issueFiles();
        const other = await issueFiles();

        expect(() => parseTlsCredentials({
            ...files,
            key: other.key,
        })).toThrow('does not belong');
    });

    it('refuses a certificate that another CA signed', async () => {
        const files = await issueFiles();
        const otherCa = await createTestCa('other-ca');

        expect(() => parseTlsCredentials({
            ...files,
            ca: otherCa.certificatePem,
        })).toThrow('not signed by the CA');
    });

    it('refuses a half-written file', async () => {
        const files = await issueFiles();

        expect(() => parseTlsCredentials({
            ...files,
            cert: files.cert.slice(0, 80),
        })).toThrow();
    });

    it('is valid from the start of the certificate until, but not including, its end', async () => {
        const files = await issueFiles();
        const credentials = parseTlsCredentials(files);

        expect(isTlsCredentialsValidAt(credentials, new Date())).toBe(true);
        expect(isTlsCredentialsValidAt(credentials, new Date(credentials.validFrom.getTime() - 1))).toBe(false);
        expect(isTlsCredentialsValidAt(credentials, credentials.validFrom)).toBe(true);
        expect(isTlsCredentialsValidAt(credentials, credentials.validTo)).toBe(false);
    });
});

describe('watchTlsCredentials', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    async function watch(initial: TlsFiles) {
        const onChange = vi.fn();
        const logger = {
            info: vi.fn(),
            error: vi.fn(),
        };

        mocks.readTlsFiles.mockResolvedValue(initial);

        const watcher = await watchTlsCredentials({ logger });

        watchers.push(watcher);
        watcher.credentials.subscribe(onChange);

        return {
            watcher,
            onChange,
            onError: logger.error,
            logger,
            replaceFiles: (files: TlsFiles) => {
                mocks.readTlsFiles.mockResolvedValue(files);
            },
        };
    }

    it('uses a renewal at the next poll, and stays quiet while the files do not change', async () => {
        const {
            watcher, onChange, onError, replaceFiles,
        } = await watch(await issueFiles());
        const renewed = await issueFiles();

        await vi.advanceTimersByTimeAsync(TLS_POLL_INTERVAL_MS);
        expect(onChange).not.toHaveBeenCalled();

        replaceFiles(renewed);
        await vi.advanceTimersByTimeAsync(TLS_POLL_INTERVAL_MS);

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(watcher.credentials.getValue().cert).toBe(renewed.cert);
        expect(onError).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(TLS_POLL_INTERVAL_MS);
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('logs a renewal once and gives it to every subscriber', async () => {
        const {
            watcher, onChange, logger, replaceFiles,
        } = await watch(await issueFiles());
        const secondSubscriber = vi.fn();

        watcher.credentials.subscribe(secondSubscriber);
        replaceFiles(await issueFiles());
        await vi.advanceTimersByTimeAsync(TLS_POLL_INTERVAL_MS);

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(secondSubscriber).toHaveBeenCalledTimes(1);
        expect(logger.info).toHaveBeenCalledTimes(1);
    });

    it('keeps the last good credentials and reports a broken snapshot', async () => {
        const initial = await issueFiles();
        const {
            watcher, onChange, onError, replaceFiles,
        } = await watch(initial);
        const other = await issueFiles();

        replaceFiles({
            ...initial,
            key: other.key,
        });
        await vi.advanceTimersByTimeAsync(TLS_POLL_INTERVAL_MS);

        expect(onChange).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledTimes(1);
        expect(watcher.credentials.getValue().cert).toBe(initial.cert);

        replaceFiles(other);
        await vi.advanceTimersByTimeAsync(TLS_POLL_INTERVAL_MS);
        expect(watcher.credentials.getValue().cert).toBe(other.cert);
    });

    it('starts with expired files, reports them, and takes the renewal later', async () => {
        const ca = await createTestCa();
        const expiring = await issueFiles({
            ca,
            validTo: new Date(Date.now() + HOUR_MS),
        });

        vi.setSystemTime(Date.now() + 2 * HOUR_MS);

        const {
            watcher, onChange, onError, replaceFiles,
        } = await watch(expiring);

        expect(onError).toHaveBeenCalledWith(...errorWith('The TLS certificate in use is not valid now'));

        const renewed = await issueFiles({
            ca,
            validTo: new Date(Date.now() + 24 * HOUR_MS),
        });

        replaceFiles(renewed);
        await vi.advanceTimersByTimeAsync(TLS_POLL_INTERVAL_MS);

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(watcher.credentials.getValue().cert).toBe(renewed.cert);
    });

    it('does not replace good credentials with an expired renewal', async () => {
        const {
            watcher, onChange, onError, replaceFiles,
        } = await watch(await issueFiles());
        const initialCert = watcher.credentials.getValue().cert;

        replaceFiles(await issueFiles({ validTo: new Date(Date.now() - 1) }));
        await vi.advanceTimersByTimeAsync(TLS_POLL_INTERVAL_MS);

        expect(onChange).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledWith(...errorWith('The renewed TLS certificate is not valid now'));
        expect(watcher.credentials.getValue().cert).toBe(initialCert);
    });

    it('does not replace good credentials with a renewal that is not valid yet', async () => {
        const {
            watcher, onChange, onError, replaceFiles,
        } = await watch(await issueFiles());
        const initialCert = watcher.credentials.getValue().cert;

        replaceFiles(await issueFiles({ validFrom: new Date(Date.now() + HOUR_MS) }));
        await vi.advanceTimersByTimeAsync(TLS_POLL_INTERVAL_MS);

        expect(onChange).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledWith(...errorWith('The renewed TLS certificate is not valid now'));
        expect(watcher.credentials.getValue().cert).toBe(initialCert);
    });

    it('reports once that the credentials in use have expired, and again after a renewal expires', async () => {
        const ca = await createTestCa();
        const {
            onError, replaceFiles,
        } = await watch(await issueFiles({
            ca,
            validTo: new Date(Date.now() + HOUR_MS),
        }));

        await vi.advanceTimersByTimeAsync(TLS_POLL_INTERVAL_MS);
        expect(onError).not.toHaveBeenCalled();

        vi.setSystemTime(Date.now() + 2 * HOUR_MS);
        await vi.advanceTimersByTimeAsync(TLS_POLL_INTERVAL_MS);
        await vi.advanceTimersByTimeAsync(TLS_POLL_INTERVAL_MS);
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith(...errorWith('The TLS certificate in use is not valid now'));

        replaceFiles(await issueFiles({
            ca,
            validTo: new Date(Date.now() + HOUR_MS),
        }));
        await vi.advanceTimersByTimeAsync(TLS_POLL_INTERVAL_MS);
        expect(onError).toHaveBeenCalledTimes(1);

        vi.setSystemTime(Date.now() + 2 * HOUR_MS);
        await vi.advanceTimersByTimeAsync(TLS_POLL_INTERVAL_MS);
        expect(onError).toHaveBeenCalledTimes(2);
    });

    it('does not apply a renewal that was read while stop() was called', async () => {
        const initial = await issueFiles();
        const renewed = await issueFiles();
        let finishRead: (files: TlsFiles) => void = () => undefined;
        const { watcher, onChange } = await watch(initial);

        mocks.readTlsFiles.mockReturnValueOnce(new Promise<TlsFiles>((resolve) => {
            finishRead = resolve;
        }));
        await vi.advanceTimersByTimeAsync(TLS_POLL_INTERVAL_MS);
        watcher.stop();
        finishRead(renewed);
        await vi.advanceTimersByTimeAsync(0);

        expect(onChange).not.toHaveBeenCalled();
        expect(watcher.credentials.getValue().cert).toBe(initial.cert);
    });

    it('fails to start without any credentials', async () => {
        mocks.readTlsFiles.mockRejectedValue(new Error('ENOENT'));

        await expect(watchTlsCredentials({
            logger: {
                info: vi.fn(),
                error: vi.fn(),
            },
        })).rejects.toThrow('ENOENT');
    });
});
