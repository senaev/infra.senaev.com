# 2026-10-10 — Obsidian MCP: tool to rename and move notes

## Goal

Add the vault tool `move` (`obsidian-move` in ChatGPT): rename a note or move it to another
folder, and update the links to it, the way Obsidian does.

Decisions (from the user):

- The tool updates links in other notes, like Obsidian.
- Only notes (`.md`) can be moved. No attachments, no folders.

## Plan

- `senaev-utils/src/obsidianVaultTools/vaultToolDefinitions.ts`: definition `move` with
  `path` and `newPath`. Destructive, because it changes other notes.
- `obsidian-sync/src/vault-tools/tools/moveTool.ts`:
  1. Read all notes and build the link index before and after the move.
  2. For each link in each candidate note (and every link in the moved note), resolve it
     before the move and after the move. If the target before the move was resolved, and
     after the move the link does not resolve to the same (maybe moved) file, rewrite it.
     This covers the backlinks, the relative Markdown links from the moved note, and links
     to another note with the same name that the move makes ambiguous.
  3. A rewritten wikilink gets the shortest form that resolves: the name, else the full
     path. The `#heading`, `|display text` and `!` embed stay. A Markdown link gets the
     relative path from its note, percent-encoded.
  4. Write: create the new file (fails if it exists), update the other notes, then delete
     the old file. A crash in the middle leaves a duplicate, not a lost note.
- The result has the diff of every changed note, and the links that it did not update
  (ambiguous before the move, or alias-only), so the user can fix them.

## Findings

### 2026-10-10 — Implemented

- `move` definition in senaev-utils; `moveTool.ts` in obsidian-sync; link rewriting in
  `markdown/rewriteLinkTarget.ts`. `ExtractedLink` now has `offset`, so an edit changes only
  the target part of a link. `links` and `move` read the vault with the new
  `access/readVaultNotes.ts`.
- The resolver also finds a Markdown link by name, as Obsidian does. So after a move,
  `[b](Plan.md)` still "resolved" while the relative path was broken. Rule added: a Markdown
  link that was relative before the move must be relative after it too.
- Tests (`moveTool.test.ts`): rename with heading, block, display text, embed and a table
  link; a folder move that keeps `[[Name]]` and fixes relative Markdown links (with `%20`
  and `%28`); a new name that makes another note ambiguous; ambiguous and alias-only links
  are reported, not changed; no overwrite; only notes. `npm run simple-checks` passes.
