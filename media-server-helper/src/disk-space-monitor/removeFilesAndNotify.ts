import { rmdir, unlink } from "fs/promises";
import { dirname } from "path";
import { escapeHtml, sendTelegramHtmlMessage } from "../telegram";
import { formatBytes } from "./formatBytes";
import { type FileToRemove } from "./getFilesToRemove";

const TELEGRAM_MESSAGE_LIMIT = 4096;

function formatDate(timestampMs: number): string {
    const date = new Date(timestampMs);
    const day = String(date.getUTCDate()).padStart(2, "0");
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const year = date.getUTCFullYear();
    const hours = String(date.getUTCHours()).padStart(2, "0");
    const minutes = String(date.getUTCMinutes()).padStart(2, "0");

    return `${day}-${month}-${year} ${hours}:${minutes}`;
}

function buildFileLine(file: FileToRemove): string {
    return [
        "•",
        `<code>${formatBytes(file.size)}</code>`,
        `(${formatDate(file.createdAtMs)})`,
        `${escapeHtml(file.path)}`,
    ].join(" ");
}

function truncateForTelegram(text: string): string {
    if (text.length <= TELEGRAM_MESSAGE_LIMIT) {
        return text;
    }

    return `${text.slice(0, TELEGRAM_MESSAGE_LIMIT - 3)}...`;
}

export async function sendRemovalNotification({
    removedFiles,
    bytesToRemove,
    removedBytes,
    occupiedPercentBefore,
    occupiedPercentAfter,
    totalBytes,
    usedBytesBefore,
    usedBytesAfter,
}: {
    removedFiles: FileToRemove[];
    removedBytes: number;
    bytesToRemove: number;
    occupiedPercentBefore: number;
    occupiedPercentAfter: number;
    totalBytes: number;
    usedBytesBefore: number;
    usedBytesAfter: number;
}): Promise<void> {
    const summaryLines = [
        "<b>🗑️ Media Server Cleanup</b>",
        "",
        `<b>Removed files:</b> ${removedFiles.length}`,
        `<b>Removed size:</b> ${formatBytes(removedBytes)}`,
        `<b>Requested size:</b> ${formatBytes(bytesToRemove)}`,
        `<b>Disk used before:</b> ${formatBytes(usedBytesBefore)} (${occupiedPercentBefore.toFixed(2)}%)`,
        `<b>Disk used after:</b> ${formatBytes(usedBytesAfter)} (${occupiedPercentAfter.toFixed(2)}%)`,
        `<b>Total disk size:</b> ${formatBytes(totalBytes)}`,
    ];
    const fileLines = removedFiles.map(buildFileLine);
    const message = [...summaryLines, "", ...fileLines].join("\n");
    await sendTelegramHtmlMessage(truncateForTelegram(message));
}

export async function sendManualCleanupRequiredNotification({
    bytesToRemove,
    removableBytes,
    totalBytes,
    usedBytes,
    occupiedPercent,
}: {
    bytesToRemove: number;
    removableBytes: number;
    totalBytes: number;
    usedBytes: number;
    occupiedPercent: number;
}): Promise<void> {
    const message = [
        "<b>⚠️ Manual cleanup required</b>",
        "",
        "Automatic cleanup could not free enough space.",
        `<b>Needed to remove:</b> <code>${formatBytes(bytesToRemove)}</code>`,
        `<b>Can remove automatically:</b> <code>${formatBytes(removableBytes)}</code>`,
        `<b>Disk used now:</b> <code>${formatBytes(usedBytes)}</code> (${occupiedPercent.toFixed(2)}%)`,
        `<b>Total disk size:</b> <code>${formatBytes(totalBytes)}</code>`,
        "❗️❗️❗️ Please free additional space manually.",
    ].join("\n");

    await sendTelegramHtmlMessage(truncateForTelegram(message));
}

export async function removeFiles(filesToRemove: FileToRemove[]): Promise<void> {
    for (const file of filesToRemove) {
        await unlink(file.path);
        console.log(`🗑️ Removed file path=[${file.path}] size=[${formatBytes(file.size)}]`);
        try {
            await rmdir(dirname(file.path));
            console.log(`🗑️ Removed empty folder path=[${dirname(file.path)}]`);
        } catch {
            // Ignore directories that still contain files or cannot be removed.
        }
    }
}
