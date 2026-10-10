import { posix } from 'node:path';

import { LINKS_LIMITS } from 'senaev-utils/src/obsidianVaultTools/vaultToolLimits';
import {
    optionalCappedInteger, optionalEnum, requiredNonEmptyString,
} from 'senaev-utils/src/toolServer/toolArguments';

import { readVaultNotes } from '../access/readVaultNotes';
import { normalizeVaultPath, resolveExistingNote } from '../access/vaultAccess';
import { type ExtractedLink, extractLinks } from '../markdown/extractLinks';
import {
    createLinkIndex, type LinkIndex, type LinkResolution, resolveLink,
} from '../markdown/resolveLink';
import { getDiaryDate } from '../noteScope';
import { readVaultToolArguments } from '../toolArguments';
import type { VaultToolsConfig } from '../vaultToolsConfig';

const MAX_LINKS = 200;
const MAX_LINES_PER_SOURCE = 10;

/**
 * One entry per linking note rather than per link: a central note such as a person can have
 * thousands of backlinks, and "which notes link here" is the question anyway.
 */
type BacklinkSource = {
    source: string;
    diaryDate?: string;
    count: number;
    lines: number[];
};

type Backlink = {
    source: string;
    line: number;
    raw: string;
    kind: ExtractedLink['kind'];
    embed: boolean;
    subpath: ExtractedLink['subpath'];
};

function describeLink(link: ExtractedLink, resolution: LinkResolution) {
    return {
        kind: link.kind,
        embed: link.embed,
        raw: link.raw,
        line: link.line,
        target: link.target,
        subpath: link.subpath,
        displayText: link.displayText,
        resolution,
    };
}

function bounded<T>(items: T[]) {
    return {
        total: items.length,
        truncated: items.length > MAX_LINKS,
        items: items.slice(0, MAX_LINKS),
    };
}

/**
 * Any link that resolves to a note has to contain its file name somewhere: as written,
 * percent-encoded in a Markdown link, or as one of its aliases. Notes without any of these
 * are still read, but skipping their Markdown parse keeps a backlink scan fast.
 */
export function createBacklinkPrefilter(targetPath: string, aliases: readonly string[]): (content: string) => boolean {
    const name = posix.basename(targetPath, '.md');
    const needles = [
        name,
        encodeURIComponent(name),
        encodeURI(name),
        ...aliases,
    ].map((needle) => needle.toLowerCase());

    return (content) => {
        const lower = content.toLowerCase();

        return needles.some((needle) => lower.includes(needle));
    };
}

/**
 * Outgoing links and backlinks of one note. Backlinks are found by reading and parsing every
 * note on each call; there is no index to go stale.
 */
export async function linksTool(config: VaultToolsConfig, input: unknown) {
    const args = readVaultToolArguments(input, 'links');
    const path = normalizeVaultPath(requiredNonEmptyString(args, 'path'), 'path');
    const direction = optionalEnum(args, 'direction', [
        'outgoing',
        'backlinks',
        'both',
    ] as const) ?? 'both';
    const offset = optionalCappedInteger(args, 'offset', {
        min: 0,
        max: LINKS_LIMITS.maxOffset,
    }) ?? 0;
    const limit = optionalCappedInteger(args, 'limit', {
        min: 1,
        max: LINKS_LIMITS.maxLimit,
    }) ?? LINKS_LIMITS.defaultLimit;

    await resolveExistingNote(config, path);

    const {
        files, contents, aliasesByNote, scan,
    } = await readVaultNotes(config);
    const index = createLinkIndex(files, aliasesByNote);

    const outgoing = direction === 'backlinks'
        ? null
        : extractLinks(contents.get(path) ?? '').map((link) => describeLink(link, resolveLink(index, path, link)));
    const found = direction === 'outgoing'
        ? null
        : findBacklinks(index, contents, path, aliasesByNote.get(path) ?? []);

    // Fields of the direction that was not asked for are null, so the shape never changes.
    return {
        path,
        outgoing: outgoing === null ? null : bounded(outgoing),
        backlinks: found === null ? null : pageBacklinkSources(config, found.sources, offset, limit),
        ambiguousBacklinks: found === null ? null : bounded(found.ambiguous),
        aliasBacklinks: found === null ? null : bounded(found.viaAlias),
        ...scan,
    };
}

function pageBacklinkSources(
    config: VaultToolsConfig,
    sources: ReadonlyMap<string, { count: number; lines: number[] }>,
    offset: number,
    limit: number
) {
    const all = [...sources.entries()];
    const page = all.slice(offset, offset + limit).map(([
        source,
        { count, lines },
    ]): BacklinkSource => {
        const diaryDate = getDiaryDate(config, source);

        return {
            source,
            ...diaryDate !== null && { diaryDate },
            count,
            lines: lines.slice(0, MAX_LINES_PER_SOURCE),
        };
    });

    return {
        totalSources: all.length,
        totalLinks: all.reduce((sum, [
            , { count },
        ]) => sum + count, 0),
        offset,
        limit,
        nextOffset: offset + page.length < all.length ? offset + page.length : null,
        sources: page,
    };
}

function findBacklinks(
    index: LinkIndex,
    contents: ReadonlyMap<string, string>,
    path: string,
    aliases: readonly string[]
) {
    const isCandidate = createBacklinkPrefilter(path, aliases);
    const sources = new Map<string, { count: number; lines: number[] }>();
    const ambiguous: (Backlink & { candidates: string[] })[] = [];
    const viaAlias: (Backlink & { candidates: string[] })[] = [];

    for (const [
        source,
        content,
    ] of contents) {
        if (source === path || !isCandidate(content)) {
            continue;
        }

        for (const link of extractLinks(content)) {
            const resolution = resolveLink(index, source, link);
            const backlink: Backlink = {
                source,
                line: link.line,
                raw: link.raw,
                kind: link.kind,
                embed: link.embed,
                subpath: link.subpath,
            };

            if (resolution.status === 'resolved' && resolution.path === path) {
                const entry = sources.get(source) ?? {
                    count: 0,
                    lines: [],
                };

                entry.count += 1;
                entry.lines.push(link.line);
                sources.set(source, entry);
            } else if (resolution.status === 'ambiguous' && resolution.candidates.includes(path)) {
                ambiguous.push({
                    ...backlink,
                    candidates: resolution.candidates,
                });
            } else if (resolution.status === 'alias' && resolution.candidates.includes(path)) {
                viaAlias.push({
                    ...backlink,
                    candidates: resolution.candidates,
                });
            }
        }
    }

    return {
        sources,
        ambiguous,
        viaAlias,
    };
}
