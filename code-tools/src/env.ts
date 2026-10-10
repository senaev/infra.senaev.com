import { requireEnv } from 'senaev-utils/src/utils/env/requireEnv/requireEnv';

/** The folder with one cloned repository per project, `/projects/git` in the container. */
export const CODE_TOOLS_PROJECTS_PATH = requireEnv('CODE_TOOLS_PROJECTS_PATH');

/** cluster-helper sends it on every call; every route requires it. */
export const INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS = requireEnv('INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS');
