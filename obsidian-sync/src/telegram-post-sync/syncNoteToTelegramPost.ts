import { stringifyUnknownError } from 'senaev-utils/src/utils/Error/stringifyUnknownError/stringifyUnknownError';

import { logger } from '../logger';
import { createTelegramRichMessage } from '../telegram/createTelegramRichMessage';
import { editTelegramRichMessage } from '../telegram/editTelegramRichMessage';
import { reportSyncError } from '../telegram/reportSyncError';

import { hashRenderedNote } from './hashRenderedNote';
import { buildTelegramPostLink } from './parseTelegramPostLink';
import {
    deletePushedNoteHash,
    getPushedNoteHash,
    setPushedNoteHash,
} from './pushedNoteHashes';
import { readNoteTracking } from './readNoteTracking';
import { renderNoteForTelegram } from './render/renderNoteForTelegram';
import type { ResolvedEmbed } from './render/resolveImageEmbeds';
import { replaceTrackingLinkInFrontmatter } from './replaceTrackingLinkInFrontmatter';
import {
    deleteTrackedNote, setTrackedNote, type TrackedTarget,
} from './trackedNotes';

type InFlight = { pending: boolean };

// One entry per note currently being pushed. A single Obsidian save emits several inotify
// events, so without this the same edit would be sent two to four times. This is not a
// debounce — nothing is delayed; concurrent requests for the same note simply collapse
// into one follow-up run after the current push finishes.
const inFlight = new Map<string, InFlight>();

// Posts this process has published, keyed by note and the channel link they came from.
// Publishing is not idempotent, so whenever a note still points at a bare channel this is
// what distinguishes "publish the first post" from "the link never made it back into the
// note". Keyed by link rather than position so that reordering the list can't shift the
// guard onto the wrong entry, and holding the message id so the post can be reused.
const publishedInThisProcess = new Map<string, number>();

function publishGuardKey(relativePath: string, link: string): string {
    return `${relativePath}\n${link}`;
}

/**
 * Returns the post this note's channel link should write into, publishing one if needed.
 *
 * A note that still points at a bare channel after we have already published for it means
 * the link we wrote back was lost. That happens for real: Obsidian Sync can replace the file
 * with a copy from a device that was editing it before the write-back landed, silently
 * reverting the frontmatter. Publishing again would leave a duplicate post behind and the
 * note would never converge, so the existing post is reused and the write-back retried.
 *
 * Deliberately leaves the note alone: recording the id is the caller's job, so that the
 * unrecoverable window between "post exists" and "note knows about it" is visible at the
 * call site rather than buried in here.
 */
async function resolvePostForChannel({
    relativePath,
    link,
    chatId,
    markdown,
    media,
}: {
    relativePath: string;
    link: string;
    chatId: string;
    markdown: string;
    media: ResolvedEmbed[];
}): Promise<{ messageId: number; reused: boolean }> {
    const guardKey = publishGuardKey(relativePath, link);
    const alreadyPublished = publishedInThisProcess.get(guardKey);

    if (alreadyPublished !== undefined) {
        logger.warn(
            {
                relativePath,
                messageId: alreadyPublished,
                link,
            },
            '⚠️ Note points at the channel again — reusing the post already published for it'
        );

        return {
            messageId: alreadyPublished,
            reused: true,
        };
    }

    logger.info({
        relativePath,
        chatId,
    }, '🆕 Publishing a new post for channel-only link');

    const messageId = await createTelegramRichMessage({
        chatId,
        markdown,
        media,
    });

    publishedInThisProcess.set(guardKey, messageId);
    logger.info({
        relativePath,
        messageId,
    }, '✅ Post published');

    return {
        messageId,
        reused: false,
    };
}

/** Pushes one mirror and returns the link the content now lives at. */
async function pushTarget(
    relativePath: string,
    entry: TrackedTarget,
    markdown: string,
    media: ResolvedEmbed[]
): Promise<string> {
    if (entry.target.kind === 'channel') {
        const { chatId } = entry.target;
        const { messageId, reused } = await resolvePostForChannel({
            relativePath,
            link: entry.link,
            chatId,
            markdown,
            media,
        });
        const postLink = buildTelegramPostLink(chatId, messageId);

        if (reused) {
            // The post holds the content from when it was published, and the note has almost
            // certainly been edited since — that edit is usually what triggered this push.
            const outcome = await editTelegramRichMessage({
                chatId,
                messageId,
                markdown,
                media,
            });

            logger.info({
                relativePath,
                messageId,
                outcome,
            }, '✅ Reused post brought up to date');
        }

        try {
            await replaceTrackingLinkInFrontmatter(relativePath, entry.link, postLink);
        } catch (error) {
            // The post exists but nothing points at it. Surface the link so it can be pasted
            // in by hand — it cannot be recovered from the Bot API, which has no getMessage.
            throw new Error(`Published ${postLink} but failed to write it back to "${relativePath}" — ` + `add it to the note's frontmatter manually. Cause: ${
                stringifyUnknownError(error)
            }`);
        }

        return postLink;
    }

    const { chatId, messageId } = entry.target;
    const outcome = await editTelegramRichMessage({
        chatId,
        messageId,
        markdown,
        media,
    });

    logger.info(
        {
            relativePath,
            messageId,
            outcome,
        },
        outcome === 'updated' ? '✅ Post updated' : '➖ Post already up to date'
    );

    return entry.link;
}

async function pushOnce(relativePath: string): Promise<void> {
    const result = await readNoteTracking(relativePath);

    if (result === null) {
        // The note lost its tracking key or vanished between the event and this read.
        if (deleteTrackedNote(relativePath)) {
            deletePushedNoteHash(relativePath);
            logger.info({ relativePath }, '🚫 Note is no longer tracked, leaving the post as is');
        }

        return;
    }

    const { tracked, content } = result;

    setTrackedNote(tracked);

    const storedHash = getPushedNoteHash(relativePath);

    const { markdown, media } = renderNoteForTelegram(content);
    const currentLinks = tracked.targets.map((entry) => entry.link);
    const currentHash = hashRenderedNote({
        markdown,
        media,
        telegramPostCloneLinks: currentLinks,
    });

    if (storedHash === currentHash) {
        logger.info({
            relativePath,
            hash: currentHash,
        }, '➖ Note unchanged since its last push');

        return;
    }

    logger.info(
        {
            relativePath,
            targets: currentLinks,
            characters: markdown.length,
            images: media.length,
            storedHash: storedHash ?? null,
            currentHash,
        },
        '📤 Syncing note to Telegram'
    );

    // Targets are independent mirrors, so one failure must not strand the others. Failures
    // are collected and reported together once every target has had its turn.
    const failures: string[] = [];
    const finalLinks: string[] = [];

    for (const entry of tracked.targets) {
        try {
            finalLinks.push(await pushTarget(relativePath, entry, markdown, media));
        } catch (error) {
            failures.push(`${entry.link}: ${stringifyUnknownError(error)}`);
        }
    }

    if (failures.length > 0) {
        // No hash is recorded, so the next pass retries this note rather than mistaking it for
        // one that is already up to date.
        throw new Error(`${failures.length} of ${tracked.targets.length} targets failed\n${failures.join('\n')}`);
    }

    // Fingerprinted against the links the content actually landed on, which differ from the
    // ones read above whenever a channel-only link was just turned into a post link. Recording
    // the pre-push value would look stale at once and cost a redundant push.
    const pushedHash = hashRenderedNote({
        markdown,
        media,
        telegramPostCloneLinks: finalLinks,
    });

    setPushedNoteHash(relativePath, pushedHash);
    logger.info({
        relativePath,
        hash: pushedHash,
    }, '🔖 Recorded content hash for this note');
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
        logger.info({ relativePath }, '⏭ Push already running, queued one follow-up');

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
