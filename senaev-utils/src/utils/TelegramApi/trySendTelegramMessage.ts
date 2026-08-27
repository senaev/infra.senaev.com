import { SendTelegramMessageParameters, sendTelegramMessage } from './sendTelegramMessage';

export type TrySendTelegramMessageResult =
    | { sent: true; messageId: number }
    | { sent: false; error: unknown };

/**
 * Sends a message and reports a failure instead of throwing.
 *
 * For messages that are themselves a reaction to something going wrong — alerts sent from
 * event handlers and catch blocks, where there is nobody left to handle a second failure.
 * A broken alert channel must not take the caller down with it, so the send error is
 * returned for the caller to log rather than raised.
 */
export async function trySendTelegramMessage(parameters: SendTelegramMessageParameters): Promise<TrySendTelegramMessageResult> {
    try {
        const { message_id: messageId } = await sendTelegramMessage(parameters);

        return {
            sent: true,
            messageId,
        };
    } catch (error) {
        return {
            sent: false,
            error,
        };
    }
}
