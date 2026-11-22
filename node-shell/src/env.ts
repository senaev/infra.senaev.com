import { requireEnv } from 'senaev-utils/src/utils/env/requireEnv/requireEnv';

/** The node that node-shell runs on, and enters itself (`nodeShell.vps` in the Helm values). */
export const NODE_SHELL_LOCAL_HOST = requireEnv('NODE_SHELL_LOCAL_HOST');
/** JSON `{ "<host>": "<user@host>" }`: the other hosts, reached with ssh from the local host. */
export const NODE_SHELL_SSH_DESTINATIONS = requireEnv('NODE_SHELL_SSH_DESTINATIONS');
/** A host directory, so the executions survive a restart of the pod. */
export const NODE_SHELL_STATE_DIRECTORY = requireEnv('NODE_SHELL_STATE_DIRECTORY');
