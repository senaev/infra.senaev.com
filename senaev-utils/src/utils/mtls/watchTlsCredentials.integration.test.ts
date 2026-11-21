import {
    afterEach, describe, expect, it, vi,
} from 'vitest';

import { createTestCa, issueTestCertificate } from './testPki';
import {
    isTlsCredentialsValidAt, parseTlsCredentials, type TlsFiles,
} from './tlsCredentials';
import { watchTlsCredentials, type TlsCredentialsWatcher } from './watchTlsCredentials';

const HOUR_MS = 3_600_000;
const POLL_MS = 1_000;

const watchers: TlsCredentialsWatcher[] = [];

afterEach(() => {
    watchers.splice(0).forEach((watcher) => watcher.stop());
    vi.useRealTimers();
});

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
    async function watch(initial: TlsFiles, options: { now?: () => Date } = {}) {
        let current = initial;
        const onChange = vi.fn();
        const onError = vi.fn();
        const watcher = await watchTlsCredentials({
            directory: 'unused',
            pollIntervalMs: POLL_MS,
            readFiles: () => Promise.resolve(current),
            onChange,
            onError,
            ...options,
        });

        watchers.push(watcher);

        return {
            watcher,
            onChange,
            onError,
            replaceFiles: (files: TlsFiles) => {
                current = files;
            },
        };
    }

    it('uses a renewal at the next poll, and stays quiet while the files do not change', async () => {
        vi.useFakeTimers();
        const {
            watcher, onChange, onError, replaceFiles,
        } = await watch(await issueFiles());
        const renewed = await issueFiles();

        await vi.advanceTimersByTimeAsync(POLL_MS);
        expect(onChange).not.toHaveBeenCalled();

        replaceFiles(renewed);
        await vi.advanceTimersByTimeAsync(POLL_MS);

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(watcher.credentials.cert).toBe(renewed.cert);
        expect(onError).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(POLL_MS);
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('keeps the last good credentials and reports a broken snapshot', async () => {
        vi.useFakeTimers();
        const initial = await issueFiles();
        const {
            watcher, onChange, onError, replaceFiles,
        } = await watch(initial);
        const other = await issueFiles();

        replaceFiles({
            ...initial,
            key: other.key,
        });
        await vi.advanceTimersByTimeAsync(POLL_MS);

        expect(onChange).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledTimes(1);
        expect(watcher.credentials.cert).toBe(initial.cert);

        replaceFiles(other);
        await vi.advanceTimersByTimeAsync(POLL_MS);
        expect(watcher.credentials.cert).toBe(other.cert);
    });

    it('starts with expired files, reports them, and takes the renewal later', async () => {
        vi.useFakeTimers();
        const ca = await createTestCa();
        const {
            watcher, onChange, onError, replaceFiles,
        } = await watch(
            await issueFiles({
                ca,
                validTo: new Date(Date.now() + HOUR_MS),
            }),
            { now: () => new Date(Date.now() + 2 * HOUR_MS) }
        );

        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'The TLS certificate in use is not valid now' }));

        const renewed = await issueFiles({
            ca,
            validTo: new Date(Date.now() + 24 * HOUR_MS),
        });

        replaceFiles(renewed);
        await vi.advanceTimersByTimeAsync(POLL_MS);

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(watcher.credentials.cert).toBe(renewed.cert);
    });

    it('does not replace good credentials with an expired renewal', async () => {
        vi.useFakeTimers();
        const {
            watcher, onChange, onError, replaceFiles,
        } = await watch(await issueFiles());
        const initialCert = watcher.credentials.cert;

        replaceFiles(await issueFiles({ validTo: new Date(Date.now() - 1) }));
        await vi.advanceTimersByTimeAsync(POLL_MS);

        expect(onChange).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'The renewed TLS certificate is not valid now' }));
        expect(watcher.credentials.cert).toBe(initialCert);
    });

    it('does not replace good credentials with a renewal that is not valid yet', async () => {
        vi.useFakeTimers();
        const {
            watcher, onChange, onError, replaceFiles,
        } = await watch(await issueFiles());
        const initialCert = watcher.credentials.cert;

        replaceFiles(await issueFiles({ validFrom: new Date(Date.now() + HOUR_MS) }));
        await vi.advanceTimersByTimeAsync(POLL_MS);

        expect(onChange).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'The renewed TLS certificate is not valid now' }));
        expect(watcher.credentials.cert).toBe(initialCert);
    });

    it('reports once that the credentials in use have expired, and again after a renewal expires', async () => {
        vi.useFakeTimers();
        let currentTime = new Date();
        const ca = await createTestCa();
        const {
            onError, replaceFiles,
        } = await watch(
            await issueFiles({
                ca,
                validTo: new Date(currentTime.getTime() + HOUR_MS),
            }),
            { now: () => currentTime }
        );

        await vi.advanceTimersByTimeAsync(POLL_MS);
        expect(onError).not.toHaveBeenCalled();

        currentTime = new Date(currentTime.getTime() + 2 * HOUR_MS);
        await vi.advanceTimersByTimeAsync(POLL_MS);
        await vi.advanceTimersByTimeAsync(POLL_MS);
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'The TLS certificate in use is not valid now' }));

        replaceFiles(await issueFiles({
            ca,
            validTo: new Date(currentTime.getTime() + HOUR_MS),
        }));
        await vi.advanceTimersByTimeAsync(POLL_MS);
        expect(onError).toHaveBeenCalledTimes(1);

        currentTime = new Date(currentTime.getTime() + 2 * HOUR_MS);
        await vi.advanceTimersByTimeAsync(POLL_MS);
        expect(onError).toHaveBeenCalledTimes(2);
    });

    it('does not apply a renewal that was read while stop() was called', async () => {
        vi.useFakeTimers();
        const initial = await issueFiles();
        const renewed = await issueFiles();
        const onChange = vi.fn();
        let finishRead: (files: TlsFiles) => void = () => undefined;
        let reads = 0;
        const watcher = await watchTlsCredentials({
            directory: 'unused',
            pollIntervalMs: POLL_MS,
            readFiles: () => {
                reads += 1;

                return reads === 1
                    ? Promise.resolve(initial)
                    : new Promise<TlsFiles>((resolve) => {
                        finishRead = resolve;
                    });
            },
            onChange,
            onError: vi.fn(),
        });

        watchers.push(watcher);
        await vi.advanceTimersByTimeAsync(POLL_MS);
        watcher.stop();
        finishRead(renewed);
        await vi.advanceTimersByTimeAsync(0);

        expect(onChange).not.toHaveBeenCalled();
        expect(watcher.credentials.cert).toBe(initial.cert);
    });

    it('fails to start without any credentials', async () => {
        await expect(watchTlsCredentials({
            directory: 'unused',
            readFiles: () => Promise.reject(new Error('ENOENT')),
            onChange: vi.fn(),
            onError: vi.fn(),
        })).rejects.toThrow('ENOENT');
    });
});
