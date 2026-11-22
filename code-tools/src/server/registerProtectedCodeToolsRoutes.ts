import type { FastifyInstance } from 'fastify';
import { registerMtlsCallerAllowlist } from 'senaev-utils/src/utils/mtls/registerMtlsCallerAllowlist';

import type { CodeToolsConfig } from '../tools/codeToolsConfig';

import { ALLOWED_CALLERS } from './callers';
import { registerCodeToolsRoutes } from './registerCodeToolsRoutes';

/** Everything the tools can do. Only for the mTLS instance: only the services in `ALLOWED_CALLERS` may call it. */
export function registerProtectedCodeToolsRoutes(
    server: Pick<FastifyInstance, 'addHook' | 'post'>,
    config: CodeToolsConfig
): void {
    // First, so the check covers every route registered below. The caller is already
    // authenticated by `createMtlsFastifyServer`.
    registerMtlsCallerAllowlist(server, ALLOWED_CALLERS);
    registerCodeToolsRoutes(server, config);
}
