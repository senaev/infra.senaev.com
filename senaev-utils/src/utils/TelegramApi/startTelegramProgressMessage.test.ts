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
import { TELEGRAM_RICH_MESSAGE_MAX_LENGTH } from './splitTelegramMarkdown/splitTelegramMarkdown';
import { startTelegramProgressMessage } from './startTelegramProgressMessage';

vi.mock('./createTelegramRichMessage', () => {
    return { createTelegramRichMessage: vi.fn() };
});

vi.mock('./editTelegramRichMessage', () => {
    return { editTelegramRichMessage: vi.fn() };
});

const createTelegramRichMessageMock = vi.mocked(createTelegramRichMessage);
const editTelegramRichMessageMock = vi.mocked(editTelegramRichMessage);

const MESSAGE_ID = 555;
const INTERVAL_MS = 10_000;

/** Text of every editMessageText the util issued, in the order the writes completed. */
function editedTexts(): string[] {
    return editTelegramRichMessageMock.mock.calls.map(([parameters]) => parameters.markdown ?? '');
}

function start({ onWriteError }: { onWriteError?: (error: unknown) => void } = {}) {
    return startTelegramProgressMessage({
        chatId: '-100',
        token: 'token',
        buildText: (elapsedSeconds) => `waiting ${elapsedSeconds}`,
        ...(onWriteError && { onWriteError }),
    });
}

/** Lets the queued writes run without advancing the refresh interval. */
async function flushWrites(): Promise<void> {
    await vi.advanceTimersByTimeAsync(0);
}

describe('startTelegramProgressMessage', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        createTelegramRichMessageMock.mockResolvedValue(MESSAGE_ID);
        editTelegramRichMessageMock.mockResolvedValue('updated');
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('should return the handle without waiting for the placeholder to be posted', () => {
        let postPlaceholder = (): void => {};

        createTelegramRichMessageMock.mockImplementationOnce(() => new Promise((resolve) => {
            postPlaceholder = () => resolve(MESSAGE_ID);
        }));

        const progress = start();

        expect(typeof progress.finish).toBe('function');

        postPlaceholder();
    });

    it('should post the placeholder with a zero count and edit nothing yet', async () => {
        start();

        await flushWrites();

        expect(createTelegramRichMessageMock).toHaveBeenCalledTimes(1);
        expect(createTelegramRichMessageMock.mock.calls[0]?.[0].markdown).toBe('waiting 0');
        expect(editTelegramRichMessageMock).not.toHaveBeenCalled();
    });

    it('should refresh the count on every interval tick', async () => {
        start();

        await vi.advanceTimersByTimeAsync(INTERVAL_MS * 2);

        expect(editedTexts()).toEqual([
            'waiting 10',
            'waiting 20',
        ]);
    });

    it('should write the final text into the message the placeholder created', async () => {
        const progress = start();

        await progress.finish({ text: 'done' });

        expect(editTelegramRichMessageMock).toHaveBeenCalledTimes(1);

        const parameters = editTelegramRichMessageMock.mock.calls[0]?.[0];

        expect(parameters?.messageId).toBe(MESSAGE_ID);
        expect(parameters?.markdown).toBe('done');
    });

    it('should pass replyMarkup through to the final write', async () => {
        const progress = start();
        const replyMarkup = {
            inline_keyboard: [
                [
                    {
                        text: 'go',
                        callback_data: 'go',
                    },
                ],
            ],
        };

        await progress.finish({
            text: 'done',
            replyMarkup,
        });

        expect(editTelegramRichMessageMock.mock.calls[0]?.[0].replyMarkup).toBe(replyMarkup);
    });

    it('should stop refreshing once finished', async () => {
        const progress = start();

        await progress.finish({ text: 'done' });
        await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);

        expect(editedTexts()).toEqual(['done']);
    });

    // finish stops the refresh before it queues its own write, so nothing keeps ticking even
    // when that write fails -- the property that makes a separate stop method unnecessary.
    it('should stop refreshing even when the final write fails', async () => {
        editTelegramRichMessageMock.mockRejectedValueOnce(new Error('final write failed'));

        const progress = start();

        await expect(progress.finish({ text: 'done' })).rejects.toThrow();
        await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);

        expect(editTelegramRichMessageMock).toHaveBeenCalledTimes(1);
    });

    // The bug this util exists to prevent: clearInterval does not recall a refresh that is
    // already in flight, so without a write chain the stale count could land last and the
    // message would sit on "waiting 10" forever instead of showing the outcome.
    it('should apply the final text after a refresh that is already in flight', async () => {
        let releaseRefresh = (): void => {};

        editTelegramRichMessageMock.mockImplementationOnce(() => new Promise<'updated'>((resolve) => {
            releaseRefresh = () => resolve('updated');
        }));

        const progress = start();

        // Let the refresh start, and leave its request hanging.
        await vi.advanceTimersByTimeAsync(INTERVAL_MS);
        expect(editTelegramRichMessageMock).toHaveBeenCalledTimes(1);

        const finished = progress.finish({ text: 'done' });

        // The final write must not have been issued while the refresh is still open.
        await flushWrites();
        expect(editTelegramRichMessageMock).toHaveBeenCalledTimes(1);

        releaseRefresh();
        await finished;

        expect(editedTexts()).toEqual([
            'waiting 10',
            'done',
        ]);
    });

    it('should drop a refresh that was queued before finishing', async () => {
        let releaseFirstRefresh = (): void => {};

        editTelegramRichMessageMock.mockImplementationOnce(() => new Promise<'updated'>((resolve) => {
            releaseFirstRefresh = () => resolve('updated');
        }));

        const progress = start();

        // First refresh starts and hangs; the second queues up behind it.
        await vi.advanceTimersByTimeAsync(INTERVAL_MS);
        await vi.advanceTimersByTimeAsync(INTERVAL_MS);
        expect(editTelegramRichMessageMock).toHaveBeenCalledTimes(1);

        const finished = progress.finish({ text: 'done' });

        releaseFirstRefresh();
        await finished;

        // The queued second refresh is dropped rather than overwriting the outcome.
        expect(editedTexts()).toEqual([
            'waiting 10',
            'done',
        ]);
    });

    it('should wait for the placeholder before editing it', async () => {
        let postPlaceholder = (): void => {};

        createTelegramRichMessageMock.mockImplementationOnce(() => new Promise((resolve) => {
            postPlaceholder = () => resolve(MESSAGE_ID);
        }));

        const progress = start();
        const finished = progress.finish({ text: 'done' });

        // Nothing can be edited while the placeholder has no id yet.
        await flushWrites();
        expect(editTelegramRichMessageMock).not.toHaveBeenCalled();

        postPlaceholder();
        await finished;

        expect(editedTexts()).toEqual(['done']);
    });

    it('should report a failed refresh through onWriteError without stopping later writes', async () => {
        const onWriteError = vi.fn();
        const failure = new Error('refresh failed');

        editTelegramRichMessageMock.mockRejectedValueOnce(failure);

        const progress = start({ onWriteError });

        await vi.advanceTimersByTimeAsync(INTERVAL_MS);

        expect(onWriteError).toHaveBeenCalledWith(failure);

        await progress.finish({ text: 'done' });

        expect(editedTexts()).toEqual([
            'waiting 10',
            'done',
        ]);
    });

    it('should reject when the final write fails', async () => {
        const failure = new Error('final write failed');

        editTelegramRichMessageMock.mockRejectedValueOnce(failure);

        const progress = start();

        await expect(progress.finish({ text: 'done' })).rejects.toBe(failure);
    });

    it('should still apply a later finish after an earlier one failed', async () => {
        editTelegramRichMessageMock.mockRejectedValueOnce(new Error('final write failed'));

        const progress = start();

        await expect(progress.finish({ text: 'done' })).rejects.toThrow();
        await progress.finish({ text: 'error report' });

        expect(editedTexts()).toEqual([
            'done',
            'error report',
        ]);
    });

    it('edits a rich progress message with content beyond the ordinary 4096-character limit', async () => {
        const progress = start();
        const content = `\`\`\`\n${'a'.repeat(8_000)}\n\`\`\``;

        await progress.finish({ text: content });

        expect(editTelegramRichMessageMock).toHaveBeenCalledWith(expect.objectContaining({
            messageId: MESSAGE_ID,
            markdown: content,
        }));
        expect(createTelegramRichMessageMock).toHaveBeenCalledTimes(1);
    });

    it('sends oversized final content separately, then finishes the progress message', async () => {
        const progress = start();
        const content = 'x'.repeat(TELEGRAM_RICH_MESSAGE_MAX_LENGTH);

        await progress.finish({ text: content });

        expect(createTelegramRichMessageMock.mock.calls[1]?.[0]).toMatchObject({
            markdown: content,
            chatId: '-100',
        });
        expect(editedTexts()).toEqual(['📄 Full message sent separately']);
    });

    describe('when the placeholder cannot be posted', () => {
        const failure = new Error('placeholder failed');

        beforeEach(() => {
            createTelegramRichMessageMock.mockRejectedValue(failure);
        });

        it('should report the failure through onWriteError', async () => {
            const onWriteError = vi.fn();

            start({ onWriteError });

            await flushWrites();

            expect(onWriteError).toHaveBeenCalledWith(failure);
        });

        it('should resolve finish without writing anything', async () => {
            const progress = start();

            await expect(progress.finish({ text: 'done' })).resolves.toBeUndefined();

            expect(editTelegramRichMessageMock).not.toHaveBeenCalled();
            expect(createTelegramRichMessageMock).toHaveBeenCalledTimes(1);
        });

        it('should stop refreshing instead of retrying forever', async () => {
            const onWriteError = vi.fn();

            start({ onWriteError });

            await vi.advanceTimersByTimeAsync(INTERVAL_MS * 5);

            expect(editTelegramRichMessageMock).not.toHaveBeenCalled();
            expect(onWriteError).toHaveBeenCalledTimes(1);
        });
    });
});
