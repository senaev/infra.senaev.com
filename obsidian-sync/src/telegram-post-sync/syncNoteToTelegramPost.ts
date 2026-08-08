import { logger } from "../logger";
import { editTelegramRichMessage } from "../telegram/editTelegramRichMessage";
import { reportSyncError } from "../telegram/reportSyncError";
import { readNoteTracking } from "./readNoteTracking";
import { renderNoteForTelegram } from "./render/renderNoteForTelegram";
import { deleteTrackedNote, setTrackedNote } from "./trackedNotes";

type InFlight = { pending: boolean };

// One entry per note currently being pushed. A single Obsidian save emits several inotify
// events, so without this the same edit would be sent two to four times. This is not a
// debounce — nothing is delayed; concurrent requests for the same note simply collapse
// into one follow-up run after the current push finishes.
const inFlight = new Map<string, InFlight>();

async function pushOnce(relativePath: string): Promise<void> {
    const result = await readNoteTracking(relativePath);
    if (result === null) {
        // The note lost its tracking key or vanished between the event and this read.
        if (deleteTrackedNote(relativePath)) {
            logger.info({ relativePath }, "🚫 Note is no longer tracked, leaving the post as is");
        }
        return;
    }

    const { tracked, content } = result;
    setTrackedNote(tracked);

    const { markdown, media } = renderNoteForTelegram(content);
    logger.info(
        {
            relativePath,
            chatId: tracked.chatId,
            messageId: tracked.messageId,
            characters: markdown.length,
            images: media.length,
        },
        "📤 Pushing note to Telegram post",
    );

    const outcome = await editTelegramRichMessage({
        chatId: tracked.chatId,
        messageId: tracked.messageId,
        markdown,
        media,
    });

    logger.info(
        { relativePath, messageId: tracked.messageId, outcome },
        outcome === "updated" ? "✅ Post updated" : "➖ Post already up to date",
    );
}

/**
 * Renders a note and rewrites its Telegram post.
 *
 * Never rejects — failures are logged and mirrored to the cluster chat, because callers
 * are filesystem event handlers with nobody left to catch.
 */
export function syncNoteToTelegramPost(relativePath: string): Promise<void> {
    const existing = inFlight.get(relativePath);
    if (existing) {
        existing.pending = true;
        logger.info({ relativePath }, "⏭ Push already running, queued one follow-up");
        return Promise.resolve();
    }

    const state: InFlight = { pending: false };
    inFlight.set(relativePath, state);

    return (async () => {
        try {
            do {
                state.pending = false;
                await pushOnce(relativePath);
            } while (state.pending);
        } catch (error) {
            await reportSyncError(`Failed to sync note "${relativePath}"`, error);
        } finally {
            inFlight.delete(relativePath);
        }
    })();
}
