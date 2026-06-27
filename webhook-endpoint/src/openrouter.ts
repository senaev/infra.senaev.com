import { OPENROUTER_API_KEY, WEBHOOK_DOMAIN } from "./env";

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

export async function callOpenRouter<T>({
    messages,
    jsonSchema,
}: {
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    jsonSchema: { name: string; schema: Record<string, unknown> };
}): Promise<T> {
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
                messages,
                response_format: {
                    type: "json_schema",
                    json_schema: {
                        strict: true,
                        ...jsonSchema,
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

    return JSON.parse(content) as T;
}
