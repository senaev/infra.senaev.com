import {
    mkdirSync, readFileSync, writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';

import { isNotFoundError } from 'senaev-utils/src/utils/Error/isNotFoundError/isNotFoundError';

import { logger } from '../logger';
import { TELEGRAM_SYNC_HASHES_FILE_PATH } from '../vaultPaths';

const pushedNoteHashes = new Map<string, string>();

function save(): void {
    try {
        writeFileSync(
            TELEGRAM_SYNC_HASHES_FILE_PATH,
            `${JSON.stringify(Object.fromEntries(pushedNoteHashes), undefined, 4)}\n`,
            'utf8'
        );
    } catch (error) {
        logger.warn({
            err: error,
            path: TELEGRAM_SYNC_HASHES_FILE_PATH,
        }, '⚠️ Could not persist pushed note hashes');
    }
}

export function loadPushedNoteHashes(): void {
    mkdirSync(dirname(TELEGRAM_SYNC_HASHES_FILE_PATH), { recursive: true });

    let content: string;

    try {
        content = readFileSync(TELEGRAM_SYNC_HASHES_FILE_PATH, 'utf8');
    } catch (error) {
        if (!isNotFoundError(error)) {
            logger.warn({
                err: error,
                path: TELEGRAM_SYNC_HASHES_FILE_PATH,
            }, '⚠️ Could not read pushed note hashes, starting from an empty map');

            return;
        }

        save();
        logger.info(
            { path: TELEGRAM_SYNC_HASHES_FILE_PATH },
            '🆕 Created the pushed note hashes file, every tracked note will be pushed once'
        );

        return;
    }

    let parsed: unknown;

    try {
        parsed = JSON.parse(content);
    } catch (error) {
        logger.warn({
            err: error,
            path: TELEGRAM_SYNC_HASHES_FILE_PATH,
        }, '⚠️ Pushed note hashes file is not valid JSON, starting from an empty map');

        return;
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        logger.warn(
            { path: TELEGRAM_SYNC_HASHES_FILE_PATH },
            '⚠️ Pushed note hashes file is not an object, starting from an empty map'
        );

        return;
    }

    for (const [
        relativePath,
        hash,
    ] of Object.entries(parsed)) {
        if (typeof hash === 'string') {
            pushedNoteHashes.set(relativePath, hash);
        }
    }

    logger.info(
        {
            loaded: pushedNoteHashes.size,
            path: TELEGRAM_SYNC_HASHES_FILE_PATH,
        },
        '📖 Loaded pushed note hashes from the vault'
    );
}

export function getPushedNoteHash(relativePath: string): string | undefined {
    return pushedNoteHashes.get(relativePath);
}

export function setPushedNoteHash(relativePath: string, hash: string): void {
    pushedNoteHashes.set(relativePath, hash);
    save();
}

export function deletePushedNoteHash(relativePath: string): void {
    if (pushedNoteHashes.delete(relativePath)) {
        save();
    }
}
