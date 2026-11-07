import {
    beforeEach, describe, expect, it, vi,
} from 'vitest';
import type { TelegramMessage } from 'senaev-utils/src/utils/TelegramApi/types';
import { setTelegramMessageReaction } from 'senaev-utils/src/utils/TelegramApi/setTelegramMessageReaction';

import { parseTextOrAudioMessageFromTelegram } from '../parseTextOrAudioMessageFromTelegram';

import { processTrickyDadChatMessage } from './processTrickyDadChatMessage';
import { runTrickyDadCommand } from './runTrickyDadCommand';
import { sendTrickyDadErrorReport, sendTrickyDadReport } from './sendTrickyDadReport';

vi.mock('../env', () => {
    return { TG_TOKEN_SENAEV_COM_BOT: 'token' };
});

vi.mock('../logger', () => {
    return {
        logger: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        },
    };
});

vi.mock('../parseTextOrAudioMessageFromTelegram', () => {
    return { parseTextOrAudioMessageFromTelegram: vi.fn() };
});

vi.mock('senaev-utils/src/utils/TelegramApi/setTelegramMessageReaction', () => {
    return { setTelegramMessageReaction: vi.fn() };
});

vi.mock('./runTrickyDadCommand', () => {
    return { runTrickyDadCommand: vi.fn() };
});

vi.mock('./sendTrickyDadReport', () => {
    return {
        sendTrickyDadReport: vi.fn(),
        sendTrickyDadErrorReport: vi.fn(),
    };
});

const message = {
    message_id: 42,
    chat: {
        id: 123,
        type: 'private',
    },
} as TelegramMessage;

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(parseTextOrAudioMessageFromTelegram).mockResolvedValue('Позвонить в банк');
    vi.mocked(setTelegramMessageReaction).mockResolvedValue(undefined);
    vi.mocked(runTrickyDadCommand).mockResolvedValue({
        actions: [],
        llmAttempts: [],
        isCommandFallback: false,
        error: null,
        llmProvider: 'openrouter',
        llmDurationMs: 10,
        actionResults: [],
    } as unknown as Awaited<ReturnType<typeof runTrickyDadCommand>>);
    vi.mocked(sendTrickyDadReport).mockResolvedValue(undefined);
});

describe('processTrickyDadChatMessage', () => {
    it('executes a command despite Telegram rejecting the acknowledgement reaction', async () => {
        vi.mocked(setTelegramMessageReaction).mockRejectedValue(new Error('reactions disabled'));

        await processTrickyDadChatMessage(message, 'Tasks Telegram chat');

        expect(runTrickyDadCommand).toHaveBeenCalledWith('Позвонить в банк', 'Tasks Telegram chat');
        expect(sendTrickyDadReport).toHaveBeenCalledWith(expect.objectContaining({
            command: 'Позвонить в банк',
            replyToMessageId: 42,
        }));
        expect(sendTrickyDadErrorReport).not.toHaveBeenCalled();
    });
});
