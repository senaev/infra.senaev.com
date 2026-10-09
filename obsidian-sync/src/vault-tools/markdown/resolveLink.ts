import { posix } from 'node:path';

import type { ExtractedLink } from './extractLinks';

export type LinkResolution =
    | { status: 'resolved'; path: string }
    | { status: 'ambiguous'; candidates: string[] }
    /** Matches no file, only the frontmatter `aliases` of these notes, which Obsidian does not resolve. */
    | { status: 'alias'; candidates: string[] }
    | { status: 'unresolved' }
    | { status: 'external'; url: string };

export type LinkIndex = {
    byLowerPath: Map<string, string>;
    byLowerName: Map<string, string[]>;
    byLowerAlias: Map<string, string[]>;
};

function pushTo(map: Map<string, string[]>, key: string, value: string): void {
    const list = map.get(key);

    if (list === undefined) {
        map.set(key, [value]);
    } else if (!list.includes(value)) {
        list.push(value);
    }
}

/** Obsidian resolves links case-insensitively, so the index is keyed by lower case. */
export function createLinkIndex(files: readonly string[], aliasesByNote: ReadonlyMap<string, readonly string[]>): LinkIndex {
    const index: LinkIndex = {
        byLowerPath: new Map(),
        byLowerName: new Map(),
        byLowerAlias: new Map(),
    };

    for (const file of files) {
        index.byLowerPath.set(file.toLowerCase(), file);
        pushTo(index.byLowerName, posix.basename(file).toLowerCase(), file);
    }

    for (const [
        note,
        aliases,
    ] of aliasesByNote) {
        for (const alias of aliases) {
            pushTo(index.byLowerAlias, alias.toLowerCase(), note);
        }
    }

    return index;
}

/** `[[Note]]` means `Note.md`, while `[[image.png]]` or `[[Note.md]]` name the file directly. */
function fileNameForms(target: string): string[] {
    const lower = target.toLowerCase();

    return lower.endsWith('.md')
        ? [lower]
        : [
            lower,
            `${lower}.md`,
        ];
}

function fromCandidates(candidates: readonly string[] | undefined): LinkResolution | null {
    if (candidates === undefined || candidates.length === 0) {
        return null;
    }

    return candidates.length === 1
        ? {
            status: 'resolved',
            path: candidates[0] as string,
        }
        : {
            status: 'ambiguous',
            candidates: [...candidates].sort(),
        };
}

function resolveRelative(index: LinkIndex, sourcePath: string, target: string): LinkResolution | null {
    for (const form of fileNameForms(target)) {
        const joined = posix.normalize(posix.join(posix.dirname(sourcePath), form));
        const path = joined.startsWith('../') ? undefined : index.byLowerPath.get(joined);

        if (path !== undefined) {
            return {
                status: 'resolved',
                path,
            };
        }
    }

    return null;
}

function resolveLinkPath(index: LinkIndex, target: string): LinkResolution | null {
    const forms = fileNameForms(target.replace(/^\/+/, ''));

    if (!target.includes('/')) {
        for (const form of forms) {
            const resolution = fromCandidates(index.byLowerName.get(form));

            if (resolution !== null) {
                return resolution;
            }
        }

        return null;
    }

    for (const form of forms) {
        const exact = index.byLowerPath.get(form);

        if (exact !== undefined) {
            return {
                status: 'resolved',
                path: exact,
            };
        }
    }

    for (const form of forms) {
        const suffixMatches = [...index.byLowerPath.entries()]
            .filter(([lowerPath]) => lowerPath.endsWith(`/${form}`))
            .map(([
                , path,
            ]) => path);
        const resolution = fromCandidates(suffixMatches);

        if (resolution !== null) {
            return resolution;
        }
    }

    return null;
}

/**
 * Resolves a link the way Obsidian does where Obsidian is unambiguous, and reports every
 * other case instead of guessing: several files with the same name are `ambiguous`, a match
 * through frontmatter aliases only is `alias`, nothing at all is `unresolved`.
 */
export function resolveLink(index: LinkIndex, sourcePath: string, link: ExtractedLink): LinkResolution {
    if (link.externalUrl !== null) {
        return {
            status: 'external',
            url: link.externalUrl,
        };
    }

    if (link.target === '') {
        return {
            status: 'resolved',
            path: sourcePath,
        };
    }

    const isExplicitlyRelative = link.target.startsWith('./') || link.target.startsWith('../');

    // Markdown links are written relative to the note; wikilinks only when they say so.
    const relative = link.kind === 'markdown' || isExplicitlyRelative
        ? resolveRelative(index, sourcePath, link.target)
        : null;

    if (relative !== null) {
        return relative;
    }

    const byPath = isExplicitlyRelative ? null : resolveLinkPath(index, link.target);

    if (byPath !== null) {
        return byPath;
    }

    const aliasCandidates = index.byLowerAlias.get(link.target.toLowerCase());

    return aliasCandidates === undefined
        ? { status: 'unresolved' }
        : {
            status: 'alias',
            candidates: [...aliasCandidates].sort(),
        };
}
