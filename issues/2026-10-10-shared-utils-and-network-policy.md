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
