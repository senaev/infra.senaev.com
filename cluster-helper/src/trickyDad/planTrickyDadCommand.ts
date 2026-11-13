import { isObject } from 'senaev-utils/src/types/Object/Object';
import { isNonEmptyString } from 'senaev-utils/src/utils/String/NonEmptyString/NonEmptyString';

import { callLlmJson, type LlmAttempt } from '../llm/callLlmJson';
import { OPENROUTER_PROVIDER } from '../llm/llmProviders';
import type { ChatMessage, JsonSchemaFormat } from '../llm/requestChatCompletion';

import type { PlannedTrickyDadAction, TrickyDadAction } from './actions/TrickyDadAction';
import { TRICKY_DAD_SOURCES, type TrickyDadSource } from './TrickyDadSource';

export const ALISA_SKILL_NAME = 'Умный Папа';

export type TrickyDadCommandPlan = {
    actions: PlannedTrickyDadAction[];
    /** True when the raw command went to the command fallback action of the source. */
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

type ParsedActions = {
    actions: PlannedTrickyDadAction[];
    error: string | null;
};

const JSON_ONLY_LINE = 'Return only JSON matching the schema, preserving the original language in all text fields.';

function getArgsSchema(action: TrickyDadAction): Record<string, unknown> {
    return {
        type: 'object',
        properties: action.argsProperties,
        required: Object.keys(action.argsProperties),
        additionalProperties: false,
    };
}

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

/** A source with one action: the model only fills its arguments. */
export function buildSingleActionRequest(action: TrickyDadAction): LlmRequest<ParsedActions> {
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
            schema: getArgsSchema(action),
        },
        parse: (value) => {
            return {
                actions: [action.parseArgs(requireObject(value, action.type))],
                error: null,
            };
        },
    };
}

/** A source with several actions: the model chooses the actions and fills their arguments in one answer. */
export function buildMultiActionRequest(actions: TrickyDadAction[]): LlmRequest<ParsedActions> {
    const actionsByType = new Map(actions.map((action) => [
        action.type,
        action,
    ]));

    return {
        messages: [
            {
                role: 'system',
                content: [
                    `Process requests for the Yandex Alisa skill '${ALISA_SKILL_NAME}'.`,
                    `Return every requested action in actions, one entry per action type. The action types are: ${[...actionsByType.keys()].join(', ')}.`,
                    ...actions.flatMap((action) => [
                        `## ${action.type}`,
                        ...action.whenToUse,
                        ...action.instructions,
                    ]),
                    '## Errors',
                    'Return an empty actions array only if the message names neither things nor actions (a greeting, question or unintelligible speech), and explain briefly in error. Otherwise error is null.',
                    JSON_ONLY_LINE,
                    getTodayLine(),
                ].join(' '),
            },
        ],
        jsonSchema: {
            name: 'tricky_dad_actions',
            schema: {
                type: 'object',
                properties: {
                    actions: {
                        type: 'array',
                        items: {
                            anyOf: actions.map((action) => {
                                return {
                                    type: 'object',
                                    properties: {
                                        type: {
                                            type: 'string',
                                            enum: [action.type],
                                        },
                                        ...action.argsProperties,
                                    },
                                    required: [
                                        'type',
                                        ...Object.keys(action.argsProperties),
                                    ],
                                    additionalProperties: false,
                                };
                            }),
                        },
                    },
                    error: {
                        type: [
                            'string',
                            'null',
                        ],
                    },
                },
                required: [
                    'actions',
                    'error',
                ],
                additionalProperties: false,
            },
        },
        parse: (value) => {
            const { actions: rawActions, error } = requireObject(value, 'answer');

            if (!Array.isArray(rawActions)) {
                throw new Error(`actions must be an array, got [${JSON.stringify(rawActions)}]`);
            }

            if (rawActions.length === 0) {
                // Let the next LLM provider try before using the command fallback.
                throw new Error(isNonEmptyString(error)
                    ? `no actions returned: ${error}`
                    : 'actions is empty and error has no reason');
            }

            if (error !== null) {
                // An incomplete plan must not be executed as a successful command.
                // Reject it so callLlmJson can try the next provider.
                throw new Error(`actions is non-empty but error is not null: ${JSON.stringify(error)}`);
            }

            const seenTypes = new Set<string>();

            return {
                actions: rawActions.map((rawAction) => {
                    const { type, ...args } = requireObject(rawAction, 'action');
                    const action = isNonEmptyString(type) ? actionsByType.get(type) : undefined;

                    if (!action) {
                        throw new Error(`unknown action type [${JSON.stringify(type)}]`);
                    }

                    if (seenTypes.has(action.type)) {
                        throw new Error(`repeated action type [${JSON.stringify(action.type)}]`);
                    }

                    seenTypes.add(action.type);

                    return action.parseArgs(args);
                }),
                error: null,
            };
        },
    };
}

export async function planTrickyDadCommand(
    command: string,
    source: TrickyDadSource
): Promise<TrickyDadCommandPlan> {
    const { actions, commandFallbackAction } = TRICKY_DAD_SOURCES[source];
    const [onlyAction] = actions;
    const request = actions.length === 1 && onlyAction
        ? buildSingleActionRequest(onlyAction)
        : buildMultiActionRequest(actions);

    const result = await callLlmJson({
        // Only OpenRouter, not the home llm-server (decision of 2026-11-13).
        providers: [OPENROUTER_PROVIDER],
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

    if (result.value && result.value.actions.length > 0) {
        return {
            actions: result.value.actions,
            isCommandFallback: false,
            error: null,
            ...llmInfo,
        };
    }

    return {
        actions: [commandFallbackAction.fromRawCommand(command)],
        isCommandFallback: true,
        error: result.value
            ? `❌ LLM: ${result.value.error}`
            : '❌ No LLM provider gave a usable answer',
        ...llmInfo,
    };
}
