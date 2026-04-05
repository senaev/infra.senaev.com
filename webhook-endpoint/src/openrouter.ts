import { OPENROUTER_API_KEY, WEBHOOK_DOMAIN } from "./env.js";
import { ALISA_SKILL_NAME } from "./processAlisaCommand.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "google/gemini-3-flash-preview";
const OPENROUTER_TIMEOUT_MS = 60_000;

type OpenRouterResponse = {
    choices?: Array<{
        message?: {
            content?: string;
        };
    }>;
};

export type ParsedAlisaCommand = {
    items: string[];
    error: string | null;
};

export async function parseAlisaCommandWithOpenRouter(
    command: string,
): Promise<ParsedAlisaCommand> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort(
            new Error(`OpenRouter request timed out after ${OPENROUTER_TIMEOUT_MS}ms`),
        );
    }, OPENROUTER_TIMEOUT_MS);

    let response: Response;
    try {
        response = await fetch(OPENROUTER_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": `https://${WEBHOOK_DOMAIN}`,
                "X-Title": "senaev.com webhook-endpoint",
            },
            body: JSON.stringify({
                model: OPENROUTER_MODEL,
                temperature: 0,
                messages: [
                    {
                        role: "system",
                        content: [
                            `## Command`,
                            `You are processing the Yandex Alisa skill named '${ALISA_SKILL_NAME}'.`,
                            "This skill is dedicated to managing a single shopping list.",
                            "If the user asks to add something to the shopping list, return only the list of items to add.",
                            "All the items in the response should be in initial form, but avoid losing details like amount, quantity or anything else.",
                            "All the items in the response should start from capital letter, as they will be directly added to the shopping list.",
                            "Answer strictly in JSON that matches the provided schema.",
                            "Preserve item names and error message in Russian.",
                            "## Errors",
                            "If the user asks for anything else, return an error and short explanation.",
                        ].join(" "),
                    },
                    {
                        role: "user",
                        content: command,
                    },
                ],
                response_format: {
                    type: "json_schema",
                    json_schema: {
                        name: "alisa_shopping_command",
                        strict: true,
                        schema: {
                            type: "object",
                            properties: {
                                items: {
                                    type: "array",
                                    items: {
                                        type: "string",
                                    },
                                },
                                error: {
                                    type: ["string", "null"],
                                },
                            },
                            required: ["items", "error"],
                            additionalProperties: false,
                        },
                    },
                },
            }),
            signal: controller.signal,
        });
    } catch (error) {
        if (controller.signal.aborted) {
            throw controller.signal.reason;
        }

        throw error;
    } finally {
        clearTimeout(timeoutId);
    }

    if (!response.ok) {
        throw new Error(`OpenRouter request failed: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as OpenRouterResponse;
    const content = data.choices?.[0]?.message?.content;

    if (typeof content !== "string") {
        throw new Error("OpenRouter response did not contain message content");
    }

    const parsed = JSON.parse(content) as ParsedAlisaCommand;

    if (!Array.isArray(parsed.items)) {
        throw new Error(
            `OpenRouter response items field is invalid [${JSON.stringify(parsed, null, 2)}]`,
        );
    }

    if (parsed.error !== null && typeof parsed.error !== "string") {
        throw new Error(
            `OpenRouter response error field is invalid [${JSON.stringify(parsed, null, 2)}]`,
        );
    }

    return parsed;
}
