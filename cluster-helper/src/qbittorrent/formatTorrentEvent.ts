import {
    escapeTelegramMarkdown,
    telegramBold,
    telegramLink,
} from 'senaev-utils/src/utils/TelegramApi/formatTelegramMarkdown/formatTelegramMarkdown';
import { formatBytes } from 'senaev-utils/src/types/Bytes/formatBytes/formatBytes';

export interface TorrentEvent {
    event: 'torrent_added' | 'torrent_finished';
    name: string;
    category: string;
    tags: string;
    contentPath: string;
    rootPath: string;
    savePath: string;
    fileCount: string;
    sizeBytes: string;
    tracker: string;
}

export function isTorrentEvent(value: unknown): value is TorrentEvent {
    return (
        typeof value === 'object' && value !== null && 'event' in value && ((value as TorrentEvent).event === 'torrent_added' || (value as TorrentEvent).event === 'torrent_finished')
    );
}

function extractTrackerDomain(tracker: string): string {
    try {
        return new URL(tracker).hostname;
    } catch {
        return tracker;
    }
}

function formatTorrentAdded(event: TorrentEvent): string {
    const lines: string[] = [`🚀 ${telegramBold('Началась загрузка:')} ${escapeTelegramMarkdown(event.name)}`];

    lines.push(telegramLink({
        text: 'Отслеживать',
        url: 'https://qbittorrent.senaev.ru/',
    }));
    lines.push('');

    const size = Number(event.sizeBytes);
    const fileCount = Number(event.fileCount);
    const details: string[] = [];

    if (!isNaN(size) && size > 0) {
        details.push(formatBytes(size));
    }

    if (!isNaN(fileCount) && fileCount > 0) {
        details.push(`${fileCount} file${fileCount > 1 ? 's' : ''}`);
    }

    if (details.length > 0) {
        lines.push(`💾 ${details.join(' · ')}`);
    }

    if (event.tracker) {
        lines.push(`🌐 ${escapeTelegramMarkdown(extractTrackerDomain(event.tracker))}`);
    }

    return lines.join('\n');
}

function formatTorrentFinished(event: TorrentEvent): string {
    return [
        `🏁 ${telegramBold('Загрузка завершена:')} ${escapeTelegramMarkdown(event.name)}`,
        telegramLink({
            text: 'Смотреть',
            url: 'https://jellyfin.senaev.ru/',
        }),
        telegramLink({
            text: 'Скачать',
            url: 'https://filebrowser.senaev.ru/files/volumes/qbittorrent/downloads/completed/',
        }),
    ].join('\n');
}

export function formatTorrentEvent(event: TorrentEvent): string {
    if (event.event === 'torrent_finished') {
        return formatTorrentFinished(event);
    }

    return formatTorrentAdded(event);
}
