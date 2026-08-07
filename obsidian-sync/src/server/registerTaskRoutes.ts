import type { VaultServer } from "./createVaultServer";
import { isObject } from "senaev-utils/src/utils/Object/isObject";
import { logger } from "../logger";
import { formatTaskLine } from "../tasks/formatTaskLine";
import { prependTaskLine } from "../tasks/prependTaskLine";

export function registerTaskRoutes(server: VaultServer): void {
    server.post<{ Body: unknown }>("/tasks", async (request, reply) => {
        const { body } = request;

        if (!isObject(body)) {
            return reply.code(400).type("text/plain").send("Request body must be a JSON object");
        }

        const { title, due_date: dueDate } = body;

        if (typeof title !== "string" || title.trim() === "") {
            return reply
                .code(400)
                .type("text/plain")
                .send('Field "title" is required and must be a non-empty string');
        }

        if (dueDate !== undefined && dueDate !== null && typeof dueDate !== "string") {
            return reply
                .code(400)
                .type("text/plain")
                .send('Field "due_date" must be a string or null');
        }

        const normalizedDueDate =
            typeof dueDate === "string" && dueDate.trim() !== "" ? dueDate.trim() : null;
        const line = formatTaskLine(title.trim(), normalizedDueDate);

        try {
            await prependTaskLine(line);
        } catch (error) {
            logger.error(error, "❌ Failed to write task to vault");
            return reply.code(500).type("text/plain").send("Internal Server Error");
        }

        logger.info({ line }, "✅ Task added");
        return reply.code(201).type("text/plain").send("Created");
    });
}
