import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import { createTelegramRichMessage } from './createTelegramRichMessage';
import { editTelegramRichMessage } from './editTelegramRichMessage';
import { sendTelegramEditableMessage } from './sendTelegramEditableMessage';

vi.mock('./createTelegramRichMessage', () => {
    return { createTelegramRichMessage: vi.fn() };
});

vi.mock('./editTelegramRichMessage', () => {
    return { editTelegramRichMessage: vi.fn() };
});

const createTelegramRichMessageMock = vi.mocked(createTelegramRichMessage);
const editTelegramRichMessageMock = vi.mocked(editTelegramRichMessage);

const MESSAGE_ID = 555;

/** Text of every rich-message edit the handle issued, in the order the writes completed. */
function editedTexts(): string[] {
    return editTelegramRichMessageMock.mock.calls.map(([parameters]) => parameters.html ?? '');
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
        disableLinkPreview: true,
        ...(onSendError && { onSendError }),
    });
}

describe('sendTelegramEditableMessage', () => {
    beforeEach(() => {
        createTelegramRichMessageMock.mockResolvedValue(MESSAGE_ID);
        editTelegramRichMessageMock.mockResolvedValue('updated');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should post the message with the given parameters', () => {
        send();

        expect(createTelegramRichMessageMock).toHaveBeenCalledWith({
            chatId: '-100',
            token: 'token',
            html: 'first',
            media: [],
            disableLinkPreview: true,
        });
    });

    it('should return the handle without waiting for the message to be posted', () => {
        createTelegramRichMessageMock.mockImplementation(() => new Promise(() => {}));

        expect(send().edit).toBeInstanceOf(Function);
    });

    it('should reply to a message when asked to', () => {
        sendTelegramEditableMessage({
            chatId: '-100',
            token: 'token',
            text: 'first',
            replyToMessageId: 42,
        });

        expect(createTelegramRichMessageMock).toHaveBeenCalledWith(expect.objectContaining({
            replyToMessageId: 42,
        }));
    });

    it('should edit the message it posted, keeping its id to itself', async () => {
        await send().edit({ text: 'second' });

        expect(editTelegramRichMessageMock).toHaveBeenCalledWith({
            chatId: '-100',
            messageId: MESSAGE_ID,
            token: 'token',
            html: 'second',
            media: [],
            disableLinkPreview: true,
        });
    });

    it('should wait for the message to be posted before editing it', async () => {
        let releaseSend = (_: number): void => {};

        createTelegramRichMessageMock.mockImplementationOnce(() => new Promise((resolve) => {
            releaseSend = resolve;
        }));

        const editing = send().edit({ text: 'second' });

        await flushWrites();
        expect(editTelegramRichMessageMock).not.toHaveBeenCalled();

        releaseSend(MESSAGE_ID);
        await editing;

        expect(editTelegramRichMessageMock).toHaveBeenCalledTimes(1);
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
        ] = editTelegramRichMessageMock.mock.calls;

        expect(withMarkup?.[0]).toMatchObject({ replyMarkup });
        expect(withoutMarkup?.[0]).not.toHaveProperty('replyMarkup');
    });

    it('should not start a write while an earlier one is still open', async () => {
        let releaseFirstEdit = (): void => {};

        editTelegramRichMessageMock.mockImplementationOnce(() => new Promise<'updated'>((resolve) => {
            releaseFirstEdit = () => resolve('updated');
        }));

        const message = send();
        const firstEdit = message.edit({ text: 'second' });

        await flushWrites();

        const secondEdit = message.edit({ text: 'third' });

        await flushWrites();
        expect(editTelegramRichMessageMock).toHaveBeenCalledTimes(1);

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

        editTelegramRichMessageMock.mockImplementationOnce(() => new Promise<'updated'>((resolve) => {
            releaseFirstEdit = () => resolve('updated');
        }));

        const message = send();
        const firstEdit = message.edit({ text: 'second' });

        await flushWrites();
        expect(editTelegramRichMessageMock).toHaveBeenCalledTimes(1);

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

        editTelegramRichMessageMock.mockRejectedValueOnce(failure);

        await expect(send().edit({ text: 'second' })).rejects.toThrow(failure);
    });

    it('should keep accepting writes after one failed', async () => {
        editTelegramRichMessageMock.mockRejectedValueOnce(new Error('too many requests'));

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
            createTelegramRichMessageMock.mockRejectedValue(failure);
        });

        it('should report the failure through onSendError', async () => {
            const onSendError = vi.fn();

            send({ onSendError });
            await flushWrites();

            expect(onSendError).toHaveBeenCalledWith(failure);
        });

        it('should resolve a write without issuing it', async () => {
            await expect(send().edit({ text: 'second' })).resolves.toBeUndefined();

            expect(editTelegramRichMessageMock).not.toHaveBeenCalled();
        });
    });
});
