import { formatBytes } from 'senaev-utils/src/types/Bytes/formatBytes/formatBytes';
import { isUnsignedInteger } from 'senaev-utils/src/types/Number/UnsignedInteger';
import { escapeHtml } from 'senaev-utils/src/utils/String/escapeHtml/escapeHtml';
import {
    telegramBold,
    telegramCode,
    telegramLink,
} from 'senaev-utils/src/utils/TelegramApi/formatTelegramHtml/formatTelegramHtml';
import { InlineKeyboardMarkup } from 'senaev-utils/src/utils/TelegramApi/types';

import { ProwlarrRelease } from './prowlarr';
import { editTelegramHtmlMessage } from './telegramHtmlMessages';
import { createTorrentSearchSession, getTorrentSearchSession } from './torrentSearchSessions';

const PAGE_SIZE = 5;

function releaseSeeds(release: ProwlarrRelease): number {
    return release.seeders ?? release.peers ?? 0;
}

function formatReleaseValue(value: string | number | undefined): string {
    return escapeHtml(value === undefined ? '?' : String(value));
}

function formatPublishDate(publishDate: string | undefined): string {
    if (!publishDate) {
        return '?';
    }

    return publishDate.slice(0, 10);
}

function formatReleaseLine(release: ProwlarrRelease, displayIndex: number): string {
    const title = release.title ?? 'Untitled';
    const size = isUnsignedInteger(release.size) ? formatBytes(release.size) : '?no-size?';

    const indexer = release.infoUrl
        ? telegramLink({
            text: release.indexer ?? 'unknown',
            url: release.infoUrl,
        })
        : formatReleaseValue(release.indexer);

    const peers = `${releaseSeeds(release)}⬆️${formatReleaseValue(release.leechers)}⬇️`;

    return [
        `${displayIndex}. ${telegramBold(title)}`,
        [
            indexer,
            telegramBold(size),
            escapeHtml(formatPublishDate(release.publishDate)),
        ].join(' '),
        peers,
    ].join('\n');
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
        return `🔎 Ничего не найдено для:\n${telegramCode(query)}`;
    }

    const pageCount = Math.ceil(releases.length / PAGE_SIZE);
    const startIndex = page * PAGE_SIZE;
    const pageReleases = releases.slice(startIndex, startIndex + PAGE_SIZE);

    return [
        `🔎 ${telegramCode(query)}`,
        ...pageReleases.map((release, index) => formatReleaseLine(release, startIndex + index + 1)),
        `🗒️ ${page + 1} из ${pageCount}`,
    ].join('\n\n');
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
    const inline_keyboard = [
        pageReleases.map((_, index) => {
            return {
                text: `⬇️ ${startIndex + index + 1}`,
                callback_data: `torrent:download:${sessionId}:${startIndex + index}`,
            };
        }),
    ];

    const paginationButtons = [];

    if (page > 0) {
        paginationButtons.push({
            text: '⬅️ Предыдущие',
            callback_data: `torrent:page:${sessionId}:${page - 1}`,
        });
    }

    if (page < pageCount - 1) {
        paginationButtons.push({
            text: 'Ещё ➡️',
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
    const currentSessionId = sessionId ?? createTorrentSearchSession({
        query,
        releases,
    });
    const replyMarkup = buildTorrentSearchKeyboard({
        page,
        releases,
        sessionId: currentSessionId,
    });

    return {
        sessionId: currentSessionId,
        text: buildTorrentSearchMessage({
            page,
            query,
            releases,
        }),
        ...(replyMarkup && { replyMarkup }),
    };
}

// A Prowlarr search can run for minutes, and until it answers the chat showed nothing at
// all, so a slow search and a dead bot looked the same. The placeholder this builds is sent
// straight away and then edited in place, first with the elapsed time and finally with the
// results, which is why it opens with the same `🔎 <query>` line as buildTorrentSearchMessage.
export function buildTorrentSearchProgressText({
    elapsedSeconds,
    query,
}: {
    elapsedSeconds: number;
    query: string;
}): string {
    return [
        `🔎 ${telegramCode(query)}`,
        escapeHtml(`⏳ Ищу в Prowlarr… ${elapsedSeconds} сек`),
    ].join('\n\n');
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
    const view = getTorrentSearchView({
        page,
        sessionId,
    });

    if (!view) {
        await editTelegramHtmlMessage({
            chatId,
            messageId,
            text: '❌ Запрос устарел, нужно поискать заново',
        });

        return;
    }

    await editTelegramHtmlMessage({
        chatId,
        messageId,
        text: view.text,
        ...(view.replyMarkup && { replyMarkup: view.replyMarkup }),
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
