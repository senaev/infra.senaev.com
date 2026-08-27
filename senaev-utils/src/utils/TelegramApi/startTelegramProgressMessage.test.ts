import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import { editTelegramMessage } from './editTelegramMessage';
import { sendTelegramMessage } from './sendTelegramMessage';
import { startTelegramProgressMessage } from './startTelegramProgressMessage';

vi.mock('./sendTelegramMessage', () => {
    return { sendTelegramMessage: vi.fn() };
});

vi.mock('./editTelegramMessage', () => {
    return { editTelegramMessage: vi.fn() };
});

const sendTelegramMessageMock = vi.mocked(sendTelegramMessage);
const editTelegramMessageMock = vi.mocked(editTelegramMessage);

const MESSAGE_ID = 555;
const INTERVAL_MS = 10_000;

/** Text of every editMessageText the util issued, in the order the writes completed. */
function editedTexts(): string[] {
    return editTelegramMessageMock.mock.calls.map(([parameters]) => parameters.text);
}

function start({ onEditError }: { onEditError?: (error: unknown) => void } = {}) {
    return startTelegramProgressMessage({
        chatId: '-100',
        token: 'token',
        buildText: (elapsedSeconds) => `waiting ${elapsedSeconds}`,
        ...(onEditError && { onEditError }),
    });
}

describe('startTelegramProgressMessage', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        sendTelegramMessageMock.mockResolvedValue({ message_id: MESSAGE_ID });
        editTelegramMessageMock.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('should post the placeholder with a zero count and return its message id', async () => {
        const progress = await start();

        expect(progress.messageId).toBe(MESSAGE_ID);
        expect(sendTelegramMessageMock).toHaveBeenCalledTimes(1);
        expect(sendTelegramMessageMock.mock.calls[0]?.[0].text).toBe('waiting 0');
        expect(editTelegramMessageMock).not.toHaveBeenCalled();
    });

    it('should refresh the count on every interval tick', async () => {
        await start();

        await vi.advanceTimersByTimeAsync(INTERVAL_MS * 2);

        expect(editedTexts()).toEqual([
            'waiting 10',
            'waiting 20',
        ]);
    });

    it('should write the final text into the same message', async () => {
        const progress = await start();

        await progress.finish({ text: 'done' });

        expect(editTelegramMessageMock).toHaveBeenCalledTimes(1);

        const parameters = editTelegramMessageMock.mock.calls[0]?.[0];

        expect(parameters?.messageId).toBe(MESSAGE_ID);
        expect(parameters?.text).toBe('done');
    });

    it('should pass replyMarkup through to the final write', async () => {
        const progress = await start();
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

        expect(editTelegramMessageMock.mock.calls[0]?.[0].replyMarkup).toBe(replyMarkup);
    });

    it('should stop refreshing once finished', async () => {
        const progress = await start();

        await progress.finish({ text: 'done' });
        await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);

        expect(editedTexts()).toEqual(['done']);
    });

    it('should stop refreshing after stopRefresh', async () => {
        const progress = await start();

        progress.stopRefresh();
        await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);

        expect(editTelegramMessageMock).not.toHaveBeenCalled();
    });

    // The bug this util exists to prevent: clearInterval does not recall a refresh that is
    // already in flight, so without a write chain the stale count could land last and the
    // message would sit on "waiting 10" forever instead of showing the outcome.
    it('should apply the final text after a refresh that is already in flight', async () => {
        let releaseRefresh = (): void => {};

        editTelegramMessageMock.mockImplementationOnce(() => new Promise<void>((resolve) => {
            releaseRefresh = resolve;
        }));

        const progress = await start();

        // Let the refresh start, and leave its request hanging.
        await vi.advanceTimersByTimeAsync(INTERVAL_MS);
        expect(editTelegramMessageMock).toHaveBeenCalledTimes(1);

        const finished = progress.finish({ text: 'done' });

        // The final write must not have been issued while the refresh is still open.
        await vi.advanceTimersByTimeAsync(0);
        expect(editTelegramMessageMock).toHaveBeenCalledTimes(1);

        releaseRefresh();
        await finished;

        expect(editedTexts()).toEqual([
            'waiting 10',
            'done',
        ]);
    });

    it('should drop a refresh that was queued before finishing', async () => {
        let releaseFirstRefresh = (): void => {};

        editTelegramMessageMock.mockImplementationOnce(() => new Promise<void>((resolve) => {
            releaseFirstRefresh = resolve;
        }));

        const progress = await start();

        // First refresh starts and hangs; the second queues up behind it.
        await vi.advanceTimersByTimeAsync(INTERVAL_MS);
        await vi.advanceTimersByTimeAsync(INTERVAL_MS);
        expect(editTelegramMessageMock).toHaveBeenCalledTimes(1);

        const finished = progress.finish({ text: 'done' });

        releaseFirstRefresh();
        await finished;

        // The queued second refresh is dropped rather than overwriting the outcome.
        expect(editedTexts()).toEqual([
            'waiting 10',
            'done',
        ]);
    });

    it('should report a failed refresh through onEditError without stopping later writes', async () => {
        const onEditError = vi.fn();
        const failure = new Error('refresh failed');

        editTelegramMessageMock.mockRejectedValueOnce(failure);

        const progress = await start({ onEditError });

        await vi.advanceTimersByTimeAsync(INTERVAL_MS);

        expect(onEditError).toHaveBeenCalledWith(failure);

        await progress.finish({ text: 'done' });

        expect(editedTexts()).toEqual([
            'waiting 10',
            'done',
        ]);
    });

    it('should reject when the final write fails', async () => {
        const failure = new Error('final write failed');

        editTelegramMessageMock.mockRejectedValueOnce(failure);

        const progress = await start();

        await expect(progress.finish({ text: 'done' })).rejects.toBe(failure);
    });

    it('should still apply a later finish after an earlier one failed', async () => {
        editTelegramMessageMock.mockRejectedValueOnce(new Error('final write failed'));

        const progress = await start();

        await expect(progress.finish({ text: 'done' })).rejects.toThrow();
        await progress.finish({ text: 'error report' });

        expect(editedTexts()).toEqual([
            'done',
            'error report',
        ]);
    });
});
