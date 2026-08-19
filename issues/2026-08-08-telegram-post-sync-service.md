# 2026-08-08 — Telegram post sync service

> This file is the working log for this task. All design decisions, implementation steps,
> commands run, outputs pasted, blockers hit, and the eventual completion state must be
> appended to this file as we go — so the whole session lives in one place and is
> searchable later.
>
> Format: append new dated sections under ## Findings as work proceeds. Don't rewrite
> earlier sections — annotate them.

## Goal

Mirror selected Obsidian vault notes into existing Telegram channel posts. A note opts in
by declaring a `telegram-post-clone` frontmatter key pointing at the post it owns:

```markdown
---
aliases: []
telegram-post-clone: https://t.me/c/1728968094/85
---
# My Phones

Тинькофф Мобайл Россия
+79826990400
```

Whenever that note changes on disk, the bot rewrites the linked post so the channel always
reflects the note. Sync is one-directional (vault → Telegram); nothing is ever read back
from Telegram into the vault.

## Architecture

Everything lives inside the existing `obsidian-sync` container. It already has the vault on
a hostPath, already needs a file watcher, and can reach the Telegram API directly.

```
Obsidian Sync cloud
        │ ob sync --continuous (bidirectional)
        ▼
   /vault (hostPath)
        │ fs.watch(recursive)
        ▼
 telegram-post-sync  ──── render ────▶ editMessageText(rich_message)
   (in obsidian-sync)                          │
        │                                      ▼
        │                            Telegram channel post
        └──── on error ──▶ sendMessage ──▶ cluster chat
```

An earlier draft split this across `obsidian-sync` (a tracked-notes Map + SSE stream + a
content API) and `webhook-endpoint` (the Telegram client). That was rejected: it required
three new cross-service interfaces, an SSE client (Node 22 has no stable global
`EventSource`), and distributed state, to solve a problem that is entirely local to the
container that already holds the files. The only cost of collapsing it is passing
`TG_TOKEN_SENAEV_COM_BOT` into `obsidian-sync`.

## Verified API behaviour

Telegram **Rich Messages** (Bot API 10.1, 2026-06-11; media added in 10.2, 2026-07-14) are
what make this possible. Everything below was verified empirically against the real bot and
channel on 2026-08-08 with `~/tmp/tg-rich-test/test.ts` — the Bot API docs are silent or
self-contradictory on most of these points, so do not re-derive them from docs alone.

| Question | Verified answer |
|---|---|
| Can the bot edit a post it did not author? | **Yes** — `getChatMember` returns `status: administrator`, `can_edit_messages: true` |
| Is there an edit age limit? | No. The documented 48h limit applies only to *business* messages; the general 48h limit is for `deleteMessage`, not editing |
| Does `rich_message.markdown` render? | **Yes** — headings, lists, task items, block quotes and tables all parse into proper blocks |
| Does `tg://photo?id=` + `attach://` upload work? | **Yes** — despite the docs' "Media blocks support only HTTP and HTTPS URLs" note |
| Identical re-push? | Returns `message is not modified` |
| Identical re-push **with a re-uploaded image**? | Also returns `message is not modified` — Telegram dedupes server-side |

The last row is the important one: restart re-pushes are genuine no-ops even for notes with
images, so no state store and no `file_id` cache are needed for correctness.

Verbatim not-modified error, which the sync must swallow:

```
Bad Request: message is not modified: specified new message content and reply markup
are exactly the same as a current content and reply markup of the message
```

Verbatim proof that `tg://photo` becomes a real photo block (from `editMessageText`'s
returned `Message.rich_message`):

```json
{
  "blocks": [
    { "type": "heading", "text": "Photo probe 1786197394967", "size": 1 },
    {
      "type": "photo",
      "photo": [{
        "file_id": "AgACAgIAAxUHanc1JZ8ymFaEMwxBSeFr91gQ0DoAAlkcaxvDErlLZAyXHro7kJUBAAMCAANtAAM9BA",
        "file_unique_id": "AQADWRxrG8MSuUty", "file_size": 288, "width": 1, "height": 1
      }],
      "caption": { "text": "uploaded from disk" }
    }
  ]
}
```

**Rich Message limits** (verbatim from the API reference):

- Up to **32768 UTF-8 characters**
- Up to **500 blocks**, including nested blocks, list items, table rows
- Up to **16 levels** of nesting
- Up to **50 media attachments**
- Up to **20 columns** in a table

`InputRichMessage` requires that **exactly one** of `html`, `markdown` or `blocks` is used.
We use `markdown`, which the docs describe as "compatible with GitHub Flavored Markdown
where possible" — so Obsidian markdown largely passes through untouched and the render
pipeline is mostly a *stripper*, not a translator.

## Design decisions

| Decision | Choice | Rationale |
|---|---|---|
| Where it runs | Inside `obsidian-sync` | Vault, watcher and token all colocate; no cross-service interfaces |
| Change detection | `fs.watch(recursive)` on the vault | hostPath is a real local FS, so inotify sees writes from `ob sync`, from other pods, and from the host |
| Sync trigger | Instantly on change, no debounce | Explicitly requested |
| Duplicate events | Collapse *concurrent* pushes per file | One save fires 2–4 inotify events; this is correctness, not a delay |
| Idempotency | None — re-push everything on restart | Explicitly requested; safe because identical content returns `message is not modified` |
| Link format | Private only: `t.me/c/<internal>/<msg>` → `chat_id = -100<internal>` | Public `t.me/<username>/<id>` is out of scope |
| Images | `![[x.png]]` → `tg://photo?id=imgN` + multipart `attach://` upload | No public URL needed; `obsidian-sync` stays ClusterIP-only |
| Broken embed | Inline marker `❌BROKEN_EMBED❌(filename)❌` | Non-interrupting — the rest of the note still syncs |
| Wikilinks | Rendered as inline code | See below |
| Untracking | Stop tracking, leave the post untouched | No marker, no reaction, no alert |
| Truncation | Not implemented | Deferred; 32768 chars is far beyond current notes |
| Error reporting | Telegram message to the cluster chat | Matches existing convention |

### Why wikilinks become inline code

`[[@luli]]` flattened to plain `@luli` gets picked up by Telegram's automatic entity
detection and becomes a **live mention linking to whoever actually owns @luli** — verified
in the test run, which returned `{"type":"mention","text":"@luli","username":"luli"}`.

`skip_entity_detection` would suppress it but is all-or-nothing, and it would also kill the
`phone_number` entities that make a phone-list note genuinely useful (also verified:
`{"type":"phone_number","text":"+79826990400"}`).

Inline code solves both: Telegram does not run entity detection inside `code` spans, so
`` `@luli` `` stays literal while phone numbers outside code stay clickable. The alias
split follows `senaev.com`'s `replaceWikiLinksInTextWithRelativeLinks`:

```
[[@luli]]             ->  `@luli`
[[note|Display text]] ->  `Display text`
```

## Render pipeline

Applied in this order — order matters, because step 4 would otherwise match the `[[...]]`
inside an `![[...]]` embed.

1. **Strip frontmatter** — leading `---` block.
2. **Cut history** — first occurrence of `\n## [[YYYY-MM-DD]]` and everything after it is
   dropped. Notes accumulate dated history sections that should not reach the channel.
3. **Resolve image embeds** — `![[photo.png]]` (and `![[photo.png|300]]`) resolved by
   filename via the existing `findFileRecursively` search over the vault. Each resolved
   image becomes `![](tg://photo?id=imgN)` plus an `InputRichMessageMedia` entry uploaded as
   multipart `attach://`. Repeated references to the same file reuse one id. Anything that
   doesn't resolve, or isn't an image, becomes `❌BROKEN_EMBED❌(name)❌`.
4. **Wikilinks → inline code** — as described above.
5. **`ensureEmptyLineAfterTables`** — ported from `senaev.com`. Obsidian omits the blank
   line after a table; GFM parsers (and therefore, most likely, Rich Markdown) swallow the
   following paragraph into the table without it.

## Module layout

Follows the container's existing convention: one export per file, subdirectory per concern.

```
src/telegram/
  callTelegramApiWithFiles.ts     multipart-capable client (senaev-utils' is JSON-only)
  editTelegramRichMessage.ts      editMessageText + rich_message; not-modified + 429 handling
  reportSyncError.ts              log + cluster-chat alert, never throws

src/telegram-post-sync/
  startTelegramPostSync.ts        entry point: initial scan, then watch
  trackedNotes.ts                 Map<relativePath, { chatId, messageId, mtimeMs }>
  scanVaultForTrackedNotes.ts     initial recursive scan
  watchVaultForNoteChanges.ts     fs.watch(recursive) -> add / update / remove
  parseFrontmatter.ts             minimal single-line scalar reader (no YAML dep)
  parseTelegramPostLink.ts        t.me/c/<id>/<msg> -> { chatId, messageId }
  syncNoteToTelegramPost.ts       render + push one note, collapsing concurrent pushes
  render/
    renderNoteForTelegram.ts      orchestrates 1-5 above -> { markdown, media }
    stripFrontmatter.ts
    cutHistorySection.ts
    resolveImageEmbeds.ts
    replaceWikiLinksWithCode.ts
    ensureEmptyLineAfterTables.ts
```

## Implementation plan

- [x] `env.ts`: add `TG_TOKEN_SENAEV_COM_BOT` and `TG_CLUSTER_CHAT_ID`
- [x] `provisioning/helm/senaev-com/templates/obsidian-sync.yaml`: wire both from the
      `senaev-com-kv-secrets` secret
- [x] Render pipeline modules (steps 1–5)
- [x] Telegram client: multipart rich-message edit, swallow `message is not modified`,
      honour `429 retry_after`
- [x] Tracked-notes map, vault scan, watcher, sync orchestration
- [x] Wire `startTelegramPostSync()` into `src/index.ts` alongside `runVaultServer()`
- [x] Verify the render pipeline against the real `@senaev/My Phones.md`
- [x] `npm run typecheck`

## Known limitations / out of scope

- **Image-only changes don't trigger a re-sync.** The watcher only reacts to `.md` events,
  so editing an embedded image without touching the note leaves the post stale.
- **No truncation.** A note exceeding any of the five Rich Message limits will fail the
  Telegram call and surface as a cluster-chat alert rather than being trimmed.
- **Public channel links unsupported** — only `t.me/c/<internal>/<msg>`.
- **inotify watch budget.** Recursive watch adds one watch per directory under the vault,
  against a per-uid `fs.inotify.max_user_watches`. If the vault ever contains a large
  `node_modules`, this can exhaust the budget; the watcher logs a clear error if it does.
- **Images re-upload on every push.** Harmless (Telegram dedupes, so the message is still
  "not modified") but wasteful. A `file_id` cache harvested from the edit response would fix
  it; deliberately deferred since it isn't needed for correctness.
- **No auth on the container's HTTP API** — unchanged, still ClusterIP-only.

## Findings

### 2026-08-08 — Implementation complete, render pipeline verified locally

All modules written as planned; `npx tsc --noEmit` passes. Two deviations from the plan,
both noted inline in the code:

- `ignoredPaths.ts` was added (not in the planned layout) so the scanner and the watcher
  share one definition of which directories to skip.
- GIFs are treated as broken embeds rather than photos. Telegram classifies them as
  animations, and declaring one as `type: "photo"` risks failing the whole `editMessageText`
  call — which would take the entire note down with it. A local marker keeps the failure
  contained to the one embed.

Verified against the real `../obsidian-vault/@senaev/My Phones.md`:

```
=== TRACKING ===
{ chatId: '-1001728968094', messageId: 85,
  relativePath: '@senaev/My Phones.md', mtimeMs: 1786193207605.2917 }

=== MARKDOWN (264 chars) ===
# My Phones

Тинькофф Мобайл Россия
+79826990400

Yettel Serbia
+381637547648

`@luli` A1 Serbia
+381601524974
...
Temporary Spanish numbers for prepaid SIM card
Andrei +34 662360996
Julia +34 662316993
```

Frontmatter stripped, link parsed to the right `-100`-prefixed chat id, `[[@luli]]` rendered
as inline code, and the note correctly truncated at `## [[2025-11-07]]` — the Beeline /
Magti / Мотив history blocks are all absent.

Edge cases exercised against a synthetic fixture:

```
=== MEDIA ===
[ { id: 'img0', absolutePath: '/tmp/rv/sub/real.png' } ]

Embed ok: ![](tg://photo?id=img0)
Sized:    ![](tg://photo?id=img0)
Dup:      ![](tg://photo?id=img0)
Missing:  ❌BROKEN_EMBED❌(nope.png)❌
Not img:  ❌BROKEN_EMBED❌(some note)❌
Gif:      ❌BROKEN_EMBED❌(anim.gif)❌

Links: `@luli` and `Display Text` and `b|c`

| H1 | H2 |
|:---|---:|
| a  | b  |

Paragraph glued to the table
=== CONTAINS HISTORY: false
```

Three references to the same image (including the `|300` sized form and a path-qualified
form) collapse to a single upload, which matters against the 50-media cap.
`ensureEmptyLineAfterTables` correctly separated the glued paragraph. Both dated history
headings were removed, confirming the cut takes the *first* match.

Link parsing:

```
https://t.me/c/1728968094/85    -> {"chatId":"-1001728968094","messageId":85}
https://t.me/c/1728968094/85/   -> {"chatId":"-1001728968094","messageId":85}
https://t.me/senaevchannel/85   -> null
https://t.me/c/1728968094/12/85 -> null
garbage                         -> null
```

Public links and 3-segment forum-topic links are rejected as designed; an unparseable link
logs a warning and leaves the note untracked rather than failing the scan.

**Not yet done:** nothing committed, and the service has not run against the live channel.
The first real deploy will push `My Phones.md` to post 85, overwriting whatever is there
now — that post's current content is unrecoverable, since the Bot API has no `getMessage`.

### 2026-08-08 — Added provisioned marker and alias header

Two additions to the render pipeline, applied after the existing steps:

- `markTitleAsProvisioned` prefixes the note's first heading with 🪨 so a post is
  recognisable as vault-generated. Notes with no heading at all get 🪨 as a standalone line
  rather than silently losing the marker.
- `prependAliases` puts frontmatter `aliases` on one line above everything, separated by
  ` • `, followed by a divider — so aliases are reachable by Telegram's text search even
  when they don't appear in the note body.

Custom (premium/animated) emoji were considered and rejected. They exist in rich markdown as
`![](tg://emoji?id=<id>)`, but the API states custom emoji entities require either a
Fragment-purchased bot username, or a Premium bot owner **and** a private/group/supergroup
chat. Channels are absent from that second clause, so a channel post can't use them without
a Fragment purchase. A standard Unicode emoji avoids the issue entirely.

`<hr/>` is used for the divider instead of `---` because markdown reads a text line followed
by `---` as a setext heading, which would have turned the alias line into an H2 instead of
drawing a rule. `<hr/>` is a supported rich-message tag mapping to `InputRichBlockDivider`.

Rendering the example note from the request:

```
=== SYRNIKI ===
Сырники

<hr/>

# 🪨 Syrniki 🍳

Cottage cheese pancakes.
```

Other shapes:

```
=== TWO ALIASES + key after list ===
Сырники • Cheese Pancakes

<hr/>

# 🪨 Title
body

=== NO ALIASES (My Phones shape) ===
# 🪨 My Phones

+7999

=== NO HEADING ===
Solo

<hr/>

🪨

just text
```

The alias list parser handles every YAML shape Obsidian writes, and correctly stops at the
next frontmatter key rather than swallowing it:

```
"aliases: []"                                      -> []
"aliases: [a, b]"                                  -> ["a","b"]
"aliases:\n  - \"Quoted\"\n  - Second\nother: x"   -> ["Quoted","Second"]
"aliases: Single"                                  -> ["Single"]
"nothing: 1"                                       -> []
```

`npx tsc --noEmit` passes. Note that this change makes the next push a genuine edit to every
tracked post rather than a `message is not modified` no-op, since the rendered content now
differs.

### 2026-08-08 — Reworked aliases into sibling headings

Superseded the previous alias treatment: `prependAliases` (alias line above the title + an
`<hr/>` divider) was deleted in favour of `appendAliasesToTitle`, which renders each alias as
its own heading directly beneath the title, at the same heading level. The divider is gone
entirely.

`markTitleAsProvisioned` changed accordingly — a note with no heading now gets a synthesized
`# 🪨` heading rather than a bare `🪨` line, which gives the alias step a guaranteed anchor
and removes an ordering edge case.

```
=== SYRNIKI (1 alias) ===
# 🪨 Syrniki 🍳
# Сырники

Cottage cheese pancakes.

=== TWO ALIASES ===
# 🪨 Syrniki 🍳
# Сырники
# Cheese Pancakes

Body text.

=== NO ALIASES (My Phones) ===
# 🪨 My Phones

+79826990400

=== H2 TITLE ===
## 🪨 Sub Title
## Alias

text

=== NO HEADING ===
# 🪨
# Solo

just text
```

Alias headings inherit the title's level, so an H2-titled note gets H2 aliases rather than
being promoted to H1.

`<sup>` was considered for rendering aliases as small text and is genuinely available — it's
in the supported rich-message HTML tag list — so switching to
`# 🪨 Title <sup>alias</sup>` later is a one-line change if stacked headings look too heavy
in the client.

### 2026-08-08 — Aliases folded into the title line

Stacked headings were too heavy. `appendAliasesToTitle` now appends aliases onto the existing
title line, separated by ` • `, instead of emitting one heading per alias. No extra headings
are produced.

```
=== SYRNIKI (1 alias) ===
# 🪨 Syrniki 🍳 • Сырники

Cottage cheese pancakes.

=== TWO ALIASES ===
# 🪨 Syrniki 🍳 • Сырники • Cheese Pancakes

Body text.

=== NO ALIASES (My Phones) ===
# 🪨 My Phones

+79826990400

=== H2 TITLE ===
## 🪨 Sub Title • Alias

text

=== NO HEADING ===
# 🪨 • Solo

just text
```

The separator is U+2022 BULLET, not an emoji codepoint.

### 2026-08-08 — Publish new posts from a channel-only link

`telegram-post-clone` now also accepts a channel link with no message id:

```yaml
telegram-post-clone: https://t.me/c/3951655027
```

The sync publishes a new post via `sendRichMessage`, then **writes the resulting post link
back into the note's own frontmatter**, after which the note behaves like any other tracked
note. Because Obsidian Sync is bidirectional, the filled-in link propagates to other devices.

This is the first time obsidian-sync writes to a note the user authored, and it needed care
because `sendRichMessage` — unlike `editMessageText` — is **not idempotent**. Every call
creates another post, so the no-state-store design does not protect this path. Three
safeguards:

1. `writePostLinkToFrontmatter` re-reads the file immediately before writing, touches only
   the one frontmatter line, and swaps the result in via an atomic rename, so a crash can't
   leave a half-written note. The temp file is dot-prefixed and not `.md`, so neither
   Obsidian nor our own watcher reacts to it.
2. It throws if the value it wrote doesn't parse back as a post link.
3. `publishedInThisProcess` — an in-memory guard in `syncNoteToTelegramPost`. If the
   write-back ever fails, the next filesystem event is refused rather than publishing a
   second post. Damage is bounded to one orphan per container lifetime.

The unavoidable hole remains: if the container dies between `sendRichMessage` returning and
the frontmatter write landing, the post exists and nothing points at it. The error message
includes the full post link so it can be pasted in by hand — it cannot be recovered from the
Bot API, which has no `getMessage`.

Also refactored: `callRichMessageMethod` now holds the multipart body construction,
`message is not modified` detection and 429 retry logic, shared by
`editTelegramRichMessage` and the new `createTelegramRichMessage`.

Verified locally against a temp vault, no Telegram calls:

```
=== LINK PARSING ===
https://t.me/c/3951655027        -> {"kind":"channel","chatId":"-1003951655027"}
https://t.me/c/3951655027/       -> {"kind":"channel","chatId":"-1003951655027"}
https://t.me/c/1728968094/85     -> {"kind":"post","chatId":"-1001728968094","messageId":85}
https://t.me/senaevchannel       -> null
https://t.me/c/abc               -> null

=== BEFORE ===
{ kind: 'channel', chatId: '-1003951655027' }

=== FILE AFTER WRITE ===
---
telegram-post-clone: https://t.me/c/3951655027/14
aliases:
  - Сырники
---
# Syrniki 🍳

Cottage cheese pancakes.

=== AFTER ===
{ kind: 'post', chatId: '-1003951655027', messageId: 14 }
```

Aliases and body are untouched, and no temp file is left behind.

### 2026-08-08 — Mirroring one note into several posts

`telegram-post-clone` now accepts a list, in any of the three YAML shapes Obsidian writes:

```yaml
telegram-post-clone:
  - https://t.me/c/111/1        # existing post, rewritten in place
  - https://t.me/c/222          # channel, published into then filled in
```

Targets are independent mirrors. Each is pushed in turn, failures are collected rather than
thrown immediately, and the run reports them together at the end — one dead channel must not
strand the other mirrors.

Reading needed no new parsing: `readFrontmatterList`, already used for aliases, handles the
scalar, inline-list and block-list shapes. It and the write-back now share
`unquoteFrontmatterItem`, which matters more than it looks — write-back locates the item to
replace by comparing against the value the reader produced, so if the two ever disagreed
about quoting, write-back would silently fail to find a link it had *just published a post
for*.

Two silent failure modes found and fixed while here. A block list under the tracking key
used to return `null` from `readFrontmatterValue`, indistinguishable from an absent key, so
the note was skipped with no log line at all. A repeated key silently dropped all but the
first. Both now warn, as does a key whose links are all unparseable. An unparseable link
among good ones is skipped rather than failing the note.

**Write-back matches on link text, not position.** A positional index looks simpler but is
wrong: if a publish succeeds and the write-back fails, and the user then prepends a link,
index 0 now refers to a different entry — the guard would block the new link and *permit a
duplicate publish* of the orphaned one. Matching on text is stable under reordering. The
same reasoning applies to `publishedInThisProcess`, keyed by `relativePath` + original link.

Only the first matching item is replaced, so listing the same channel twice publishes two
posts across two runs rather than losing one.

Verified locally against a temp vault, no Telegram calls:

| Case | Result |
|---|---|
| scalar channel-only | `telegram-post-clone: https://t.me/c/222/14` |
| block list, post + channel | only the channel item rewritten, `aliases` untouched |
| inline list | `[https://t.me/c/111/1, https://t.me/c/222/14]` |
| quoted value | unquoted on write, matched correctly |
| channel + its own post in one list | correct item replaced, no prefix collision |
| same channel twice | first replaced, second left for the next run |
| one bad link among good | warned, good link still synced |
| all links bad | warned, note not tracked |
| duplicate keys | warned |
| link vanished before write-back | throws, file left intact |

The prefix case is the one worth calling out: `https://t.me/c/222` is a strict prefix of
`https://t.me/c/222/14`, so a naive substring replace would corrupt the note. Matching is per
frontmatter item, not per substring.

### 2026-08-09 — Edits stopped reaching Telegram: the write-back was killing its own watch

Reported symptom: a note created in the vault root published its post, then several edits to
it never reached Telegram, and the moment the note was moved into a subfolder the accumulated
changes appeared. Pod logs showed `ob sync` downloading and accepting the file each time — so
the container's copy on disk was current, and the watcher simply never reported it.

Three wrong guesses, each disproved in a `node:22-alpine` container against a real filesystem:
recursive watching of nested directories works; non-ASCII filenames work; a directory that is
deleted and recreated gets re-watched. The vault has only ~370 directories, far below any
`fs.inotify.max_user_watches` limit, so exhaustion was out too.

The actual rule, isolated by varying one factor at a time:

| Scenario | Subsequent in-place edits |
|---|---|
| file created, then edited | reported |
| file in a subdirectory, then edited | reported |
| file **replaced by renaming another file over it**, then edited | **silent, permanently** |
| same, but in a subdirectory | **silent, permanently** |
| file moved to a new path, then edited | reported |

So it is not about the vault root and not about nesting: replacing a file through a rename
detaches the watch from that path. The rename itself is reported — as a `change` event, not a
`rename` one, so it cannot even be detected and reacted to — and every in-place write after it
is lost for good.

That makes this self-inflicted. `replaceTrackingLinkInFrontmatter` writes a temp file and
renames it over the note, which is exactly the poisoning operation. The sequence was:

1. note created with a channel-only link → create event → post published
2. post link written back → **rename over the note → watch detached**
3. every later edit applied in place by `ob sync` → silent
4. note moved → new path, fresh watch → the move fired and pushed the accumulated content

Moving it "fixed" it only by accident. Note also that every post update observed on 2026-08-08
came right after a rollout, and startup re-pushes every tracked note — so a broken watcher and
a working one had looked identical until now.

Two fixes, because they cover different failures:

**`rearmVaultWatcher()`** — closes and rebuilds the watch, called right after a successful
write-back. Verified: poisoned path goes silent, rebuilding restores events. This keeps pushes
instant for the notes that were just published, which is precisely the set that was broken.

**`reconcileTrackedNotes()`** — every 60s, re-reads the vault and pushes any tracked note whose
mtime moved since its last push. The watcher gives latency, this gives the guarantee: events
lost during a rebuild, or to any future cause, cost at most a minute of staleness instead of
being lost until the next deploy. Verified against a temp vault with the push stubbed:

| Case | Result |
|---|---|
| nothing changed | no push |
| in-place edit of a tracked note | pushed once |
| mtime recorded by the push | no repeat |
| untracked note gains the key | discovered and pushed |
| tracking key removed | dropped, no push, post left alone |

The watcher now also rebuilds itself after a non-ENOSPC error instead of logging and dying.

Deliberately not retried by reconcile: a note whose push *failed*. The failed push still
records the new mtime, so reconcile treats it as done. Retrying a permanently broken note
every 60s would turn one failure into an endless stream of Telegram error messages — and a
publish that succeeded but failed its write-back would hit the duplicate guard on every pass.
Editing the note retries it.

Two costs accepted: reconcile reads every markdown file in the vault each pass, which is
negligible at this size but would need an mtime short-circuit for a much larger vault; and a
publish now triggers one extra no-op edit on the next pass, because the write-back moves the
file's mtime past the value recorded during the push. Telegram answers that with "message is
not modified".

### 2026-08-09 — Obsidian Sync can revert the write-back, and the guard made that fatal

First live publish after the watcher fix, from the pod logs:

1. `Паспорт РФ.md` arrives with a channel-only link, 36 characters
2. post 97 published, link written back, watch rebuilt — all correct
3. `ob sync` uploads our write-back, then immediately downloads the note again
4. next push shows `targets: ["https://t.me/c/1728968094"]` and 55 characters

The channel-only link is back. The device had the note open and edited it from a base that
predated the write-back, so Obsidian Sync resolved the conflict in the device's favour and
reverted our frontmatter change. This is not a rare race: typing a new note live while the
container publishes it is the normal way these notes get created.

The guard then refused to publish a second post — correct in itself, but it only remembered
*that* it had published, not *what*, so the note was stuck erroring on every subsequent edit
with no way forward but manual repair.

Fixed by keying the guard to the message id rather than a bare flag. A note that still points
at a bare channel after we have published for it now reuses that post: it is edited with the
current content and the write-back is retried. The note converges as soon as the device stops
overwriting it, and no duplicate is ever created.

The remaining hole is restarts. The guard lives in the process, so if the write-back is
reverted and the pod restarts before it succeeds, the note still points at a bare channel and
a duplicate post gets published. Deploys make this concrete: any note left in the reverted
state at rollout time will produce a second post. Closing it properly needs the published ids
to outlive the process, which contradicts the original "no state store" decision — worth
revisiting now that the revert is known to happen in practice rather than in theory.

### 2026-08-09 — Skipping unchanged notes with a content fingerprint

Every push previously ended in a Telegram call, and every pod restart re-sent every tracked
note, relying on "message is not modified" to make it a no-op. That is what let a dead watcher
look identical to a working one for two days. A `telegram-post-clone-hash` key in the note's
frontmatter now records what was last pushed, and a note whose fingerprint still matches is
skipped without talking to Telegram at all.

**The fingerprint covers the rendered output, not the raw note.** This is what makes it safe to
store in the note's own frontmatter: frontmatter is stripped before rendering, so writing the
hash back cannot change the value the hash is taken over. Hashing raw content would be
self-referential.

**The clone links are part of it.** Otherwise adding a mirror to a note that is never edited
again would be skipped forever and its post would never be created. They are sorted, so merely
reordering the list does not force a resend.

**The recorded value is computed from the links the content landed on**, not the ones read
before pushing. The two differ whenever a channel-only link has just become a post link, and
recording the earlier value would look stale immediately, costing one wasted push per publish.

**The hash is written only when every target succeeded.** A partial failure records nothing, so
the next event retries rather than mistaking the note for one that is up to date.

`telegram-post-clone` is a strict prefix of `telegram-post-clone-hash`, which is the same shape
as the link-matching hazard from earlier today. It is already neutralised: every lookup of
either key includes the trailing colon, so neither matches the other's line. Verified rather
than assumed.

Both writers now share `updateNoteFrontmatter`, which re-reads the note, proves the frontmatter
block exists, hands the lines to a rewrite, and swaps the result in atomically. The hash key is
appended as the block's last line when absent, since inserting anywhere else could land between
a key and the list items belonging to it.

Watch rebuilds are down to exactly one per push, in a `finally` keyed off whether a note was
actually rewritten. The first attempt rebuilt twice on the publish path — once after the link
write-back and once after the hash — and would have skipped the rebuild entirely when a later
target failed after an earlier one had already rewritten the note.

Verified against a temp vault with Telegram stubbed:

| Case | Result |
|---|---|
| hash key present alongside the tracking key | both read correctly, no prefix collision |
| first push | sent, hash recorded, one watch rebuild |
| nothing changed | no Telegram call, no write, no rebuild |
| body edited | sent, hash changed |
| mirror added, body untouched | both targets pushed |
| mirrors reordered only | no resend |
| push failed | no hash recorded, retried and sent after recovery |
| channel-only link | published, link written back, converged with no second push |

The cost, accepted deliberately over keeping this in a state file outside the vault: every
content change now rewrites the note, which means one extra sync upload, one extra watcher
event and one watch rebuild per edit. Events are lost during a rebuild, so a save landing in
that window falls to the reconcile pass and its 60s latency.

### 2026-08-09 — Dropped rearmVaultWatcher, reconcile every 15s instead

`rearmVaultWatcher` was added earlier today when it was the only thing standing between a
rename-poisoned watch and a note that would never sync again. `reconcileTrackedNotes` landed
minutes later and covers that failure completely, which quietly demoted the rebuild from a
correctness mechanism to a latency optimisation — worth roughly 1s instead of 60s.

That trade stopped being worth it once the content hash moved into frontmatter, because the
hash is written on every content change rather than once per note. So a full teardown and
rebuild of the watch across ~370 directories went from rare to routine, each one with a window
where events are dropped — a small hole that reconcile then has to cover anyway.

Removed, and the reconcile interval tightened from 60s to 15s to absorb the latency. Net effect:
one moving part fewer, no blind window, and the worst case for a note this service has written
to goes from ~1s to ~15s.

Worth being explicit about what the watcher is now for, because it is easy to misread the code:
it only ever reports the *first* change to each mirrored note. As soon as that note gets a post
link or a hash written into it, the rename detaches its watch for good and every later edit
arrives silently. Reconcile is not a safety net for the watcher — for mirrored notes it is the
mechanism, and the watcher is what makes the very first push fast.

The removal changed no behaviour in the hash test suite: all ten cases still pass, including
the channel-only publish converging without a second push.
