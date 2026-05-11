import { formatBytes } from "senaev-utils/src/types/Bytes/formatBytes/formatBytes";
import { isUnsignedInteger } from "senaev-utils/src/types/Number/UnsignedInteger";
import { callTelegramApi } from "senaev-utils/src/utils/TelegramApi/callTelegramApi";
import { TG_TOKEN_SENAEV_COM_BOT } from "./env";
import { ProwlarrRelease } from "./prowlarr";
import { createTorrentSearchSession, getTorrentSearchSession } from "./torrentSearchSessions";

const PAGE_SIZE = 10;

export interface InlineKeyboardMarkup {
    inline_keyboard: Array<Array<{ callback_data: string; text: string }>>;
}

function releaseSeeds(release: ProwlarrRelease): number {
    return release.seeders ?? release.peers ?? 0;
}

function formatReleaseLine(release: ProwlarrRelease, displayIndex: number): string {
    return [
        `${displayIndex}. ${release.title ?? "Untitled"}`,
        `   ${isUnsignedInteger(release.size) ? formatBytes(release.size) : "?no-size?"} | seeds: ${releaseSeeds(release)} | ${release.indexer ?? "unknown"}`,
    ].join("\n");
}

function buildTorrentSearchMessage({
    page,
    query,
    releases,
}: {
    page: number;
    query: string;
    releases: ProwlarrRelease[];
}): string {
    if (releases.length === 0) {
        return `🔎 No torrents found for: ${query}`;
    }

    const pageCount = Math.ceil(releases.length / PAGE_SIZE);
    const startIndex = page * PAGE_SIZE;
    const pageReleases = releases.slice(startIndex, startIndex + PAGE_SIZE);
    return [
        `🔎 Torrents for: ${query}`,
        `Page ${page + 1}/${pageCount} | sorted by seeds`,
        "",
        ...pageReleases.map((release, index) => formatReleaseLine(release, startIndex + index + 1)),
    ].join("\n");
}

function buildTorrentSearchKeyboard({
    page,
    releases,
    sessionId,
}: {
    page: number;
    releases: ProwlarrRelease[];
    sessionId: string;
}): InlineKeyboardMarkup | undefined {
    if (releases.length === 0) {
        return undefined;
    }

    const pageCount = Math.ceil(releases.length / PAGE_SIZE);
    const startIndex = page * PAGE_SIZE;
    const pageReleases = releases.slice(startIndex, startIndex + PAGE_SIZE);
    const inline_keyboard = pageReleases.map((_, index) => [
        {
            text: `⬇️ ${startIndex + index + 1}`,
            callback_data: `torrent:download:${sessionId}:${startIndex + index}`,
        },
    ]);

    const paginationButtons = [];
    if (page > 0) {
        paginationButtons.push({
            text: "⬅️ Previous",
            callback_data: `torrent:page:${sessionId}:${page - 1}`,
        });
    }
    if (page < pageCount - 1) {
        paginationButtons.push({
            text: "Next ➡️",
            callback_data: `torrent:page:${sessionId}:${page + 1}`,
        });
    }
    if (paginationButtons.length > 0) {
        inline_keyboard.push(paginationButtons);
    }

    return { inline_keyboard };
}

export function createTorrentSearchView({
    page,
    query,
    releases,
    sessionId,
}: {
    page: number;
    query: string;
    releases: ProwlarrRelease[];
    sessionId?: string;
}): {
    replyMarkup?: InlineKeyboardMarkup;
    sessionId: string;
    text: string;
} {
    const currentSessionId = sessionId ?? createTorrentSearchSession({ query, releases });
    const replyMarkup = buildTorrentSearchKeyboard({
        page,
        releases,
        sessionId: currentSessionId,
    });

    return {
        sessionId: currentSessionId,
        text: buildTorrentSearchMessage({ page, query, releases }),
        ...(replyMarkup && { replyMarkup }),
    };
}

export function getTorrentSearchView({
    page,
    sessionId,
}: {
    page: number;
    sessionId: string;
}): ReturnType<typeof createTorrentSearchView> | undefined {
    const session = getTorrentSearchSession(sessionId);
    if (!session) {
        return undefined;
    }

    return createTorrentSearchView({
        page,
        query: session.query,
        releases: session.releases,
        sessionId,
    });
}

export async function editTelegramMessageWithTorrentSearchView({
    chatId,
    messageId,
    page,
    sessionId,
}: {
    chatId: number | string;
    messageId: number;
    page: number;
    sessionId: string;
}): Promise<void> {
    const view = getTorrentSearchView({ page, sessionId });
    if (!view) {
        await callTelegramApi({
            method: "editMessageText",
            token: TG_TOKEN_SENAEV_COM_BOT,
            body: {
                chat_id: chatId,
                message_id: messageId,
                text: "❌ Запрос устарел, нужно поискать заново",
            },
        });
        return;
    }

    await callTelegramApi({
        method: "editMessageText",
        token: TG_TOKEN_SENAEV_COM_BOT,
        body: {
            chat_id: chatId,
            message_id: messageId,
            text: view.text,
            ...(view.replyMarkup && { reply_markup: view.replyMarkup }),
        },
    });
}

export function getTorrentSearchRelease({
    releaseIndex,
    sessionId,
}: {
    releaseIndex: number;
    sessionId: string;
}): ProwlarrRelease | undefined {
    return getTorrentSearchSession(sessionId)?.releases[releaseIndex];
}
