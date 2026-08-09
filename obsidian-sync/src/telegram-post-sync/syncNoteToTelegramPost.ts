import { logger } from "../logger";
import { createTelegramRichMessage } from "../telegram/createTelegramRichMessage";
import { editTelegramRichMessage } from "../telegram/editTelegramRichMessage";
import { reportSyncError } from "../telegram/reportSyncError";
import { buildTelegramPostLink } from "./parseTelegramPostLink";
import { readNoteTracking } from "./readNoteTracking";
import { renderNoteForTelegram } from "./render/renderNoteForTelegram";
import type { ResolvedEmbed } from "./render/resolveImageEmbeds";
import { replaceTrackingLinkInFrontmatter } from "./replaceTrackingLinkInFrontmatter";
import { deleteTrackedNote, setTrackedNote, type TrackedTarget } from "./trackedNotes";
import { rearmVaultWatcher } from "./watchVaultForNoteChanges";

type InFlight = { pending: boolean };

// One entry per note currently being pushed. A single Obsidian save emits several inotify
// events, so without this the same edit would be sent two to four times. This is not a
// debounce — nothing is delayed; concurrent requests for the same note simply collapse
// into one follow-up run after the current push finishes.
const inFlight = new Map<string, InFlight>();

// Entries this process has already published a post for, keyed by note and original link.
// Publishing is not idempotent, so if writing the new link back to the note ever fails, this
// is what stops the next filesystem event from publishing a second, third, fourth post.
// Keyed by link rather than position so that reordering the list can't shift the guard onto
// the wrong entry.
const publishedInThisProcess = new Set<string>();

function publishGuardKey(relativePath: string, link: string): string {
    return `${relativePath}\n${link}`;
}

/**
 * Publishes the note as a brand new post and returns its message id.
 *
 * Deliberately leaves the note alone: recording the id is the caller's job, so that the
 * unrecoverable window between "post exists" and "note knows about it" is visible at the
 * call site rather than buried in here.
 */
async function publishNewPost(
    relativePath: string,
    link: string,
    chatId: string,
    markdown: string,
    media: ResolvedEmbed[],
): Promise<number> {
    const guardKey = publishGuardKey(relativePath, link);
    if (publishedInThisProcess.has(guardKey)) {
        throw new Error(
            `Refusing to publish a second post for ${link} in "${relativePath}" — the first ` +
                `post was created but its link was never written back. Fill it in manually.`,
        );
    }

    logger.info({ relativePath, chatId }, "🆕 Publishing a new post for channel-only link");

    const messageId = await createTelegramRichMessage({ chatId, markdown, media });
    publishedInThisProcess.add(guardKey);
    logger.info({ relativePath, messageId }, "✅ Post published");

    return messageId;
}

async function pushTarget(
    relativePath: string,
    entry: TrackedTarget,
    markdown: string,
    media: ResolvedEmbed[],
): Promise<void> {
    if (entry.target.kind === "channel") {
        const { chatId } = entry.target;
        const messageId = await publishNewPost(relativePath, entry.link, chatId, markdown, media);
        const postLink = buildTelegramPostLink(chatId, messageId);

        try {
            await replaceTrackingLinkInFrontmatter(relativePath, entry.link, postLink);

            // The write-back replaces the note by renaming a temp file over it, which detaches
            // the watch from this path. Without rebuilding it here, every later edit of the
            // note we just published would go unnoticed until the next reconcile pass.
            rearmVaultWatcher();
        } catch (error) {
            // The post exists but nothing points at it. Surface the link so it can be pasted
            // in by hand — it cannot be recovered from the Bot API, which has no getMessage.
            throw new Error(
                `Published ${postLink} but failed to write it back to "${relativePath}" — ` +
                    `add it to the note's frontmatter manually. Cause: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
            );
        }

        return;
    }

    const { chatId, messageId } = entry.target;
    const outcome = await editTelegramRichMessage({ chatId, messageId, markdown, media });

    logger.info(
        { relativePath, messageId, outcome },
        outcome === "updated" ? "✅ Post updated" : "➖ Post already up to date",
    );
}

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
            targets: tracked.targets.map((entry) => entry.link),
            characters: markdown.length,
            images: media.length,
        },
        "📤 Syncing note to Telegram",
    );

    // Targets are independent mirrors, so one failure must not strand the others. Failures
    // are collected and reported together once every target has had its turn.
    const failures: string[] = [];
    for (const entry of tracked.targets) {
        try {
            await pushTarget(relativePath, entry, markdown, media);
        } catch (error) {
            failures.push(`${entry.link}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    if (failures.length > 0) {
        throw new Error(
            `${failures.length} of ${tracked.targets.length} targets failed\n${failures.join("\n")}`,
        );
    }
}

/**
 * Renders a note and mirrors it into every Telegram post it is linked to, publishing new
 * posts for any channel-only links.
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
