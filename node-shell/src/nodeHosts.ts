import { isObject } from 'senaev-utils/src/types/Object/Object';

/**
 * The hosts that accept commands. node-shell runs on `localHost` and enters that host itself;
 * it reaches each of the others with `ssh <destination>` from there, with the SSH key of the
 * host's root.
 */
export type NodeHosts = {
    localHost: string;
    sshDestinations: ReadonlyMap<string, string>;
};

const HOST_NAME = /^[a-z0-9][a-z0-9-]*$/;
// `user@host`, nothing that ssh could read as an option or a second argument.
const SSH_DESTINATION = /^[a-z_][a-z0-9_-]*@[a-z0-9][a-z0-9.-]*$/;

/** Reads the Helm values: the local host name and a JSON object `{ "<host>": "<user@host>" }`. */
export function parseNodeHosts(localHost: string, sshDestinationsJson: string): NodeHosts {
    if (!HOST_NAME.test(localHost)) {
        throw new Error(`Invalid local host name: ${localHost}`);
    }

    const parsed: unknown = JSON.parse(sshDestinationsJson);

    if (!isObject(parsed) || Array.isArray(parsed)) {
        throw new Error('The SSH destinations must be a JSON object');
    }

    const sshDestinations = new Map<string, string>();

    for (const [
        host,
        destination,
    ] of Object.entries(parsed)) {
        if (!HOST_NAME.test(host) || typeof destination !== 'string' || !SSH_DESTINATION.test(destination)) {
            throw new Error(`Invalid SSH destination for host ${host}`);
        }

        if (host === localHost) {
            throw new Error(`The local host ${host} must not have an SSH destination`);
        }

        sshDestinations.set(host, destination);
    }

    return {
        localHost,
        sshDestinations,
    };
}

export function isKnownHost(hosts: NodeHosts, host: string): boolean {
    return host === hosts.localHost || hosts.sshDestinations.has(host);
}
