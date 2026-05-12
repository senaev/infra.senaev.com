import { escapeHtml } from "../utils/escapeHtml";

export interface TorrentEvent {
    event: "torrent_added" | "torrent_finished";
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
        typeof value === "object" &&
        value !== null &&
        "event" in value &&
        ((value as TorrentEvent).event === "torrent_added" ||
            (value as TorrentEvent).event === "torrent_finished")
    );
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / 1024 ** i;
    return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function extractTrackerDomain(tracker: string): string {
    try {
        return new URL(tracker).hostname;
    } catch {
        return tracker;
    }
}

function formatTorrentAdded(event: TorrentEvent): string {
    const lines: string[] = [`🚀 <b>Началась загрузка</b>`];
    lines.push('<a href="https://qbittorrent.senaev.ru/">Отслеживать</a>');
    lines.push("");
    lines.push(`📦 <b>${escapeHtml(event.name)}</b>`);

    const size = Number(event.sizeBytes);
    const fileCount = Number(event.fileCount);
    const details: string[] = [];
    if (!isNaN(size) && size > 0) details.push(formatBytes(size));
    if (!isNaN(fileCount) && fileCount > 0)
        details.push(`${fileCount} file${fileCount > 1 ? "s" : ""}`);
    if (details.length > 0) lines.push(`💾 ${details.join(" · ")}`);

    if (event.tracker) lines.push(`🌐 ${escapeHtml(extractTrackerDomain(event.tracker))}`);

    return lines.join("\n");
}

function formatTorrentFinished(event: TorrentEvent): string {
    return [
        `🏁 <b>Загрузка завершена:</b> ${escapeHtml(event.name)}`,
        '<a href="https://jellyfin.senaev.ru/">Смотреть</a>',
        '<a href="https://filebrowser.senaev.ru/files/volumes/qbittorrent/downloads/completed/">Скачать</a>',
    ].join("\n");
}

export function formatTorrentEvent(event: TorrentEvent): string {
    if (event.event === "torrent_finished") {
        return formatTorrentFinished(event);
    }
    return formatTorrentAdded(event);
}
