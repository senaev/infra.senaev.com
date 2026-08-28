import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import { editTelegramMessage } from './editTelegramMessage';
import { sendTelegramEditableMessage } from './sendTelegramEditableMessage';
import { sendTelegramMessage } from './sendTelegramMessage';

vi.mock('./sendTelegramMessage', () => {
    return { sendTelegramMessage: vi.fn() };
});

vi.mock('./editTelegramMessage', () => {
    return { editTelegramMessage: vi.fn() };
});

const sendTelegramMessageMock = vi.mocked(sendTelegramMessage);
const editTelegramMessageMock = vi.mocked(editTelegramMessage);

const MESSAGE_ID = 555;

/** Text of every editMessageText the handle issued, in the order the writes completed. */
function editedTexts(): string[] {
    return editTelegramMessageMock.mock.calls.map(([parameters]) => parameters.text);
}

/**
 * Lets every pending promise settle, so a write that is not blocked has certainly been
 * issued by the time this resolves.
 */
async function flushWrites(): Promise<void> {
    await new Promise((resolve) => {
        setTimeout(resolve, 0);
    });
}

function send({ onSendError }: { onSendError?: (error: unknown) => void } = {}) {
    return sendTelegramEditableMessage({
        chatId: '-100',
        token: 'token',
        text: 'first',
        parseMode: 'HTML',
        disableLinkPreview: true,
        ...(onSendError && { onSendError }),
    });
}

describe('sendTelegramEditableMessage', () => {
    beforeEach(() => {
        sendTelegramMessageMock.mockResolvedValue({ message_id: MESSAGE_ID });
        editTelegramMessageMock.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should post the message with the given parameters', () => {
        send();

        expect(sendTelegramMessageMock).toHaveBeenCalledWith({
            chatId: '-100',
            token: 'token',
            text: 'first',
            parseMode: 'HTML',
            disableLinkPreview: true,
        });
    });

    it('should return the handle without waiting for the message to be posted', () => {
        sendTelegramMessageMock.mockImplementation(() => new Promise(() => {}));

        expect(send().edit).toBeInstanceOf(Function);
    });

    it('should reply to a message when asked to', () => {
        sendTelegramEditableMessage({
            chatId: '-100',
            token: 'token',
            text: 'first',
            replyToMessageId: 42,
        });

        expect(sendTelegramMessageMock).toHaveBeenCalledWith(expect.objectContaining({
            replyToMessageId: 42,
        }));
    });

    it('should edit the message it posted, keeping its id to itself', async () => {
        await send().edit({ text: 'second' });

        expect(editTelegramMessageMock).toHaveBeenCalledWith({
            chatId: '-100',
            messageId: MESSAGE_ID,
            token: 'token',
            text: 'second',
            parseMode: 'HTML',
            disableLinkPreview: true,
        });
    });

    it('should wait for the message to be posted before editing it', async () => {
        let releaseSend = (_: { message_id: number }): void => {};

        sendTelegramMessageMock.mockImplementationOnce(() => new Promise((resolve) => {
            releaseSend = resolve;
        }));

        const editing = send().edit({ text: 'second' });

        await flushWrites();
        expect(editTelegramMessageMock).not.toHaveBeenCalled();

        releaseSend({ message_id: MESSAGE_ID });
        await editing;

        expect(editTelegramMessageMock).toHaveBeenCalledTimes(1);
    });

    it('should pass replyMarkup through, and omit it when absent', async () => {
        const replyMarkup = { inline_keyboard: [] };
        const message = send();

        await message.edit({
            text: 'second',
            replyMarkup,
        });
        await message.edit({ text: 'third' });

        const [
            withMarkup,
            withoutMarkup,
        ] = editTelegramMessageMock.mock.calls;

        expect(withMarkup?.[0]).toMatchObject({ replyMarkup });
        expect(withoutMarkup?.[0]).not.toHaveProperty('replyMarkup');
    });

    it('should not start a write while an earlier one is still open', async () => {
        let releaseFirstEdit = (): void => {};

        editTelegramMessageMock.mockImplementationOnce(() => new Promise<void>((resolve) => {
            releaseFirstEdit = resolve;
        }));

        const message = send();
        const firstEdit = message.edit({ text: 'second' });

        await flushWrites();

        const secondEdit = message.edit({ text: 'third' });

        await flushWrites();
        expect(editTelegramMessageMock).toHaveBeenCalledTimes(1);

        releaseFirstEdit();
        await Promise.all([
            firstEdit,
            secondEdit,
        ]);

        expect(editedTexts()).toEqual([
            'second',
            'third',
        ]);
    });

    it('should drop a waiting write that a newer one supersedes', async () => {
        let releaseFirstEdit = (): void => {};

        editTelegramMessageMock.mockImplementationOnce(() => new Promise<void>((resolve) => {
            releaseFirstEdit = resolve;
        }));

        const message = send();
        const firstEdit = message.edit({ text: 'second' });

        await flushWrites();
        expect(editTelegramMessageMock).toHaveBeenCalledTimes(1);

        const supersededEdit = message.edit({ text: 'third' });
        const newestEdit = message.edit({ text: 'fourth' });

        releaseFirstEdit();
        await Promise.all([
            firstEdit,
            supersededEdit,
            newestEdit,
        ]);

        expect(editedTexts()).toEqual([
            'second',
            'fourth',
        ]);
    });

    it('should reject when Telegram refuses a write', async () => {
        const failure = new Error('too many requests');

        editTelegramMessageMock.mockRejectedValueOnce(failure);

        await expect(send().edit({ text: 'second' })).rejects.toThrow(failure);
    });

    it('should keep accepting writes after one failed', async () => {
        editTelegramMessageMock.mockRejectedValueOnce(new Error('too many requests'));

        const message = send();

        await expect(message.edit({ text: 'second' })).rejects.toThrow();
        await message.edit({ text: 'third' });

        expect(editedTexts()).toEqual([
            'second',
            'third',
        ]);
    });

    describe('when the message cannot be posted', () => {
        const failure = new Error('chat not found');

        beforeEach(() => {
            sendTelegramMessageMock.mockRejectedValue(failure);
        });

        it('should report the failure through onSendError', async () => {
            const onSendError = vi.fn();

            send({ onSendError });
            await flushWrites();

            expect(onSendError).toHaveBeenCalledWith(failure);
        });

        it('should resolve a write without issuing it', async () => {
            await expect(send().edit({ text: 'second' })).resolves.toBeUndefined();

            expect(editTelegramMessageMock).not.toHaveBeenCalled();
        });
    });
});
