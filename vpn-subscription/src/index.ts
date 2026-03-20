import Fastify from "fastify";
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

function replaceMacros(value: string): string {
    return value.replaceAll(/\{([A-Z0-9_]+)\}/g, (match, macroName: string) => {
        const replacement = macroValues[macroName];
        if (replacement === undefined) {
            throw new Error(`Unsupported macro: ${match}`);
        }

        return replacement;
    });
}

function withName(link: string, name: string): string {
    const [baseLink] = link.split("#", 1);
    return `${baseLink}#${encodeURIComponent(name)}`;
}

function isVpnUserAgent(userAgent: string): boolean {
    return userAgent.includes("Happ/") || userAgent.includes("HiddifyNext/");
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
