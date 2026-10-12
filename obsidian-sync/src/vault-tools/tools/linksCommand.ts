import { posix } from 'node:path';

import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';

import { readVaultNotes } from '../access/readVaultNotes';
import { normalizeVaultPath, resolveExistingNote } from '../access/vaultAccess';
import { type ExtractedLink, extractLinks } from '../markdown/extractLinks';
import {
    createLinkIndex, type LinkIndex, type LinkResolution, resolveLink,
} from '../markdown/resolveLink';
import { getDiaryDate } from '../noteScope';
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

        // Any percent encoding or Markdown escape may spell the same target differently.
        // False positives cost a parse; false negatives lose backlinks during a move.
        return /%[0-9a-f]{2}|\\/.test(lower) || needles.some((needle) => lower.includes(needle));
    };
}

export type LinksCommandInput = {
    path: string;
    direction: 'outgoing' | 'backlinks' | 'both';
    offset: number;
    limit: number;
};

/**
 * Outgoing links and backlinks of one note. Backlinks are found by reading and parsing every
 * note on each call; there is no index to go stale.
 */
export async function linksCommand(config: VaultToolsConfig, input: LinksCommandInput, execution: CommandExecution) {
    execution.throwIfAborted();
    const path = normalizeVaultPath(input.path, 'path');
    const {
        direction, offset, limit,
    } = input;

    await resolveExistingNote(config, path, execution);

    const {
        files, contents, aliasesByNote, scan,
    } = await readVaultNotes(config, execution);
    const index = createLinkIndex(files, aliasesByNote);

    let outgoing: ReturnType<typeof describeLink>[] | null = null;

    if (direction !== 'backlinks') {
        outgoing = [];
        for (const [
            linkIndex,
            link,
        ] of extractLinks(contents.get(path) ?? '').entries()) {
            if (linkIndex % 128 === 0) {
                await execution.checkpoint();
            }

            outgoing.push(describeLink(link, resolveLink(index, path, link)));
        }
    }

    const found = direction === 'outgoing'
        ? null
        : await findBacklinks(index, contents, path, {
            aliases: aliasesByNote.get(path) ?? [],
            execution,
        });

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

async function findBacklinks(
    index: LinkIndex,
    contents: ReadonlyMap<string, string>,
    path: string,
    { aliases, execution }: { aliases: readonly string[]; execution: CommandExecution }
) {
    const isCandidate = createBacklinkPrefilter(path, aliases);
    const sources = new Map<string, { count: number; lines: number[] }>();
    const ambiguous: (Backlink & { candidates: string[] })[] = [];
    const viaAlias: (Backlink & { candidates: string[] })[] = [];

    for (const [
        source,
        content,
    ] of contents) {
        await execution.checkpoint();
        if (source === path || !isCandidate(content)) {
            continue;
        }

        for (const [
            linkIndex,
            link,
        ] of extractLinks(content).entries()) {
            if (linkIndex % 128 === 0) {
                await execution.checkpoint();
            }

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

export type LinksCommandResult = Awaited<ReturnType<typeof linksCommand>>;
