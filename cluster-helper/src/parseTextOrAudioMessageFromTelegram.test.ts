import { TelegramMessage } from 'senaev-utils/src/utils/TelegramApi/types';
import {
    beforeEach, describe, expect, it, vi,
} from 'vitest';

import { parseTextOrAudioMessageFromTelegram } from './parseTextOrAudioMessageFromTelegram';
import { transcribeAudioFile } from './transcribeAudioFile';

vi.mock('./transcribeAudioFile', () => {
    return { transcribeAudioFile: vi.fn() };
});

function buildMessage(overrides: Record<string, unknown> = {}): TelegramMessage {
    return {
        message_id: 1,
        date: 0,
        chat: {
            id: 1,
            type: 'private',
        },
        ...overrides,
    } as unknown as TelegramMessage;
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('parseTextOrAudioMessageFromTelegram', () => {
    it('returns the text of a text message without transcribing anything', async () => {
        const result = await parseTextOrAudioMessageFromTelegram(buildMessage({ text: 'buy milk' }));

        expect(result).toBe('buy milk');
        expect(transcribeAudioFile).not.toHaveBeenCalled();
    });

    it('transcribes a voice message', async () => {
        vi.mocked(transcribeAudioFile).mockResolvedValue('spoken words');

        const result = await parseTextOrAudioMessageFromTelegram(buildMessage({
            voice: { file_id: 'voice-1' },
        }));

        expect(transcribeAudioFile).toHaveBeenCalledWith('voice-1');
        expect(result).toBe('spoken words');
    });

    it('transcribes an audio message', async () => {
        vi.mocked(transcribeAudioFile).mockResolvedValue('a song');

        const result = await parseTextOrAudioMessageFromTelegram(buildMessage({
            audio: { file_id: 'audio-1' },
        }));

        expect(transcribeAudioFile).toHaveBeenCalledWith('audio-1');
        expect(result).toBe('a song');
    });

    it('prefers voice over audio when a message somehow carries both', async () => {
        vi.mocked(transcribeAudioFile).mockResolvedValue('');

        await parseTextOrAudioMessageFromTelegram(buildMessage({
            voice: { file_id: 'voice-1' },
            audio: { file_id: 'audio-1' },
        }));

        expect(transcribeAudioFile).toHaveBeenCalledWith('voice-1');
    });

    // Telegram sends plenty of updates this parser has no answer for — stickers, photos,
    // service messages. None of them should reach the transcription API.
    it('returns null for a message with neither text nor audio', async () => {
        const result = await parseTextOrAudioMessageFromTelegram(buildMessage({
            sticker: { file_id: 'sticker-1' },
        }));

        expect(result).toBeNull();
        expect(transcribeAudioFile).not.toHaveBeenCalled();
    });

    it('treats an empty text as absent and looks for audio instead', async () => {
        const result = await parseTextOrAudioMessageFromTelegram(buildMessage({ text: '' }));

        expect(result).toBeNull();
    });
});
