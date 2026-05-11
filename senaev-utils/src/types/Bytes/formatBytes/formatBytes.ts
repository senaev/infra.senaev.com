import { Bytes } from '../Bytes';

export function formatBytes(bytes: Bytes): string {
    const units = [
        'B',
        'KB',
        'MB',
        'GB',
        'TB',
    ];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }

    return `${Math.round(value)} ${units[unitIndex]}`;
}
