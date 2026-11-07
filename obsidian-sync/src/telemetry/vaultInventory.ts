import { lstat, readdir } from 'node:fs/promises';
import {
    extname, join, relative, sep,
} from 'node:path';

/** Obsidian Sync does not sync hidden/trash/dependency files. Keep the report scoped to vault content. */
const EXCLUDED_DIR_NAMES = new Set([
    'plugins',
    'node_modules',
]);
const KNOWN_TYPES = new Set([
    'md',
    'csv',
    'json',
    'canvas',
    'pdf',
    'png',
    'jpg',
    'jpeg',
    'gif',
    'webp',
    'svg',
    'bmp',
    'heic',
    'mp3',
    'm4a',
    'wav',
    'ogg',
    'mp4',
    'mov',
    'webm',
    'txt',
    'html',
    'css',
    'js',
    'ts',
    'yaml',
    'yml',
    'xml',
    'zip',
    'xlsx',
    'xls',
    'doc',
    'docx',
    'pptx',
]);

export const OVERSIZE_THRESHOLD_BYTES = 4_500_000;

export type VaultFileStat = { path: string; bytes: number; type: string };
export type VaultInventory = {
    scannedAt: number;
    totalFiles: number;
    totalBytes: number;
    byType: Record<string, { files: number; bytes: number }>;
    largest: VaultFileStat | null;
    largestFiles: VaultFileStat[];
    /** Only present for authenticated per-file lookups; never exported as metrics. */
    files?: VaultFileStat[];
    oversizedFiles: number;
};

function fileType(name: string): string {
    const extension = extname(name).slice(1).toLowerCase();

    if (!extension) {
        return 'no_extension';
    }

    return KNOWN_TYPES.has(extension) ? extension : 'other';
}

/** Read metadata only. Never follow symbolic links, including directory links. */
export async function scanVaultInventory(root: string, includeFiles = false): Promise<VaultInventory> {
    const scanRoot = await lstat(root);

    if (!scanRoot.isDirectory() || scanRoot.isSymbolicLink()) {
        throw new Error('Vault root must be a real directory');
    }

    const result: VaultInventory = {
        scannedAt: Date.now() / 1000,
        totalFiles: 0,
        totalBytes: 0,
        byType: {},
        largest: null,
        largestFiles: [],
        oversizedFiles: 0,
        ...includeFiles ? { files: [] } : {},
    };
    const queue = [root];

    while (queue.length) {
        const folder = queue.pop()!;
        const entries = await readdir(folder, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.name.startsWith('.')) {
                continue;
            }

            if (entry.isDirectory() && EXCLUDED_DIR_NAMES.has(entry.name)) {
                continue;
            }

            // Dirent filters are only a fast precheck: lstat also ensures a changing
            // symlink cannot make us follow content outside the intended vault.
            if (entry.isSymbolicLink()) {
                continue;
            }

            const path = join(folder, entry.name);
            const meta = await lstat(path);

            if (meta.isSymbolicLink()) {
                continue;
            }

            if (meta.isDirectory()) {
                queue.push(path);
                continue;
            }

            if (!meta.isFile()) {
                continue;
            }

            const type = fileType(entry.name);
            const stat: VaultFileStat = {
                path: relative(root, path).split(sep).join('/'),
                bytes: meta.size,
                type,
            };
            const aggregate = result.byType[type] ?? {
                files: 0,
                bytes: 0,
            };

            aggregate.files++;
            aggregate.bytes += meta.size;
            result.byType[type] = aggregate;
            result.totalFiles++;
            result.totalBytes += meta.size;
            if (meta.size > OVERSIZE_THRESHOLD_BYTES) {
                result.oversizedFiles++;
            }

            result.files?.push(stat);
            result.largestFiles.push(stat);
            result.largestFiles.sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path));
            if (result.largestFiles.length > 10) {
                result.largestFiles.pop();
            }
        }
    }

    result.largest = result.largestFiles[0] ?? null;

    return result;
}

function escapeLabel(value: string): string {
    return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n');
}

/** At most one path label (the current largest file), never a series per file. */
export function renderVaultMetrics(inventory: VaultInventory): string {
    const lines = [
        '# HELP obsidian_vault_scan_success Whether the most recent inventory scan succeeded.',
        '# TYPE obsidian_vault_scan_success gauge',
        'obsidian_vault_scan_success 1',
        '# HELP obsidian_vault_last_scan_timestamp_seconds Time of the latest successful scan.',
        '# TYPE obsidian_vault_last_scan_timestamp_seconds gauge',
        `obsidian_vault_last_scan_timestamp_seconds ${inventory.scannedAt}`,
        '# HELP obsidian_vault_files_total Number of vault content files.',
        '# TYPE obsidian_vault_files_total gauge',
        `obsidian_vault_files_total ${inventory.totalFiles}`,
        '# HELP obsidian_vault_bytes_total Total bytes of vault content.',
        '# TYPE obsidian_vault_bytes_total gauge',
        `obsidian_vault_bytes_total ${inventory.totalBytes}`,
        '# HELP obsidian_vault_files_by_type Number of vault files grouped by extension.',
        '# TYPE obsidian_vault_files_by_type gauge',
        '# HELP obsidian_vault_bytes_by_type Bytes of vault files grouped by extension.',
        '# TYPE obsidian_vault_bytes_by_type gauge',
    ];

    for (const [
        type,
        group,
    ] of Object.entries(inventory.byType).sort(([a], [b]) => a.localeCompare(b))) {
        lines.push(`obsidian_vault_files_by_type{type="${type}"} ${group.files}`);
        lines.push(`obsidian_vault_bytes_by_type{type="${type}"} ${group.bytes}`);
    }

    lines.push(
        '# HELP obsidian_vault_largest_file_bytes Size of the largest vault file, labelled with its vault-relative path.',
        '# TYPE obsidian_vault_largest_file_bytes gauge'
    );
    if (inventory.largest) {
        lines.push(`obsidian_vault_largest_file_bytes{path="${escapeLabel(inventory.largest.path)}",type="${inventory.largest.type}"} ${inventory.largest.bytes}`);
    }

    lines.push(
        '# HELP obsidian_vault_oversized_files Files above the 4.5 MB early-warning threshold.',
        '# TYPE obsidian_vault_oversized_files gauge',
        `obsidian_vault_oversized_files ${inventory.oversizedFiles}`
    );

    return `${lines.join('\n')}\n`;
}
