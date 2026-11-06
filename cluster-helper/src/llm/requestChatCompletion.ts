import type { LlmProvider } from './llmProviders';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type JsonSchemaFormat = { name: string; schema: Record<string, unknown> };

type ChatCompletionResponse = {
    choices?: Array<{
        message?: {
            content?: string;
        };
    }>;
};

/**
 * Sends one request to an OpenAI-compatible `/chat/completions` endpoint with a JSON schema
 * response format, and returns the raw message content.
 */
export async function requestChatCompletion({
    provider,
    messages,
    jsonSchema,
}: {
    provider: LlmProvider;
    messages: ChatMessage[];
    jsonSchema: JsonSchemaFormat;
}): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort(new Error(`${provider.name} request timed out after ${provider.timeoutMs}ms`));
    }, provider.timeoutMs);

    let response: Response;

    try {
        response = await fetch(provider.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...provider.headers,
            },
            body: JSON.stringify({
                model: provider.model,
                temperature: 0,
                ...provider.maxTokens !== null && { max_tokens: provider.maxTokens },
                messages,
                response_format: {
                    type: 'json_schema',
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
        throw new Error(`${provider.name} request failed: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content;

    if (typeof content !== 'string') {
        throw new Error(`${provider.name} response did not contain message content`);
    }

    return content;
}
