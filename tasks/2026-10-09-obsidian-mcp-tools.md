# 2026-10-09 — Obsidian vault tools for the ChatGPT MCP connector

> This file is the working log for this task. All design decisions, implementation steps,
> commands run, outputs pasted, blockers hit, and the eventual completion state must be
> appended to this file as we go — so the whole session lives in one place and is
> searchable later.
>
> Format: append new dated sections under ## Findings as work proceeds. Don't rewrite
> earlier sections — annotate them.

## Goal

Let ChatGPT find, read, link-explore, create and edit notes in the Obsidian vault through
the existing MCP endpoint (`https://<MCP_DOMAIN>/chat-gpt`, OAuth). Intended workflows:
find notes about a topic, summarise diary entries in a date range, explore links, analyse
recurring diary themes with references, create notes and make targeted edits.
Summarisation happens in ChatGPT; the containers only return data.

## Architecture

```
ChatGPT ──OAuth──▶ cluster-helper (public :3000, /chat-gpt)
                     │  tool definitions (names, descriptions, input schemas)
                     │  obsidian-<x> call ──▶ POST /vault/<x>   (Bearer internal token)
                     ▼
                  obsidian-sync (:8080, ClusterIP)
                     │  validates arguments, applies access rules, does all vault work
                     ▼
                  /vault (hostPath, kept in sync by `ob sync --continuous`)
```

- cluster-helper holds the tool definitions, so `tools/list` works when obsidian-sync is
  down. It forwards the arguments unchanged and maps the reply to an MCP tool result. It has
  no vault logic.
- obsidian-sync must validate every argument itself. If the two packages drift apart,
  ChatGPT gets a clear validation error.
- `INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_OBSIDIAN` (Vault `senaev-com-kv`) is sent by
  cluster-helper on every call and checked by obsidian-sync on every route, except the
  `?note=` / `?file=` routes. nextjs-app (senaev.com repo) uses those without a token, and
  they serve only `<vault>/public`, which is published anyway. A short gap during the
  rollout (obsidian-sync enforces before the new cluster-helper runs) is accepted.

## Vault facts (checked 2026-10-09 on a local copy)

- 3,622 eligible `.md` files, about 7 MB. Note sizes: p50 0.5 KB, p90 3.5 KB, p99 21 KB,
  max 183 KB. A full scan per request is cheap: no index, no ripgrep.
- Diary: `periodic/day/YYYY-MM-DD.md`, 886 entries, about 2 MB, 2.3 KB average.
  One year is about 800 KB, which does not fit in one ChatGPT context: the tool
  descriptions tell ChatGPT to summarise long ranges in parts.

## Decisions

- Tool names: `obsidian-list`, `obsidian-search`, `obsidian-read`, `obsidian-links`,
  `obsidian-create`, `obsidian-patch` (OpenAI function names allow `[a-zA-Z0-9_-]`, no dots).
- One configuration module in obsidian-sync (`src/vault-tools/vaultToolsConfig.ts`): vault
  root, eligible extension `.md`, excluded folders `.obsidian`, `.trash`, `.git`, `plugins`,
  `node_modules` at any depth, every dot-prefixed file or folder, `*.excalidraw.md`, diary
  location, limits. Excluded means invisible to all tools, for reads and writes.
- Symlinks are never followed: the walk skips them, and a path whose real path differs
  from the expected one is rejected.
- Search: literal, case-insensitive queries (up to 20), `match: any | all`, optional whole
  word, file names are matched too, results grouped by file. No user regex.
- Read: full content, nothing removed. Budget 20,000 characters per note and 30,000 per
  response. A paths read returns `remainingPaths`, a diary range read returns `nextFrom`.
- Links: wikilinks, embeds, Markdown links, headings and block references are parsed;
  heading/block existence is not checked. Ambiguous and unresolved targets are reported,
  never guessed. A target that matches only a frontmatter `aliases` entry is reported as
  `alias`.
- Patch: every operation requires `expectedHash` (SHA-256 of the file). Writes go through
  a temp file and rename. No locking: concurrent edits are rare, and the hash check
  covers the normal case.
- Create: fails if the file exists (temp file + `link()`), creates missing parent folders,
  `.md` only.
- The vault archive rule (do not modify content under a dated archive heading) is only in
  the tool description, not enforced in code.
- `save_diary_text` stays unchanged.

## Findings

*(append results below)*

### 2026-10-09 — Implementation

- Per-tool response limits live in each tool file, not in `vaultToolsConfig.ts`, which keeps
  only what all tools share (root, extension, exclusions, diary folder).
- Dependencies (obsidian-sync): `unified`, `remark-parse`, `remark-gfm`, `remark-frontmatter`
  (ESM-only; `require()` of ESM works with TypeScript 5.9 `nodenext` and tsx), `picomatch`
  4.0.7 (4.0.3 has GHSA-3v7f-55p6-f55p and GHSA-c2c7-rcm5-vvqj; extglobs are also turned
  off). No `fast-glob`: the existing `Dirent`-based walk already skips symlinks.
- picomatch's `basename` option stops `places/**/*.md` from matching anything, so it is set
  only for patterns without `/`.
- `yaml` attaches a comment line to the key below it, so deleting that key also deleted the
  comment. `deleteKeepingComments` moves it to the next key.
- First smoke run against a local vault copy showed `obsidian-links` for `_people/@luli.md`
  returning 2,907 backlinks, 60 KB even when capped. Backlinks are now one entry per linking
  note (count + line numbers), paged; the same call is 11 KB.

Smoke run (read-only tools, local vault copy, laptop):

```
list {"diaryFrom":"2026-10-01","diaryTo":"2026-10-31"} 21ms 1129B   {"total":8,...}
search {"queries":["climbing","escalada","скалолаз"]} 442ms 3246B
  {"scannedFiles":3621,"matchedFiles":7,"totalHits":7,"complete":true,"readErrorCount":0,...}
search {"queries":["luli","fedya"],"match":"all","diaryFrom":"2025-11-01","diaryTo":"2025-11-30"} 11ms 32581B
  {"matchedFiles":30,"nextOffset":20}
read {"diaryFrom":"2026-09-01","diaryTo":"2026-09-30"} 3ms 31360B
  {"notes":12,"returnedChars":28046,"nextDiaryFrom":"2026-09-13"}
read {"paths":["@senaev/@senaev_speaks.md"]} 1ms 20687B   {"truncated":true,"totalChars":102926}
links {"path":"_people/@luli.md"} 1686ms 11208B
  {"outgoing":12,"backlinks":{"totalSources":845,"totalLinks":2907},"ambiguous":0,"alias":0,"scannedFiles":3621,"complete":true}
links {"path":"periodic/day/2026-10-07.md","direction":"outgoing"} 407ms 4494B
  all 19 links resolved, including [[2026q4#2026-10-07]] and ![[daily_note_draft]]
```

A full scan is well under a second, so the no-index design holds for this vault. A
`setFrontmatter` patch on a copy of `_people/@luli.md` kept the list style, the date and the
body byte-for-byte and left no temp file.

`npm run simple-checks`: all checks pass, 1,005 tests.

### Deploy order

1. `INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_OBSIDIAN` is already in Vault `senaev-com-kv`.
2. Merge to `main`: the Helm chart, the obsidian-sync image and the cluster-helper image
   deploy in separate workflows. Until both new pods run, cluster-helper calls to
   obsidian-sync can get 401 (short links, tasks, static files, daily overview). Accepted.

## Verification

- `kubectl -n senaev-com get secret senaev-com-kv-secrets -o jsonpath='{.data.INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_OBSIDIAN}'`
  is not empty.
- From another pod, `curl -s -o /dev/null -w '%{http_code}' http://obsidian-sync:8080/milestones`
  gives `401`; `https://s.senaev.com/<id>` and `https://static.senaev.com/...` still work.
- In ChatGPT, after refreshing the connector: "find my diary entries about climbing", "summarise
  my diary for September 2026", "who links to @luli", and one create + patch on a test note.

### 2026-10-09 — ChatGPT end-to-end test (production)

A 17-step prompt run in ChatGPT against the deployed connector. All writes went only to
`@senaev/mcp-test/MCP smoke test.md`. Result as reported by ChatGPT:

```
1. obsidian-list — PASS — 101 total entries; returned 20 folders and 80 notes; no .obsidian, .trash or plugins; nextOffset=100.
2. obsidian-list — PASS — 8 daily notes for October 1–8; all expected paths and diaryDate values present.
3. obsidian-search — PASS — scannedFiles=3621, matchedFiles=7, complete=true, truncated=false.
4. obsidian-search — PASS — scannedFiles=30, matchedFiles=30, nextOffset=5; first page November 1–5, second page November 6–10; no overlapping files.
5. obsidian-read — PASS — hash=ac1614c2...; first diary sentence: "Today was a good and pretty intensive day."
6. obsidian-read — PASS — 30 notes across 3 pages: 12 → nextDiaryFrom=2026-09-13; 10 → 2026-09-23; 8 → null; final complete=true.
7. obsidian-read — PASS — totalChars=102926, truncated=true, nextStartChar=20000; second chunk continued at character 20000; same hash.
8. obsidian-links — PASS — outgoing links: resolved=19, ambiguous=0, unresolved=0.
9. obsidian-links — PASS — totalSources=845, totalLinks=2907.
10. obsidian-read — PASS — expected error: forbidden_path.
11. obsidian-create — PASS — hash=f847f785...
12. obsidian-create — PASS — expected error: already_exists.
13. obsidian-patch — PASS — appended "- three" to Done and set status=checked.
14. obsidian-patch — PASS — expected error: conflict; currentHash matched step 13.
15. obsidian-patch — PASS — expected error: ambiguous; 2 occurrences at lines 15 and 16.
16. obsidian-patch — PASS — replaced Todo with "- four".
17. obsidian-read — PASS — all expected content and frontmatter confirmed.
```

Final test note:

```markdown
---
tags:
  - mcp-test
status: checked
---
# MCP smoke test

## Done

- one
- three

## Todo

- four
```

All 17 steps pass, so the whole chain works in production: OAuth, the cluster-helper proxy,
the internal token, and every tool, including paging, the response budget, exclusions, the
hash conflict and the ambiguous-target check. The numbers match the local smoke run
(3,621 scanned files, 845 backlink sources, 2,907 links). The September summary in step 6
cited dates for each point, which confirms the diary-range workflow.

### 2026-10-09 — Cluster verification of the internal token

The secret key `INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_OBSIDIAN` is present (not empty).
No pod has `curl`, so the checks use `node -e` in the cluster-helper pod. The token is
checked by obsidian-sync, so a request without the header tests the same thing as any pod.

```
$ kubectl -n senaev-com exec deploy/cluster-helper -- node -e \
  "fetch('http://obsidian-sync:8080/milestones').then(r => console.log(r.status))"
401

# wrong token: no output was pasted

$ kubectl -n senaev-com exec deploy/cluster-helper -- node -e \
  "fetch('http://obsidian-sync:8080/milestones', {headers: {authorization: 'Bearer ' + process.env.INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_OBSIDIAN}}).then(r => console.log(r.status))"
200

$ kubectl -n senaev-com exec deploy/cluster-helper -- node -e \
  "fetch('http://obsidian-sync:8080/').then(r => console.log(r.status))"
400
```

- No token gives 401 and the real token gives 200: other pods can no longer read or edit
  the vault, and cluster-helper still can.
- `/` gives 400, not 401: the `?note=`/`?file=` routes stay open for nextjs-app.
- Checked in a browser, all work: `https://static.senaev.com/datadog-dc-by-org-id.html`
  (static proxy with the token), `https://senaev.com/notes/all_senaev_speaks_posts`
  (nextjs-app without the token), and `s.senaev.com` short links.

The wrong-token case is covered by unit tests
(`registerVaultToolRoutes.test.ts`, `bearerToken.test.ts`).

## Resolution

Done. ChatGPT can list, search, read, link-explore, create and edit vault notes through the
`obsidian-*` tools. The test note `@senaev/mcp-test/MCP smoke test.md` was deleted by hand
(the tools have no delete).
