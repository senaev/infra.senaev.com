import { stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { readOperationTextFile } from 'senaev-utils/src/toolServer/readOperationTextFile';
import { assertExpectedHash, hashContent } from 'senaev-utils/src/toolServer/contentHash';
import { createFileDiffAsync } from 'senaev-utils/src/toolServer/createFileDiffAsync';
import { withFileMutations } from 'senaev-utils/src/toolServer/withFileMutation';
import { isAlreadyExistsError } from 'senaev-utils/src/utils/Error/isAlreadyExistsError/isAlreadyExistsError';
import { isNotFoundError } from 'senaev-utils/src/utils/Error/isNotFoundError/isNotFoundError';
import { createFileExclusively, replaceFileAtomically } from 'senaev-utils/src/utils/fs/atomicFileWrite/atomicFileWrite';
import { type FileDiff } from 'senaev-utils/src/toolServer/createFileDiff';
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
import type { VaultToolsConfig } from '../vaultToolsConfig';

import { withNoteExtension } from './createCommand';
import { createBacklinkPrefilter } from './linksCommand';

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
async function planLinkUpdates(notes: VaultNotes, path: string, newPath: string, execution: CommandExecution) {
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
        await execution.checkpoint();
        if (source !== path && !mayLinkToOldName(content) && !mayLinkToNewName(content)) {
            continue;
        }

        const target = rename(source);
        const edits: TextEdit[] = [];

        for (const link of extractLinks(content)) {
            await execution.checkpoint();
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
async function assertNothingAt(config: VaultToolsConfig, path: string, execution: CommandExecution): Promise<void> {
    try {
        await stat(join(config.root, path));
    } catch (error) {
        execution.throwIfAborted();
        if (isNotFoundError(error)) {
            return;
        }

        throw error;
    }

    throw new ToolError('already_exists', `"${path}" already exists; choose another "newPath"`);
}

async function collectDiffs(updates: readonly NoteUpdate[], execution: CommandExecution) {
    const diffs: ({ path: string } & FileDiff)[] = [];
    const notesWithoutDiff: string[] = [];
    let remainingChars = MAX_DIFF_CHARS_PER_RESPONSE;

    for (const update of updates) {
        if (update.before === update.after) {
            continue;
        }

        const diff = await createFileDiffAsync(update.target, update.before, update.after, execution);

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

export type MoveCommandInput = {
    path: string;
    newPath: string;
};

/**
 * Renames or moves a note and updates the links to it. The new file is written first and
 * the old one deleted last, so a failure in between leaves a duplicate, never a lost note.
 */
export async function moveCommand(config: VaultToolsConfig, input: MoveCommandInput, execution: CommandExecution) {
    execution.throwIfAborted();
    const path = normalizeVaultPath(input.path, 'path');
    const newPath = withNoteExtension(config, normalizeVaultPath(input.newPath, 'newPath'));

    if (newPath === path) {
        throw invalidArguments('"newPath" is the same as "path"');
    }

    const oldAbsolutePath = await resolveExistingNote(config, path, execution);

    assertNotePath(config, newPath);
    await assertNothingAt(config, newPath, execution);

    const notes = await readVaultNotes(config, execution);
    const { updates, skippedLinks } = await planLinkUpdates(notes, path, newPath, execution);
    const movedNote = updates.find((update) => update.source === path);

    if (movedNote === undefined) {
        throw new Error(`Could not read "${path}"`);
    }

    return withFileMutations(updates.flatMap((update) => [
        join(config.root, update.source),
        join(config.root, update.target),
    ]), async () => {
        const diffResult = await collectDiffs(updates, execution);

        for (const update of updates) {
            assertExpectedHash(await readOperationTextFile(join(config.root, update.source), execution), hashContent(update.before), 'note');
        }

        const newAbsolutePath = await prepareNewNote(config, newPath, execution);

        await createFileExclusively(newAbsolutePath, movedNote.after, execution.signal, () => execution.changedPath(newPath)).catch((error: unknown) => {
            execution.throwIfAborted();
            if (isAlreadyExistsError(error)) {
                throw new ToolError('already_exists', `"${newPath}" already exists; choose another "newPath"`);
            }

            throw error;
        });

        for (const update of updates) {
            if (update !== movedNote) {
                await execution.checkpoint();
                const absolutePath = await resolveExistingNote(config, update.source, execution);

                assertExpectedHash(await readOperationTextFile(absolutePath, execution), hashContent(update.before), 'note');
                await replaceFileAtomically(absolutePath, update.after, execution.signal, () => execution.changedPath(update.source));
            }
        }

        await execution.checkpoint();
        assertExpectedHash(await readOperationTextFile(oldAbsolutePath, execution), hashContent(movedNote.before), 'note');
        await unlink(oldAbsolutePath);
        execution.changedPath(path);

        return {
            path,
            newPath,
            changedNotes: updates.filter((update) => update.before !== update.after).length,
            rewrittenLinks: updates.reduce((sum, update) => sum + update.rewrittenLinks, 0),
            ...diffResult,
            skippedLinkCount: skippedLinks.length,
            skippedLinks: skippedLinks.slice(0, MAX_REPORTED_SKIPPED_LINKS),
            ...notes.scan,
        };
    }, execution);
}

export type MoveCommandResult = Awaited<ReturnType<typeof moveCommand>>;
