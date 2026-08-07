import { logger } from "../logger";
import { PUBLIC_DIR } from "../vaultPaths";
import { createVaultServer } from "./createVaultServer";
import { registerPublicFileRoutes } from "./registerPublicFileRoutes";
import { registerShortLinkRoutes } from "./registerShortLinkRoutes";
import { registerTaskRoutes } from "./registerTaskRoutes";

const HOST = "0.0.0.0";
const PORT = 8080;

/** Starts the vault HTTP API and resolves once it is accepting connections. */
export async function runVaultServer(): Promise<void> {
    const server = createVaultServer();

    registerTaskRoutes(server);
    registerShortLinkRoutes(server);
    // Registered last because it installs a catch-all GET route.
    registerPublicFileRoutes(server);

    await server.listen({ port: PORT, host: HOST });
    logger.info({ port: PORT, publicDir: PUBLIC_DIR }, "✅ Vault server listening");
}
