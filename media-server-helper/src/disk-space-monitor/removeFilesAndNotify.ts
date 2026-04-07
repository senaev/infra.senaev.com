import { rmdir, unlink } from "fs/promises";
import { dirname, relative, sep } from "path";
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
        escapeHtml(file.name),
        `<code>${formatBytes(file.size)}</code>`,
        `(${formatDate(file.createdAtMs)})`,
    ].join(" ");
}

type RemovedFilesTreeNode = {
    directories: Map<string, RemovedFilesTreeNode>;
    files: FileToRemove[];
};

function createTreeNode(): RemovedFilesTreeNode {
    return {
        directories: new Map<string, RemovedFilesTreeNode>(),
        files: [],
    };
}

function getCommonPathPrefix(paths: string[]): string {
    if (paths.length === 0) {
        return "";
    }

    const firstPath = paths[0];
    if (firstPath === undefined) {
        return "";
    }

    const restPaths = paths.slice(1);
    const firstSegments = firstPath.split(sep).filter(Boolean);
    let commonSegmentCount = firstSegments.length;

    for (const path of restPaths) {
        const segments = path.split(sep).filter(Boolean);
        commonSegmentCount = Math.min(commonSegmentCount, segments.length);

        for (let index = 0; index < commonSegmentCount; index += 1) {
            if (segments[index] !== firstSegments[index]) {
                commonSegmentCount = index;
                break;
            }
        }
    }

    if (commonSegmentCount === 0) {
        return sep;
    }

    return `${sep}${firstSegments.slice(0, commonSegmentCount).join(sep)}`;
}

function buildRemovedFilesTree(removedFiles: FileToRemove[]): {
    rootPath: string;
    tree: RemovedFilesTreeNode;
} {
    const rootPath = getCommonPathPrefix(removedFiles.map((file) => dirname(file.path)));
    const tree = createTreeNode();

    for (const file of removedFiles) {
        const relativePath = relative(rootPath, file.path);
        const pathSegments = relativePath.split(sep).filter(Boolean);
        let currentNode = tree;

        for (const segment of pathSegments.slice(0, -1)) {
            let nextNode = currentNode.directories.get(segment);

            if (!nextNode) {
                nextNode = createTreeNode();
                currentNode.directories.set(segment, nextNode);
            }

            currentNode = nextNode;
        }

        currentNode.files.push(file);
    }

    return { rootPath, tree };
}

function renderRemovedFilesTree(
    node: RemovedFilesTreeNode,
    prefix = "",
): string[] {
    const directoryEntries = [...node.directories.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
    );
    const fileEntries = [...node.files].sort((left, right) => left.path.localeCompare(right.path));
    const entriesCount = directoryEntries.length + fileEntries.length;
    const lines: string[] = [];
    let entryIndex = 0;

    for (const [directoryName, childNode] of directoryEntries) {
        entryIndex += 1;
        const isLastEntry = entryIndex === entriesCount;
        const branchPrefix = isLastEntry ? "└── " : "├── ";
        const childPrefix = `${prefix}${isLastEntry ? "    " : "│   "}`;

        lines.push(`${prefix}${branchPrefix}${escapeHtml(directoryName)}/`);
        lines.push(...renderRemovedFilesTree(childNode, childPrefix));
    }

    for (const file of fileEntries) {
        entryIndex += 1;
        const isLastEntry = entryIndex === entriesCount;
        const branchPrefix = isLastEntry ? "└── " : "├── ";
        lines.push(`${prefix}${branchPrefix}${buildFileLine(file)}`);
    }

    return lines;
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
    const { rootPath, tree } = buildRemovedFilesTree(removedFiles);
    const fileLines = [
        `<b>Removed tree root:</b> <code>${escapeHtml(rootPath)}</code>`,
        ...renderRemovedFilesTree(tree),
    ];
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
