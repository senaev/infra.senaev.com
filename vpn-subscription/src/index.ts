import Fastify from "fastify";
import { createHash } from "node:crypto";
import {
    PORT,
    SUBSCRIPTION_ENTRIES,
    VPN_SUBSCRIPTION_SECRET,
    XRAY_REALITY_PUBLIC_KEY,
    XRAY_USER_UUID,
} from "./env.js";
import { renderInstructionsPage } from "./renderInstructionsPage.js";

const server = Fastify({ logger: true });

const macroValues: Record<string, string> = {
    XRAY_REALITY_PUBLIC_KEY,
    XRAY_USER_UUID,
};

function deriveUuid(baseValue: string, seed: string): string {
    const derivedSeed = createHash("sha256")
        .update(`${baseValue}:${seed}`)
        .digest("hex")
        .substring(0, 32);

    return `${derivedSeed.substr(0, 8)}-${derivedSeed.substr(8, 4)}-${derivedSeed.substr(12, 4)}-${derivedSeed.substr(16, 4)}-${derivedSeed.substr(20)}`;
}

function replaceMacros(value: string): string {
    return value.replaceAll(
        /\{([A-Z0-9_]+)(?::([^}]*))?\}/g,
        (match, macroName: string, seed: string | undefined) => {
            if (macroName === "XRAY_USER_UUID") {
                if (seed === undefined) {
                    throw new Error(`Missing seed for macro: ${match}`);
                }

                return deriveUuid(XRAY_USER_UUID, seed);
            }

            const replacement = macroValues[macroName];
            if (replacement === undefined) {
                throw new Error(`Unsupported macro: ${match}`);
            }

            return replacement;
        },
    );
}

function withName(link: string, name: string): string {
    const [baseLink] = link.split("#", 1);
    return `${baseLink}#${encodeURIComponent(name)}`;
}

function isVpnUserAgent(userAgent: string): boolean {
    // HiddifyNext/4.0.0 (ios) like ClashMeta v2ray sing-box
    if (userAgent.includes("HiddifyNext/")) {
        return true;
    }

    // Happ/4.5.0/ios CFNetwork/3860.400.51 Darwin/25.3.0
    if (userAgent.includes("Happ/")) {
        return true;
    }

    return false;
}

const subscriptionBody = `${SUBSCRIPTION_ENTRIES.map((entry) =>
    withName(replaceMacros(entry.link), entry.name),
).join("\n")}\n`;

server.get<{ Params: { secret: string } }>("/:secret", async (request, reply) => {
    if (request.params.secret !== VPN_SUBSCRIPTION_SECRET) {
        return reply.code(403).type("text/plain; charset=utf-8").send("❌ Forbidden");
    }

    const userAgent = request.headers["user-agent"] ?? "";

    const isVpnApp = isVpnUserAgent(userAgent);

    if (isVpnApp) {
        return reply
            .header("Cache-Control", "no-store")
            .type("text/plain; charset=utf-8")
            .send(subscriptionBody);
    }

    return reply
        .header("Cache-Control", "no-store")
        .type("text/html; charset=utf-8")
        .send(
            renderInstructionsPage(
                `https://vpn-subscription.senaev.com/${VPN_SUBSCRIPTION_SECRET}`,
            ),
        );
});

async function main(): Promise<void> {
    await server.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`✅ VPN subscription server listening on port=${PORT}`);
}

async function shutdown(): Promise<void> {
    await server.close();
    process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
