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
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function extractTrackerDomain(tracker: string): string {
  try {
    return new URL(tracker).hostname;
  } catch {
    return tracker;
  }
}

export function formatTorrentEvent(event: TorrentEvent): string {
  const isAdded = event.event === "torrent_added";
  const icon = isAdded ? "🚀" : "🏁";
  const title = isAdded ? "Download started" : "Download finished";

  const lines: string[] = [`${icon} <b>${title}</b>`];
  lines.push("");
  lines.push(`📦 <b>${event.name}</b>`);

  const size = Number(event.sizeBytes);
  const fileCount = Number(event.fileCount);
  const details: string[] = [];
  if (!isNaN(size) && size > 0) details.push(formatBytes(size));
  if (!isNaN(fileCount) && fileCount > 0)
    details.push(`${fileCount} file${fileCount > 1 ? "s" : ""}`);
  if (details.length > 0) lines.push(`💾 ${details.join(" · ")}`);

  if (event.category) lines.push(`🏷 ${event.category}`);
  if (event.tags) lines.push(`🔖 ${event.tags}`);
  if (event.tracker) lines.push(`🌐 ${extractTrackerDomain(event.tracker)}`);
  if (event.savePath) lines.push(`📂 <code>${event.savePath}</code>`);

  return lines.join("\n");
}
