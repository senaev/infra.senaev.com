/**
 * The fields of a Telegram update that are safe to log: its ID and its types (for example
 * `message` or `callback_query`), never the content, the users or the chats.
 */
export function describeTelegramUpdate(update: Record<string, unknown>): { updateId: unknown; types: string[] } {
    return {
        updateId: update.update_id,
        types: Object.keys(update).filter((key) => key !== 'update_id'),
    };
}
