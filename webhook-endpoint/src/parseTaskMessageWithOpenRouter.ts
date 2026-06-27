import { callOpenRouter } from "./openrouter";

export type ParsedTaskMessage = {
    title: string;
    due_date: string | null;
};

export async function parseTaskMessageWithOpenRouter(
    message: string,
): Promise<ParsedTaskMessage> {
    const today = new Date().toISOString().slice(0, 10);

    const parsed = await callOpenRouter<ParsedTaskMessage>({
        messages: [
            {
                role: "system",
                content: [
                    `Today's date is ${today}.`,
                    "You are parsing a Telegram message into a task record.",
                    "Extract the task description and an optional due date from the message.",
                    "The title should be a clear, concise description of what needs to be done.",
                    "If the message mentions a due date or deadline (e.g. 'tomorrow', 'by Friday', 'on Monday', specific dates), extract it as due_date in YYYY-MM-DD format.",
                    "If no due date is mentioned, return null for due_date.",
                    "Answer strictly in JSON that matches the provided schema.",
                ].join(" "),
            },
            {
                role: "user",
                content: message,
            },
        ],
        jsonSchema: {
            name: "task_message",
            schema: {
                type: "object",
                properties: {
                    title: { type: "string" },
                    due_date: { type: ["string", "null"] },
                },
                required: ["title", "due_date"],
                additionalProperties: false,
            },
        },
    });

    if (typeof parsed.title !== "string" || parsed.title.trim() === "") {
        throw new Error(
            `OpenRouter response title field is invalid [${JSON.stringify(parsed, null, 2)}]`,
        );
    }

    if (parsed.due_date !== null && typeof parsed.due_date !== "string") {
        throw new Error(
            `OpenRouter response due_date field is invalid [${JSON.stringify(parsed, null, 2)}]`,
        );
    }

    return parsed;
}
