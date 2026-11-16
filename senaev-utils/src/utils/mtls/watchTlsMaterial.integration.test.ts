import {
    afterEach, describe, expect, it, vi,
} from 'vitest';

import { createTestCa, issueTestCertificate } from './testPki';
import {
    isTlsMaterialValidAt, parseTlsMaterial, type TlsFiles,
} from './tlsMaterial';
import { watchTlsMaterial, type TlsMaterialWatcher } from './watchTlsMaterial';

const HOUR_MS = 3_600_000;
const POLL_MS = 1_000;

const watchers: TlsMaterialWatcher[] = [];

afterEach(() => {
    watchers.splice(0).forEach((watcher) => watcher.stop());
    vi.useRealTimers();
});

async function issueFiles(options: { ca?: Awaited<ReturnType<typeof createTestCa>>; notAfter?: Date } = {}): Promise<TlsFiles> {
    const ca = options.ca ?? await createTestCa();

    return issueTestCertificate({
        ca,
        dnsName: 'service.test',
        usage: 'server',
        ...options.notAfter && { notAfter: options.notAfter },
    });
}

describe('parseTlsMaterial', () => {
    it('accepts a key, a certificate and the CA that fit together', async () => {
        const files = await issueFiles();

        expect(parseTlsMaterial(files).notAfter.getTime()).toBeGreaterThan(Date.now());
    });

    it('refuses a key of another certificate', async () => {
        const files = await issueFiles();
        const other = await issueFiles();

        expect(() => parseTlsMaterial({
            ...files,
            key: other.key,
        })).toThrow('does not belong');
    });

    it('refuses a certificate that another CA signed', async () => {
        const files = await issueFiles();
        const otherCa = await createTestCa('other-ca');

        expect(() => parseTlsMaterial({
            ...files,
            ca: otherCa.certificatePem,
        })).toThrow('not signed by the CA');
    });

    it('refuses a half-written file', async () => {
        const files = await issueFiles();

        expect(() => parseTlsMaterial({
            ...files,
            cert: files.cert.slice(0, 80),
        })).toThrow();
    });

    it('reports expiry only for a time at or after the end of the certificate', async () => {
        const files = await issueFiles();
        const material = parseTlsMaterial(files);

        expect(isTlsMaterialValidAt(material, new Date())).toBe(true);
        expect(isTlsMaterialValidAt(material, material.notAfter)).toBe(false);
    });
});

describe('watchTlsMaterial', () => {
    async function watch(initial: TlsFiles, options: { now?: () => Date } = {}) {
        let current = initial;
        const onChange = vi.fn();
        const onError = vi.fn();
        const watcher = await watchTlsMaterial({
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
        expect(watcher.material.cert).toBe(renewed.cert);
        expect(onError).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(POLL_MS);
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('keeps the last good material and reports a broken snapshot', async () => {
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
        expect(watcher.material.cert).toBe(initial.cert);

        replaceFiles(other);
        await vi.advanceTimersByTimeAsync(POLL_MS);
        expect(watcher.material.cert).toBe(other.cert);
    });

    it('starts with expired files, reports them, and takes the renewal later', async () => {
        vi.useFakeTimers();
        const ca = await createTestCa();
        const {
            watcher, onChange, onError, replaceFiles,
        } = await watch(
            await issueFiles({
                ca,
                notAfter: new Date(Date.now() + HOUR_MS),
            }),
            { now: () => new Date(Date.now() + 2 * HOUR_MS) }
        );

        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'The loaded TLS certificate is expired' }));

        const renewed = await issueFiles({
            ca,
            notAfter: new Date(Date.now() + 24 * HOUR_MS),
        });

        replaceFiles(renewed);
        await vi.advanceTimersByTimeAsync(POLL_MS);

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(watcher.material.cert).toBe(renewed.cert);
    });

    it('does not replace good material with an expired renewal', async () => {
        vi.useFakeTimers();
        const {
            watcher, onChange, onError, replaceFiles,
        } = await watch(await issueFiles());
        const initialCert = watcher.material.cert;

        replaceFiles(await issueFiles({ notAfter: new Date(Date.now() - 1) }));
        await vi.advanceTimersByTimeAsync(POLL_MS);

        expect(onChange).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'The renewed TLS certificate is already expired' }));
        expect(watcher.material.cert).toBe(initialCert);
    });

    it('fails to start without any material', async () => {
        await expect(watchTlsMaterial({
            directory: 'unused',
            readFiles: () => Promise.reject(new Error('ENOENT')),
            onChange: vi.fn(),
            onError: vi.fn(),
        })).rejects.toThrow('ENOENT');
    });
});
