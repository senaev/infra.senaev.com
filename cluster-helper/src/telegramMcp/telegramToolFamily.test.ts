import {
    describe, expect, it, vi,
} from 'vitest';

import { handleMcpMessage } from '../chatGptMcp/handleMcpMessage';

import {
    createTelegramToolFamily,
    SendTelegramMarkdown,
    TELEGRAM_MCP_MAX_TEXT_LENGTH,
    type TelegramMcpChannel,
} from './telegramToolFamily';

const CHANNELS: readonly TelegramMcpChannel[] = [
    {
        name: 'cluster',
        description: 'cluster alerts',
        chatId: '-100111',
    },
    {
        name: 'owner',
        description: 'the owner',
        chatId: '222',
    },
];

function setup(sendMarkdown: SendTelegramMarkdown = vi.fn<SendTelegramMarkdown>(() => Promise.resolve({ message_id: 42 }))) {
    const families = [
        createTelegramToolFamily({
            channels: CHANNELS,
            sendMarkdown,
        }),
    ];

    return {
        sendMarkdown,
        request: (method: string, params?: unknown) => handleMcpMessage({
            jsonrpc: '2.0',
            id: 1,
            method,
            params,
        }, families),
        callSendMessage: (args: unknown) => handleMcpMessage({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
                name: 'telegram-send_message',
                arguments: args,
            },
        }, families),
    };
}

describe('telegram MCP tools', () => {
    it('lists send_message with the channel names and no chat ids', async () => {
        const response = await setup().request('tools/list');
        const serialized = JSON.stringify(response);

        expect(response).toMatchObject({
            result: {
                tools: [
                    {
                        name: 'telegram-send_message',
                        inputSchema: {
                            properties: {
                                channel: {
                                    enum: [
                                        'cluster',
                                        'owner',
                                    ],
                                },
                                text: { maxLength: TELEGRAM_MCP_MAX_TEXT_LENGTH },
                            },
                            required: [
                                'channel',
                                'text',
                            ],
                        },
                    },
                ],
            },
        });
        expect(serialized).toContain('cluster alerts');
        expect(serialized).not.toContain('-100111');
        expect(serialized).not.toContain('222');
    });

    it('sends the Markdown unchanged to the chat of the channel', async () => {
        const { callSendMessage, sendMarkdown } = setup();
        const text = '# Title\n\n**bold** and [a link](https://example.com)';

        const response = await callSendMessage({
            channel: 'cluster',
            text,
        });

        expect(sendMarkdown).toHaveBeenCalledWith({
            chatId: '-100111',
            text,
        });
        expect(response).toMatchObject({
            result: {
                isError: false,
                structuredContent: {
                    status: 'ok',
                    channel: 'cluster',
                    messageId: 42,
                },
            },
        });
    });

    it.each([
        [
            'an unknown channel',
            {
                channel: 'nope',
                text: 'hi',
            },
            'Unknown channel, the channels are: cluster, owner',
        ],
        [
            'a chat id instead of a name',
            {
                channel: '-100111',
                text: 'hi',
            },
            'Unknown channel',
        ],
        [
            'an empty text',
            {
                channel: 'cluster',
                text: '  ',
            },
            'non-empty',
        ],
        [
            'a text that is too long',
            {
                channel: 'cluster',
                text: 'x'.repeat(TELEGRAM_MCP_MAX_TEXT_LENGTH + 1),
            },
            'the limit is',
        ],
        [
            'an unknown argument',
            {
                channel: 'cluster',
                text: 'hi',
                chat_id: '1',
            },
            'Unknown argument "chat_id"',
        ],
        [
            'arguments that are not an object',
            'hi',
            '"channel" and "text"',
        ],
    ])('rejects %s without sending', async (_name, args, message) => {
        const { callSendMessage, sendMarkdown } = setup();

        const response = await callSendMessage(args);

        expect(sendMarkdown).not.toHaveBeenCalled();
        expect(response).toMatchObject({
            result: {
                isError: true,
                structuredContent: { message: expect.stringContaining(message) },
            },
        });
    });

    it('reports a Telegram error with the channel name instead of the chat id', async () => {
        const { callSendMessage } = setup(() => Promise.reject(new Error('sendRichMessage failed for {"chat_id":"-100111"}: Bad Request: chat not found')));

        const response = await callSendMessage({
            channel: 'cluster',
            text: 'hi',
        });
        const serialized = JSON.stringify(response);

        expect(response).toMatchObject({ result: { isError: true } });
        expect(serialized).toContain('chat not found');
        expect(serialized).toContain('cluster');
        expect(serialized).not.toContain('-100111');
    });
});
