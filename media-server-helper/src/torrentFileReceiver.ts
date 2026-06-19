import Fastify from "fastify";
import { isObject } from "senaev-utils/src/utils/Object/isObject";
import { logger } from "./logger";

const PORT = 3000;
const BODY_LIMIT_BYTES = 50 * 1024 * 1024;

type TorrentFileRequestBody = {
    fileName: string;
    contentBase64: string;
};

function isTorrentFileRequestBody(value: unknown): value is TorrentFileRequestBody {
    return (
        isObject(value) &&
        typeof value.fileName === "string" &&
        typeof value.contentBase64 === "string"
    );
}

function badRequest(message: string): Error & { statusCode: number } {
    return Object.assign(new Error(message), { statusCode: 400 });
}

export async function runTorrentFileReceiver(
    writeFile: (buffer: Buffer, fileName: string) => string,
): Promise<void> {
    const server = Fastify({ bodyLimit: BODY_LIMIT_BYTES, loggerInstance: logger });

    server.post<{ Body: unknown }>("/torrent-files", async (request, reply) => {
        if (!isTorrentFileRequestBody(request.body)) {
            logger.error(
                { bodyType: typeof request.body, body: request.body },
                "❌ Invalid torrent file request body",
            );
            throw badRequest("Invalid torrent file request body");
        }

        const buffer = Buffer.from(request.body.contentBase64, "base64");
        if (buffer.length === 0) {
            logger.error({ fileName: request.body.fileName }, "❌ Received empty torrent file");
            throw badRequest("Empty torrent file");
        }

        const path = writeFile(buffer, request.body.fileName);
        logger.info({ path }, "✅ Wrote torrent file from HTTP request");
        return reply.send("OK");
    });

    await server.listen({ port: PORT, host: "0.0.0.0" });
    logger.info({ port: PORT }, "✅ Torrent file receiver listening");
}
