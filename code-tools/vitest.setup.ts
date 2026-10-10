// src/env.ts validates the environment at import time, so tests that import it need these
// values before the module graph is evaluated.
process.env.CODE_TOOLS_PROJECTS_PATH ??= '/tmp/code-tools-test-projects';
process.env.INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS ??= 'test-internal-token';
