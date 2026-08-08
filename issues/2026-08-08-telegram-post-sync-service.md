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
