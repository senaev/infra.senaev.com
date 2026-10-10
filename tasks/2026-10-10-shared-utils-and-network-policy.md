# 2026-10-10 — Shared code in senaev-utils, NetworkPolicy for obsidian-sync

> This file is the working log for this task. All design decisions, implementation steps,
> commands run, outputs pasted, blockers hit, and the eventual completion state must be
> appended to this file as we go — so the whole session lives in one place and is
> searchable later.
>
> Format: append new dated sections under ## Findings as work proceeds. Don't rewrite
> earlier sections — annotate them.

## Goal

Follow-up to the review of the Obsidian MCP code after
[`2026-10-10-obsidian-mcp-vault-rules-and-diary-tool.md`](2026-10-10-obsidian-mcp-vault-rules-and-diary-tool.md).
Remove duplicated code by moving it to `senaev-utils`, and limit who can reach obsidian-sync
on the network. No behaviour change for ChatGPT or for the other features.

## Plan

### Network

- **NetworkPolicy `obsidian-sync`** (in `provisioning/helm/senaev-com/templates/obsidian-sync.yaml`):
  ingress to the obsidian-sync pod only from the `cluster-helper` and `nextjs-app` pods, on
  TCP 8080. Egress stays open (`ob sync` needs the internet). k3s runs the kube-router
  NetworkPolicy controller by default (`bootstrap-control-plane.sh` does not pass
  `--disable-network-policy`). obsidian-sync has no probes and no ingress, so nothing else
  needs access. It touches no node or Tailscale networking.
  Rollback: `kubectl -n senaev-com delete networkpolicy obsidian-sync`.
  Later, optional: serve the public `?note=`/`?file=` routes on their own port, so that
  nextjs-app reaches only those.

### Moved to senaev-utils (generic helpers)

| Helper | Place | Replaces |
|---|---|---|
| `sha256` (buffer and hex) | `utils/crypto/sha256` | copies in `bearerToken.ts`, `authorizationServer.ts`, `parseMarkdown.ts`, `hashRenderedNote.ts` |
| `parseBearerToken` | `utils/auth/bearerToken` | the regex in `authorizationServer.checkAccessToken` |
| `replaceFileAtomically`, `createFileExclusively` | `utils/fs/atomicFileWrite` | `vault-tools/access/writeNoteFile.ts`, the temp-file write in `updateNoteFrontmatter.ts`, the plain `writeFile` in `prependTaskLine.ts` (not atomic before) |
| `walkDirectory` | `utils/fs/walkDirectory` | the walk in `vault-tools/access/walkVault.ts` and `telegram-post-sync/collectVaultMarkdownFiles.ts`; each keeps its own skip rules |
| `fetchJsonStatus` | `utils/http/fetchJsonStatus` | the "fetch, check `status: ok/error`" code in `cluster-helper/src/obsidianSyncApi.ts` |

### Vault tool contract in senaev-utils (D1)

The tool definitions that ChatGPT sees (names, descriptions, input schemas, annotations) and
the limits behind them move from `cluster-helper/src/chatGptMcp/obsidianTools.ts` and the
`MAX_*` constants in `obsidian-sync/src/vault-tools/tools/*` to
`senaev-utils/src/obsidianVaultTools/`. cluster-helper serves them on `tools/list`;
obsidian-sync takes the limits and the allowed argument keys from the same objects. A new
tool or limit is then one change. Accepted cost: the contract is part of the public npm
package.

### Stays in obsidian-sync (D5)

Frontmatter parsing needs the `yaml` package, so it does not go to senaev-utils (the external
consumer would install it too). `parseNoteFrontmatter` and `stripFrontmatter` move from
`milestones/` and `telegram-post-sync/` to a shared `obsidian-sync/src/markdown/`, so that
vault-tools no longer imports from feature folders.

## Verification

- `npm run simple-checks` passes; existing tests keep passing, new helpers have tests.
- After deploy: a ChatGPT read, search and diary record work; `tools/list` returns the same
  tools; the daily overview, short links and public notes on nextjs-app work.
- NetworkPolicy: from a temporary pod, `curl -m 3 http://obsidian-sync:8080/` times out.

## Findings

*(append results below)*

### 2026-10-10 — Implementation

Commits (`npm run simple-checks` passes after each):

```
ddcb64b ♻️ Move sha256, bearer parsing, atomic file writes and the directory walk to senaev-utils
339e274 ♻️ Read obsidian-sync status replies with one senaev-utils helper
747c617 ♻️ Share the Obsidian vault tool definitions and limits through senaev-utils
1779bd9 🚚 Move the frontmatter parsers to obsidian-sync/src/markdown
```

Deviations from the plan, and details:

- `hashRenderedNote.ts` keeps its own `createHash`: it hashes several fields incrementally,
  which `sha256(string)` does not cover.
- `parseBearerToken` accepts any case of `Bearer` and no spaces in the token, as the OAuth
  check did before. The internal-token check now uses it too, so it also accepts `bearer`.
- `createFileExclusively` in senaev-utils throws the plain `EEXIST` error (new
  `isAlreadyExistsError`); `createTool` turns it into `already_exists`. The temporary files
  are now `.<name>.<random>.tmp` everywhere (before: `.vault-tools.tmp` and `.tg-sync.tmp`);
  nothing matched those suffixes.
- `prependTaskLine` now writes atomically (it used a plain `writeFile`).
- The helper is `readStatusResponse(response)` instead of `fetchJsonStatus`: it reads a reply
  that is already fetched, so `fetchObsidianSync` keeps adding the token. An ok reply without
  a JSON object body (`201 Created` of `POST /tasks`) counts as success. The short link error
  text that the owner sees in Telegram is still the plain `message` of obsidian-sync.
- Tool definitions: `senaev-utils/src/obsidianVaultTools/vaultToolDefinitions.ts` (schemas,
  descriptions, `PATCH_OPERATION_FIELDS`, `isVaultToolName`, `getVaultToolArgumentKeys`) and
  `vaultToolLimits.ts`. obsidian-sync accepts exactly the schema keys
  (`readVaultToolArguments`), and `VAULT_TOOLS` is typed by `VaultToolName`, so a tool
  without a definition fails to compile. Internal-only limits (snippet size, reported
  errors, links per note) stay in obsidian-sync.
- `tools/list` compared before and after (JSON diff of `OBSIDIAN_TOOLS`): the only changes are
  the new `maxLength: 200` on `glob` (list, search) and `maximum` on `offset`
  (1,000,000 / 100,000 / 1,000,000), which the server already enforced. No connector refresh
  is needed; ChatGPT gets them on its next `tools/list`.
- NetworkPolicy added as planned. `helm template` renders it.

### 2026-10-10 — Deploy of 84db2a5

```
obsidian-sync: completed success
senaev-utils: completed success
vpn-subscription: completed success
cluster-helper: completed success
Update Helm Charts: completed success
Check: completed success
media-server-helper: in_progress
```

media-server-helper is rebuilt only because senaev-utils changed; its node is down, so its
deploy waits. It does not use any of the changed code paths. Production checks pending.

### 2026-10-10 — NetworkPolicy verified

```
$ kubectl -n senaev-com get networkpolicy obsidian-sync
NAME            POD-SELECTOR        AGE
obsidian-sync   app=obsidian-sync   3m59s

$ kubectl -n senaev-com run np-test --rm -i --restart=Never --image=curlimages/curl -- \
    curl -sS -m 3 http://obsidian-sync:8080/ ; echo "exit=$?"
curl: (7) Failed to connect to obsidian-sync:8080 after 72 ms: Could not connect to server
exit=7

$ kubectl -n senaev-com exec deploy/cluster-helper -c cluster-helper -- \
    node -e 'fetch("http://obsidian-sync:8080/milestones").then(r=>console.log(r.status))'
401
```

A pod without an allowed label is refused at once (exit 7, not the expected timeout 28):
kube-router rejects the packet instead of dropping it, which blocks the connection just the
same. cluster-helper still reaches obsidian-sync (401 because the test sends no token).

### 2026-10-10 — End-to-end checks passed

- Short link https://s.senaev.com/1bxsl9 redirects to https://senaev.com/cv/5min.
- Static file https://static.senaev.com/datadog-dc-by-org-id.html opens.
- Public note https://senaev.com/notes/my_blog_post_senaev_speaks_12 opens (the nextjs-app
  path through the NetworkPolicy).
- ChatGPT: "Read the latest version of diary records file. Then search the files about crips
  in my diary and write this number to the file with diary records." It read
  `@senaev/daily_note_draft.md` (empty), searched (0 files for "crips"), and wrote `0` into
  the draft with a diff `+0`. Read, search and write all work through the new code.

These three URLs are now the smoke test in the root `AGENTS.md` ("Smoke test after a deploy").

## Resolution

Done. Generic helpers (sha256, bearer parsing, atomic file writes, the directory walk, status
replies) and the vault tool contract (definitions and limits) are in senaev-utils and used by
both services. The frontmatter parsers are in `obsidian-sync/src/markdown/`. A NetworkPolicy
lets only cluster-helper and nextjs-app reach obsidian-sync.
