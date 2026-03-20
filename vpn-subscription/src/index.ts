import Fastify from "fastify";
import { timingSafeEqual } from "node:crypto";
import {
    PORT,
    SUBSCRIPTION_ENTRIES,
    VPN_SUBSCRIPTION_SECRET,
    XRAY_REALITY_PUBLIC_KEY,
    XRAY_USER_UUID,
} from "./env.js";

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

function isSecretValid(secret: string): boolean {
    const provided = Buffer.from(secret);
    const expected = Buffer.from(VPN_SUBSCRIPTION_SECRET);
    return provided.length === expected.length && timingSafeEqual(provided, expected);
}

const subscriptionBody = `${SUBSCRIPTION_ENTRIES.map((entry) =>
    withName(replaceMacros(entry.link), replaceMacros(entry.name)),
).join("\n")}\n`;

server.get("/", async () => "VPN subscription endpoint is running");

server.get<{ Params: { secret: string } }>("/:secret", async (request, reply) => {
    if (!isSecretValid(request.params.secret)) {
        return reply.code(403).type("text/plain; charset=utf-8").send("Forbidden");
    }

    return reply
        .header("Cache-Control", "no-store")
        .type("text/plain; charset=utf-8")
        .send(subscriptionBody);
});

async function main(): Promise<void> {
    await server.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`VPN subscription server listening on port=${PORT}`);
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
