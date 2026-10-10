import { stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { isAlreadyExistsError } from 'senaev-utils/src/utils/Error/isAlreadyExistsError/isAlreadyExistsError';
import { isNotFoundError } from 'senaev-utils/src/utils/Error/isNotFoundError/isNotFoundError';
import { createFileExclusively, replaceFileAtomically } from 'senaev-utils/src/utils/fs/atomicFileWrite/atomicFileWrite';
import { createFileDiff, type FileDiff } from 'senaev-utils/src/toolServer/createFileDiff';
import { requiredNonEmptyString } from 'senaev-utils/src/toolServer/toolArguments';
import { invalidArguments, ToolError } from 'senaev-utils/src/toolServer/ToolError';

import { readVaultNotes, type VaultNotes } from '../access/readVaultNotes';
import {
    assertNotePath, normalizeVaultPath, prepareNewNote, resolveExistingNote,
} from '../access/vaultAccess';
import { extractLinks } from '../markdown/extractLinks';
import { createLinkIndex, resolveLink } from '../markdown/resolveLink';
import {
    applyTextEdits, pointsRelativelyAt, rewriteLinkTarget, type TextEdit,
} from '../markdown/rewriteLinkTarget';
import { readVaultToolArguments } from '../toolArguments';
import type { VaultToolsConfig } from '../vaultToolsConfig';

import { withNoteExtension } from './createTool';
import { createBacklinkPrefilter } from './linksTool';

const MAX_DIFF_CHARS_PER_RESPONSE = 30_000;
const MAX_REPORTED_SKIPPED_LINKS = 50;

type NoteUpdate = {
    /** The path of the note before the move. */
    source: string;
    /** The path after the move: differs from `source` only for the moved note. */
    target: string;
    before: string;
    after: string;
    rewrittenLinks: number;
};

type SkippedLink = {
    source: string;
    line: number;
    raw: string;
    /** `ambiguous` and `alias` links did not resolve to the note before the move either. */
    reason: 'ambiguous' | 'alias' | 'not_rewritable';
};

/**
 * Compares every link before and after the move: a link that resolved to a file and would
 * resolve to anything else afterwards is rewritten. This covers backlinks, the relative links
 * inside the moved note, and links that the new name would make ambiguous.
 */
function planLinkUpdates(notes: VaultNotes, path: string, newPath: string) {
    const rename = (file: string) => (file === path ? newPath : file);
    const indexBefore = createLinkIndex(notes.files, notes.aliasesByNote);
    const indexAfter = createLinkIndex(
        notes.files.map(rename),
        new Map([...notes.aliasesByNote].map(([
            note,
            aliases,
        ]) => [
            rename(note),
            aliases,
        ]))
    );
    const mayLinkToOldName = createBacklinkPrefilter(path, notes.aliasesByNote.get(path) ?? []);
    const mayLinkToNewName = createBacklinkPrefilter(newPath, []);
    const updates: NoteUpdate[] = [];
    const skippedLinks: SkippedLink[] = [];

    for (const [
        source,
        content,
    ] of notes.contents) {
        if (source !== path && !mayLinkToOldName(content) && !mayLinkToNewName(content)) {
            continue;
        }

        const target = rename(source);
        const edits: TextEdit[] = [];

        for (const link of extractLinks(content)) {
            const before = resolveLink(indexBefore, source, link);

            if (before.status === 'resolved') {
                const linkedPath = rename(before.path);
                const after = resolveLink(indexAfter, target, link);
                // The resolver also finds a Markdown link by name, as Obsidian does, but a
                // relative link that only works that way is broken everywhere else.
                const mustStayRelative = link.kind === 'markdown' && pointsRelativelyAt(source, link, before.path);
                const resolvesToLinkedPath = after.status === 'resolved' && after.path === linkedPath;
                const stillLinks = resolvesToLinkedPath && (!mustStayRelative || pointsRelativelyAt(target, link, linkedPath));

                if (stillLinks) {
                    continue;
                }

                const edit = rewriteLinkTarget(indexAfter, target, link, linkedPath);

                if (edit === null) {
                    skippedLinks.push({
                        source: target,
                        line: link.line,
                        raw: link.raw,
                        reason: 'not_rewritable',
                    });
                } else {
                    edits.push(edit);
                }
            } else if ((before.status === 'ambiguous' || before.status === 'alias') && before.candidates.includes(path)) {
                skippedLinks.push({
                    source: target,
                    line: link.line,
                    raw: link.raw,
                    reason: before.status,
                });
            }
        }

        const after = applyTextEdits(content, edits);

        if (source === path || after !== content) {
            updates.push({
                source,
                target,
                before: content,
                after,
                rewrittenLinks: edits.length,
            });
        }
    }

    return {
        updates,
        skippedLinks,
    };
}

/** An early, readable refusal; the exclusive create at the end is the race-free check. */
async function assertNothingAt(config: VaultToolsConfig, path: string): Promise<void> {
    try {
        await stat(join(config.root, path));
    } catch (error) {
        if (isNotFoundError(error)) {
            return;
        }

        throw error;
    }

    throw new ToolError('already_exists', `"${path}" already exists; choose another "newPath"`);
}

function collectDiffs(updates: readonly NoteUpdate[]) {
    const diffs: ({ path: string } & FileDiff)[] = [];
    const notesWithoutDiff: string[] = [];
    let remainingChars = MAX_DIFF_CHARS_PER_RESPONSE;

    for (const update of updates) {
        if (update.before === update.after) {
            continue;
        }

        const diff = createFileDiff(update.target, update.before, update.after);

        if (diff.diff.length <= remainingChars) {
            diffs.push({
                path: update.target,
                ...diff,
            });
            remainingChars -= diff.diff.length;
        } else {
            notesWithoutDiff.push(update.target);
        }
    }

    return {
        diffs,
        notesWithoutDiff,
    };
}

/**
 * Renames or moves a note and updates the links to it. The new file is written first and
 * the old one deleted last, so a failure in between leaves a duplicate, never a lost note.
 */
export async function moveTool(config: VaultToolsConfig, input: unknown) {
    const args = readVaultToolArguments(input, 'move');
    const path = normalizeVaultPath(requiredNonEmptyString(args, 'path'), 'path');
    const newPath = withNoteExtension(config, normalizeVaultPath(requiredNonEmptyString(args, 'newPath'), 'newPath'));

    if (newPath === path) {
        throw invalidArguments('"newPath" is the same as "path"');
    }

    const oldAbsolutePath = await resolveExistingNote(config, path);

    assertNotePath(config, newPath);
    await assertNothingAt(config, newPath);

    const notes = await readVaultNotes(config);
    const { updates, skippedLinks } = planLinkUpdates(notes, path, newPath);
    const movedNote = updates.find((update) => update.source === path);

    if (movedNote === undefined) {
        throw new Error(`Could not read "${path}"`);
    }

    const newAbsolutePath = await prepareNewNote(config, newPath);

    await createFileExclusively(newAbsolutePath, movedNote.after).catch((error: unknown) => {
        if (isAlreadyExistsError(error)) {
            throw new ToolError('already_exists', `"${newPath}" already exists; choose another "newPath"`);
        }

        throw error;
    });

    for (const update of updates) {
        if (update !== movedNote) {
            await replaceFileAtomically(join(config.root, update.source), update.after);
        }
    }

    await unlink(oldAbsolutePath);

    return {
        path,
        newPath,
        changedNotes: updates.filter((update) => update.before !== update.after).length,
        rewrittenLinks: updates.reduce((sum, update) => sum + update.rewrittenLinks, 0),
        ...collectDiffs(updates),
        skippedLinkCount: skippedLinks.length,
        skippedLinks: skippedLinks.slice(0, MAX_REPORTED_SKIPPED_LINKS),
        ...notes.scan,
    };
}
