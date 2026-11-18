import type { ToolDefinition } from 'senaev-utils/src/toolServer/toolDefinition';
import { isObject } from 'senaev-utils/src/types/Object/Object';
import { stringifyUnknownError } from 'senaev-utils/src/utils/Error/stringifyUnknownError/stringifyUnknownError';

import type { ToolFamily, ToolReply } from '../chatGptMcp/toolFamilies';

// The telegram-* MCP tools. The client picks a chat by its name from an allowlist and never
// sees a chat id: the ids stay in cluster-helper, and an error that names one is rewritten.

export const TELEGRAM_TOOL_PREFIX = 'telegram-';

/** A rich message holds up to 32768 characters; keep a margin, as the public proxy does. */
export const TELEGRAM_MCP_MAX_TEXT_LENGTH = 32_000;

export type TelegramMcpChannel = {
    /** What the client sends, e.g. "cluster". */
    name: string;
    /** Tells the model what the chat is for, so it can pick one. */
    description: string;
    chatId: string;
};

export type SendTelegramMarkdown = (options: { chatId: string; text: string }) => Promise<{ message_id: number }>;

const ARGUMENT_KEYS = new Set([
    'channel',
    'text',
]);

export function createTelegramToolDefinitions(channels: readonly TelegramMcpChannel[]): Record<string, ToolDefinition> {
    const channelList = channels.map(({ name, description }) => `"${name}": ${description}`).join('; ');

    return {
        send_message: {
            title: 'Send a Telegram message',
            description: 'Sends a message to a Telegram chat by the senaev.com bot. The text is Telegram Rich Markdown: ' + 'headings, **bold**, *italic*, ~~strikethrough~~, `code`, fenced code blocks, [links](https://example.com), ' + 'lists, quotes and tables. Every call posts a new message, so do not repeat a call that succeeded. ' + `The chats: ${channelList}.`,
            inputSchema: {
                type: 'object',
                properties: {
                    channel: {
                        type: 'string',
                        enum: channels.map(({ name }) => name),
                        description: 'The name of the chat to post to.',
                    },
                    text: {
                        type: 'string',
                        minLength: 1,
                        maxLength: TELEGRAM_MCP_MAX_TEXT_LENGTH,
                        description: 'The message in Telegram Rich Markdown.',
                    },
                },
                required: [
                    'channel',
                    'text',
                ],
                additionalProperties: false,
            },
            annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: false,
                openWorldHint: true,
            },
        },
    };
}

function error(message: string): ToolReply {
    return {
        isError: true,
        body: {
            status: 'error',
            message,
        },
    };
}

function parseSendMessageArguments(args: unknown, channels: readonly TelegramMcpChannel[]): { channel: TelegramMcpChannel; text: string } | string {
    if (!isObject(args) || Array.isArray(args)) {
        return 'The arguments must be an object with "channel" and "text"';
    }

    const unknownKey = Object.keys(args).find((key) => !ARGUMENT_KEYS.has(key));

    if (unknownKey !== undefined) {
        return `Unknown argument "${unknownKey}"`;
    }

    const channel = channels.find(({ name }) => name === args.channel);

    if (channel === undefined) {
        return `Unknown channel, the channels are: ${channels.map(({ name }) => name).join(', ')}`;
    }

    if (typeof args.text !== 'string' || args.text.trim() === '') {
        return '"text" must be a non-empty string';
    }

    if (args.text.length > TELEGRAM_MCP_MAX_TEXT_LENGTH) {
        return `"text" is ${args.text.length} characters long, the limit is ${TELEGRAM_MCP_MAX_TEXT_LENGTH}`;
    }

    return {
        channel,
        text: args.text,
    };
}

export function createTelegramToolFamily({
    channels, sendMarkdown,
}: { channels: readonly TelegramMcpChannel[]; sendMarkdown: SendTelegramMarkdown }): ToolFamily {
    const definitions = createTelegramToolDefinitions(channels);

    return {
        prefix: TELEGRAM_TOOL_PREFIX,
        definitions,
        backendName: 'Telegram',
        call: async (toolName, args) => {
            if (toolName !== 'send_message') {
                return error(`Unknown tool ${toolName}`);
            }

            const parsed = parseSendMessageArguments(args, channels);

            if (typeof parsed === 'string') {
                return error(parsed);
            }

            const { channel, text } = parsed;

            try {
                const { message_id: messageId } = await sendMarkdown({
                    chatId: channel.chatId,
                    text,
                });

                return {
                    isError: false,
                    body: {
                        status: 'ok',
                        channel: channel.name,
                        messageId,
                    },
                };
            } catch (sendError) {
                // The error of the Bot API call names the chat id: the client must not see it.
                const message = stringifyUnknownError(sendError).replaceAll(channel.chatId, channel.name);

                return error(`Telegram did not accept the message: ${message}`);
            }
        },
    };
}
