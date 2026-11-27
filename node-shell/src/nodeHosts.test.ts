import {
    beforeEach, describe, expect, it, vi,
} from 'vitest';

import {
    createHostResolver, NODE_LIST_TTL_MS, parseNodeList,
} from './nodeHosts';

describe('parseNodeList', () => {
    it('reads one vps label per line, and leaves out empty and invalid ones', () => {
        expect(parseNodeList('hetzner\nsenaev-madrid\n\n-oProxyCommand=id\nroot@x\nsenaev-madrid\n'))
            .toEqual([
                'hetzner',
                'senaev-madrid',
            ]);
    });
});

describe('createHostResolver', () => {
    let clock: number;
    const listNodes = vi.fn<() => Promise<string[]>>();
    const create = () => createHostResolver({
        localHost: 'hetzner',
        sshUser: 'root',
        listNodes,
        now: () => clock,
    });

    beforeEach(() => {
        clock = 0;
        listNodes.mockReset().mockResolvedValue([
            'hetzner',
            'senaev-madrid',
            'firstvds',
        ]);
    });

    it('runs the local host locally, other nodes through ssh, and refuses the rest', async () => {
        const hosts = create();

        await expect(hosts.resolve('hetzner')).resolves.toEqual({ kind: 'local' });
        await expect(hosts.resolve('senaev-madrid')).resolves.toEqual({
            kind: 'ssh',
            destination: 'root@senaev-madrid',
        });
        await expect(hosts.resolve('galkin')).resolves.toBeUndefined();
        await expect(hosts.resolve('-oProxyCommand=id')).resolves.toBeUndefined();
    });

    it('reads the node list once per TTL, shared by concurrent requests', async () => {
        const hosts = create();

        await Promise.all([
            hosts.resolve('firstvds'),
            hosts.resolve('senaev-madrid'),
        ]);
        clock = NODE_LIST_TTL_MS - 1;
        await hosts.resolve('firstvds');
        expect(listNodes).toHaveBeenCalledOnce();

        listNodes.mockResolvedValue([
            'hetzner',
            'firstvds',
            'new-node',
        ]);
        clock = NODE_LIST_TTL_MS;
        await expect(hosts.resolve('new-node')).resolves.toEqual({
            kind: 'ssh',
            destination: 'root@new-node',
        });
        await expect(hosts.resolve('senaev-madrid')).resolves.toBeUndefined();
        expect(listNodes).toHaveBeenCalledTimes(2);
    });

    it('fails a remote host when the list cannot be read, and tries again on the next request', async () => {
        const hosts = create();

        listNodes.mockRejectedValueOnce(new Error('kubectl failed'));

        await expect(hosts.resolve('firstvds')).rejects.toThrow('kubectl failed');
        await expect(hosts.resolve('hetzner')).resolves.toEqual({ kind: 'local' });
        await expect(hosts.resolve('firstvds')).resolves.toMatchObject({ kind: 'ssh' });
    });

    it('refuses an invalid local host or SSH user', () => {
        expect(() => createHostResolver({
            localHost: 'Bad Host',
            sshUser: 'root',
            listNodes,
        })).toThrow();
        expect(() => createHostResolver({
            localHost: 'hetzner',
            sshUser: '-oProxyCommand=id',
            listNodes,
        })).toThrow();
    });
});
