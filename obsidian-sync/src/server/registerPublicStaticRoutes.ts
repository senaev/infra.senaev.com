import fastifyStatic from "@fastify/static";
import { mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../logger";
import { PUBLIC_STATIC_DIR } from "../vaultPaths";
import { VaultServer } from "./createVaultServer";

export const PUBLIC_STATIC_PREFIX = "/public-static/";

/**
 * Serves `<vault>/public-static` byte-for-byte, preserving the directory
 * layout: `GET /public-static/folder/index.html` reads
 * `<vault>/public-static/folder/index.html`. This is what backs
 * https://static.senaev.com, which Traefik rewrites onto this prefix before
 * passing it to webhook-endpoint, which in turn proxies it here.
 *
 * @fastify/static does the work on purpose rather than a hand-written file
 * read. Because the request path is meaningful here — unlike the `?file=`
 * route, which throws away everything but the basename — serving these files
 * safely means resolving the path and proving it stayed inside the root. The
 * vault holds private notes, so a `..` segment or a stray symlink that escaped
 * would leak all of them. It also brings ETag, Last-Modified, Range support
 * and streaming, none of which the `?file=` route has.
 */
export function registerPublicStaticRoutes(server: VaultServer): void {
    // @fastify/static throws at registration if the root is missing, and the
    // directory only appears once the user creates it in Obsidian. Idempotent:
    // an existing directory is left untouched.
    mkdirSync(PUBLIC_STATIC_DIR, { recursive: true });

    // Resolved once so the check below compares like with like: realpathSync
    // expands every symlink in a path, so a resolved file would never match an
    // unresolved root if the vault itself ever sat behind one.
    const realRoot = realpathSync(PUBLIC_STATIC_DIR);

    server.register(fastifyStatic, {
        root: PUBLIC_STATIC_DIR,
        prefix: PUBLIC_STATIC_PREFIX,
        // `/folder/` and `/folder` both resolve to `/folder/index.html`.
        index: ["index.html"],
        // A missing index must 404 rather than reveal the directory contents.
        list: false,
        dotfiles: "deny",
        etag: true,
        lastModified: true,
        /**
         * Confines the response to files that really live under the root.
         *
         * The plugin already blocks `..` in the request path, but it resolves
         * symlinks by simply opening whatever they point at. One symlink placed
         * in `public-static` — by hand, or by a sync client — would publish
         * every private note in the vault. Comparing real paths is the only way
         * to catch that, because the requested path looks innocent either way.
         */
        allowedPath: (pathName: string): boolean => {
            try {
                return realpathSync(join(realRoot, pathName)).startsWith(realRoot);
            } catch {
                // Missing file: let the plugin answer with its normal 404.
                return true;
            }
        },
    });

    logger.info({ publicStaticDir: PUBLIC_STATIC_DIR }, "✅ Public static routes registered");
}
