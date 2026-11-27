import { requireEnv } from 'senaev-utils/src/utils/env/requireEnv/requireEnv';

export const NODE_SHELL_LOCAL_HOST = requireEnv('NODE_SHELL_LOCAL_HOST');
export const NODE_SHELL_SSH_USER = requireEnv('NODE_SHELL_SSH_USER');

if (!/^[a-z_][a-z0-9_-]*$/.test(NODE_SHELL_SSH_USER)) {
    throw new Error(`Invalid NODE_SHELL_SSH_USER: ${NODE_SHELL_SSH_USER}`);
}

export const NODE_SHELL_STATE_DIRECTORY = requireEnv('NODE_SHELL_STATE_DIRECTORY');
