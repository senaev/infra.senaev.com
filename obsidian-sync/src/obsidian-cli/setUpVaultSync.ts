import { OBSIDIAN_VAULT_NAME, OBSIDIAN_VAULT_PATH } from '../env';
import { logger } from '../logger';

import { runObsidianCommand } from './runObsidianCommand';

const DEVICE_NAME = 'senaev-com-obsidian-headless';

/** Bidirectional so edits made in the cluster propagate back to Obsidian Sync. */
const SYNC_MODE = 'bidirectional';
const CONFLICT_STRATEGY = 'merge';
const EXCLUDED_FOLDERS = 'senaev-personal-tools/node_modules';
const SYNCED_CONFIGS = [
    'app',
    'appearance',
    'appearance-data',
    'hotkey',
    'core-plugin',
    'core-plugin-data',
    'community-plugin',
    'community-plugin-data',
].join(',');
const SYNCED_FILE_TYPES = [
    'image',
    'audio',
    'video',
    'pdf',
    'unsupported',
].join(',');

/**
 * Authenticates against Obsidian Sync and points the CLI at the vault directory,
 * then applies every sync setting. Safe to re-run on each container start — all
 * of these commands are idempotent.
 */
export async function setUpVaultSync(): Promise<void> {
    logger.info('🔑 Logging in to Obsidian Sync');
    await runObsidianCommand(['login']);

    logger.info(
        {
            vault: OBSIDIAN_VAULT_NAME,
            path: OBSIDIAN_VAULT_PATH,
        },
        '🗂 Setting up vault'
    );
    await runObsidianCommand([
        'sync-setup',
        '--vault',
        OBSIDIAN_VAULT_NAME,
        '--path',
        OBSIDIAN_VAULT_PATH,
    ]);

    const configFlags: string[][] = [
        [
            '--device-name',
            DEVICE_NAME,
        ],
        [
            '--mode',
            SYNC_MODE,
        ],
        [
            '--conflict-strategy',
            CONFLICT_STRATEGY,
        ],
        [
            '--excluded-folders',
            EXCLUDED_FOLDERS,
        ],
        [
            '--configs',
            SYNCED_CONFIGS,
        ],
        [
            '--file-types',
            SYNCED_FILE_TYPES,
        ],
    ];

    for (const flags of configFlags) {
        await runObsidianCommand([
            'sync-config',
            '--path',
            OBSIDIAN_VAULT_PATH,
            ...flags,
        ]);
    }

    logger.info('✅ Vault sync configured');
}
