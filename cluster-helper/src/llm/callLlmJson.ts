import { stringifyUnknownError } from 'senaev-utils/src/utils/Error/stringifyUnknownError/stringifyUnknownError';

import { logger } from '../logger';

import type { LlmProvider } from './llmProviders';
import {
    type ChatMessage, type JsonSchemaFormat, requestChatCompletion,
} from './requestChatCompletion';

export type LlmAttempt = {
    provider: string;
    durationMs: number;
    error: string | null;
};

export type LlmJsonResult<T> =
    | { value: T; provider: string; attempts: LlmAttempt[] }
    | { value: null; provider: null; attempts: LlmAttempt[] };

/**
 * Asks each provider in order and returns the first answer that `parse` accepts. A provider
 * that fails, times out, or returns JSON that `parse` rejects gives the request to the next one.
 */
export async function callLlmJson<T>({
    providers,
    messages,
    jsonSchema,
    parse,
}: {
    providers: LlmProvider[];
    messages: ChatMessage[];
    jsonSchema: JsonSchemaFormat;
    /** Validates the parsed JSON. Throws when the answer is not usable. */
    parse: (value: unknown) => T;
}): Promise<LlmJsonResult<T>> {
    const attempts: LlmAttempt[] = [];

    for (const provider of providers) {
        const startTime = Date.now();

        logger.info({ provider: provider.name }, '👉 Requesting LLM');

        try {
            const content = await requestChatCompletion({
                provider,
                messages,
                jsonSchema,
            });
            const value = parse(JSON.parse(content));
            const durationMs = Date.now() - startTime;

            attempts.push({
                provider: provider.name,
                durationMs,
                error: null,
            });
            logger.info({
                provider: provider.name,
                durationMs,
                value,
            }, '✅ Response from LLM');

            return {
                value,
                provider: provider.name,
                attempts,
            };
        } catch (err) {
            const durationMs = Date.now() - startTime;
            const error = stringifyUnknownError(err);

            attempts.push({
                provider: provider.name,
                durationMs,
                error,
            });
            logger.error({
                err,
                provider: provider.name,
                durationMs,
            }, '❌ LLM provider failed');
        }
    }

    return {
        value: null,
        provider: null,
        attempts,
    };
}
