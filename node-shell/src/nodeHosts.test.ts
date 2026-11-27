import {
    beforeEach, describe, expect, it, vi,
} from 'vitest';

import { LIST_NODES_ARGV, resolveHost } from './nodeHosts';
import { runCommand } from './runCommand';

vi.mock('./env', () => {
    return {
        NODE_SHELL_LOCAL_HOST: 'hetzner',
    };
});
vi.mock('./logger', () => {
    return { logger: { info: vi.fn() } };
});
vi.mock('./runCommand', () => {
    return { runCommand: vi.fn() };
});

const listed = (stdout: string, exitCode: number) => {
    return {
        exitCode,
        signal: null,
        stdout,
        stderr: exitCode === 0 ? '' : 'connection refused',
        outputTruncated: false,
        deadlineExceeded: false,
    };
};

describe('resolveHost', () => {
    beforeEach(() => {
        vi.mocked(runCommand).mockReset().mockResolvedValue(listed('hetzner\nsenaev-madrid\n\n-oProxyCommand=id\nfirstvds\n', 0));
    });

    it('rejects a node list cut at the output limit', async () => {
        vi.mocked(runCommand).mockResolvedValue({
            ...listed('hetzner\n', 0),
            outputTruncated: true,
        });

        await expect(resolveHost('senaev-madrid')).rejects.toThrow('more than the limit');
    });

    it('runs the local host locally without reading the node list', async () => {
        await expect(resolveHost('hetzner')).resolves.toEqual({ kind: 'local' });
        expect(runCommand).not.toHaveBeenCalled();
    });

    it('reaches another cluster node through ssh, reading the node list on every call', async () => {
        await expect(resolveHost('senaev-madrid')).resolves.toEqual({
            kind: 'ssh',
            destination: 'root@senaev-madrid',
        });
        await expect(resolveHost('firstvds')).resolves.toMatchObject({ kind: 'ssh' });
        expect(runCommand).toHaveBeenCalledTimes(2);
        expect(vi.mocked(runCommand).mock.lastCall?.[0].argv).toBe(LIST_NODES_ARGV);
    });

    it('refuses a host that is not a node, and a name that is not a valid label', async () => {
        await expect(resolveHost('galkin')).resolves.toBeUndefined();
        await expect(resolveHost('-oProxyCommand=id')).resolves.toBeUndefined();
        await expect(resolveHost('root@senaev-madrid')).resolves.toBeUndefined();
    });

    it('rejects when kubectl fails', async () => {
        vi.mocked(runCommand).mockResolvedValue(listed('', 1));

        await expect(resolveHost('senaev-madrid')).rejects.toThrow('kubectl get nodes failed with exit code 1: connection refused');
    });
});
