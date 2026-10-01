import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import { DAILY_NOTE_DRAFT_FILE_PATH } from '../vaultPaths';

import { formatDailyNoteDraftRecord } from './formatDailyNoteDraftRecord';

/** Appends `text` as a new timestamped record, creating the file (and folders) if needed. */
export async function appendDailyNoteDraftRecord(text: string, now: Date = new Date()): Promise<void> {
    await mkdir(dirname(DAILY_NOTE_DRAFT_FILE_PATH), { recursive: true });
    await appendFile(DAILY_NOTE_DRAFT_FILE_PATH, formatDailyNoteDraftRecord(text, now), 'utf8');
}
