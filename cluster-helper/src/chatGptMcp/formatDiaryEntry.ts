import type { DiaryEntry } from './handleMcpMessage';

export function formatDiaryEntry({
    date, title, content,
}: DiaryEntry): string {
    const heading = title === undefined ? date : `${date} ${title}`;

    return `# ${heading}\n\n${content}`;
}
