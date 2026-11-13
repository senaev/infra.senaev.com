import { isObject } from 'senaev-utils/src/types/Object/Object';

import { callLlmJson, type LlmAttempt } from '../llm/callLlmJson';
import { getLlmProviderFallbackOrder } from '../llm/llmProviders';
import type { ChatMessage, JsonSchemaFormat } from '../llm/requestChatCompletion';

import type { PlannedTrickyDadAction, TrickyDadAction } from './actions/TrickyDadAction';
import { TRICKY_DAD_SOURCES, type TrickyDadSource } from './TrickyDadSource';

export const ALISA_SKILL_NAME = 'Умный Папа';

export type TrickyDadCommandPlan = {
    actions: PlannedTrickyDadAction[];
    /** True when the raw command went to the action of the source without the model. */
    isCommandFallback: boolean;
    /** Why the answer of the model was not used, or null. */
    error: string | null;
    /** The provider whose answer was used, or null when no provider gave a usable answer. */
    llmProvider: string | null;
    llmAttempts: LlmAttempt[];
};

type LlmRequest<T> = {
    messages: ChatMessage[];
    jsonSchema: JsonSchemaFormat;
    parse: (value: unknown) => T;
};

const JSON_ONLY_LINE = 'Return only JSON matching the schema, preserving the original language in all text fields.';

function requireObject(value: unknown, what: string): Record<string, unknown> {
    if (!isObject(value) || Array.isArray(value)) {
        throw new Error(`${what} must be an object, got [${JSON.stringify(value)}]`);
    }

    return value as Record<string, unknown>;
}

// The date goes last, so the rest of the system prompt stays the same prefix every day and
// the provider can reuse it from its prompt cache.
function getTodayLine(): string {
    return `Today's date is ${new Date().toISOString().slice(0, 10)}.`;
}

/** The model only fills the arguments of the one action of the source. */
export function buildActionRequest(action: TrickyDadAction): LlmRequest<PlannedTrickyDadAction> {
    return {
        messages: [
            {
                role: 'system',
                content: [
                    `Extract the arguments of the ${action.type} action from a message sent to the Yandex Alisa skill '${ALISA_SKILL_NAME}'.`,
                    ...action.instructions,
                    JSON_ONLY_LINE,
                    getTodayLine(),
                ].join(' '),
            },
        ],
        jsonSchema: {
            name: action.type,
            schema: {
                type: 'object',
                properties: action.argsProperties,
                required: Object.keys(action.argsProperties),
                additionalProperties: false,
            },
        },
        parse: (value) => action.parseArgs(requireObject(value, action.type)),
    };
}

export async function planTrickyDadCommand(
    command: string,
    source: TrickyDadSource
): Promise<TrickyDadCommandPlan> {
    const { action } = TRICKY_DAD_SOURCES[source];
    const request = buildActionRequest(action);

    const result = await callLlmJson({
        providers: getLlmProviderFallbackOrder().filter(({ enabled }) => enabled),
        messages: [
            ...request.messages,
            {
                role: 'user',
                content: command,
            },
        ],
        jsonSchema: request.jsonSchema,
        parse: request.parse,
    });

    const llmInfo = {
        llmProvider: result.provider,
        llmAttempts: result.attempts,
    };

    if (result.value) {
        return {
            actions: [result.value],
            isCommandFallback: false,
            error: null,
            ...llmInfo,
        };
    }

    return {
        actions: [action.fromRawCommand(command)],
        isCommandFallback: true,
        error: '❌ No LLM provider gave a usable answer',
        ...llmInfo,
    };
}
