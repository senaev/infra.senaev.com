import { unlink } from "fs/promises";
import { escapeHtml, sendTelegramHtmlMessage } from "../telegram";
import { formatBytes } from "./formatBytes";
import { type FileToRemove } from "./getFilesToRemove";

const TELEGRAM_MESSAGE_LIMIT = 4096;

type SendRemovalNotificationArgs = {
    removedFiles: FileToRemove[];
    removedBytes: number;
    bytesToRemove: number;
    occupiedPercentBefore: number;
    occupiedPercentAfter: number;
    totalBytes: number;
    usedBytesBefore: number;
    usedBytesAfter: number;
};

function formatDate(timestampMs: number): string {
    return new Intl.DateTimeFormat("en", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "UTC",
    }).format(new Date(timestampMs));
}

function buildFileLine(file: FileToRemove): string {
    return [
        "•",
        `<code>${formatBytes(file.size)}</code>`,
        `<b>${formatDate(file.createdAtMs)}</b>`,
        `<code>${escapeHtml(file.path)}</code>`,
        `<b>${escapeHtml(file.name)}</b>`,
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
}: SendRemovalNotificationArgs): Promise<void> {
    const summaryLines = [
        "<b>🗑️ Media Server Cleanup</b>",
        "",
        `<b>Removed files:</b> <code>${removedFiles.length}</code>`,
        `<b>Removed size:</b> <code>${formatBytes(removedBytes)}</code>`,
        `<b>Requested size:</b> <code>${formatBytes(bytesToRemove)}</code>`,
        `<b>Disk used before:</b> <code>${formatBytes(usedBytesBefore)}</code> (${occupiedPercentBefore.toFixed(2)}%)`,
        `<b>Disk used after:</b> <code>${formatBytes(usedBytesAfter)}</code> (${occupiedPercentAfter.toFixed(2)}%)`,
        `<b>Total disk size:</b> <code>${formatBytes(totalBytes)}</code>`,
    ];
    const fileLines = removedFiles.map(buildFileLine);
    const message = [...summaryLines, "", ...fileLines].join("\n");
    await sendTelegramHtmlMessage(truncateForTelegram(message));
}

export async function removeFiles(filesToRemove: FileToRemove[]): Promise<void> {
    for (const file of filesToRemove) {
        await unlink(file.path);
        console.log(`🗑️ Removed file path=[${file.path}] size=[${formatBytes(file.size)}]`);
    }
}
