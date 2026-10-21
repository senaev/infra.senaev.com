# Obsidian file tools

The existing note tools also support attachments and UTF-8 text files. Hidden/excluded
paths and symlinks remain unavailable. Files stay inside the live vault.

## Upload from ChatGPT

Refresh the connected app's tools after deployment. The `obsidian-upload` descriptor
declares `_meta["openai/fileParams"]: ["file"]`. ChatGPT supplies the actual file reference:

```json
{
  "path": "@senaev/finances/transactions/2026-10.csv",
  "file": {
    "download_url": "https://files.oaiusercontent.com/temporary-signed-url",
    "file_id": "file_..."
  }
}
```

The schema declares all four OpenAI file properties: `download_url` and `file_id` are
required; `mime_type` and `file_name` are optional. Metadata, schema and calls pass through
Cluster Helper unchanged. Obsidian Sync downloads the bytes itself, so file bytes and
base64 do not traverse the MCP JSON endpoint and its 1 MiB request limit need not increase.
No widget is needed for this tool-input mechanism.

Source: https://developers.openai.com/plugins/reference#define-file-inputs

Limits: 25 MiB decoded/downloaded bytes, 60 seconds per download, at most three redirects.
Only HTTPS hosts on oaiusercontent.com or its subdomains are accepted; every redirect
is revalidated. Cloud account prefixes do not prove ownership. Any additional storage
host requires verified ownership and an exact allowlist entry before it can be accepted. Signed URLs and file data are not logged or returned.
Expired URLs require a fresh ChatGPT reference.

Uploads create parent directories and exclusively reserve a hidden temporary file.
Only the complete download is published; existing destinations are never overwritten.
Failure/cancellation removes the temporary file (created parent folders can remain).
Replies contain `path`, `size` and SHA-256 `hash`.

All tools retain the existing queued/parallel execution and in-memory requestId contract.
Inspect operation status/result before assuming success. A restart loses retry records;
an existing destination still cannot be overwritten.

## Read, list and edit

- `obsidian-list` defaults to notes/folders. Set `includeAttachments: true` to include
  attachments and SHA-256 hashes. Files over 25 MiB remain listed with `hashUnavailable`.
  Per-file metadata/read failures omit that entry and return `entryErrors` with
  `complete: false`; other entries remain available. Pagination advances across the
  original page, including failed entries; `total` counts initially discovered entries.
- `obsidian-read` accepts explicit text/attachment paths. Results retain the existing
  `notes` envelope. Supported UTF-8 text gets bounded/paginated content and its whole-file
  hash; binaries get `binary: true`, empty content, size and hash only. Reading/hashing
  is capped at 25 MiB. Markdown reading/moving supports up to 25 MiB;
  other text decoding and all text editing remain capped at 5 MiB.
- Supported text extensions: md, txt, csv, tsv, json, yaml, yml, xml, html, css, js, ts,
  log, svg, ini, toml, sql, sh, mjs, cjs. Classification uses only the final extension,
  case-insensitively; unknown or absent extensions are binary even for ASCII content.
  Control characters are preserved. Allowlisted files must decode as UTF-8; otherwise
  reading/editing returns `invalid_text_encoding` without reclassifying the file as binary.
- `obsidian-patch` uses the hash from a fresh read. Non-Markdown files support exact
  single-match `replace` and `append` without a section. For these files append means
  literal concatenation: include any desired newline in text. BOM and CRLF remain intact.
  Frontmatter and section operations remain Markdown-only. Patch arguments still need
  to fit the HTTP request limit; use small targeted changes.
- This is generic text editing, not a CSV parser. Parse CSV before regenerating rows,
  especially quoted fields containing commas/newlines. Binary replacement is not supported.

## Move and trash

`obsidian-move` accepts notes or attachments up to 25 MiB. For attachments the destination
is exact, including its extension: no Markdown suffix is added. Markdown backlinks/embeds
are rewritten; attachment bytes are copied unchanged, never interpreted as Markdown.
Markdown moves retain their existing note-specific rules.

`obsidian-delete` requires the latest hash and moves one regular file to
`.trash/mcp/<unique-id>/<original-path>`. It returns `trashPath` and affected backlinks.
References are reported, not removed from notes. Trash is excluded from ordinary tools.
Restore the file manually in the vault filesystem using the returned path; there is no
permanent-delete or directory-delete command.

Move and trash preserve a complete copy before removing the source. A cancellation or
concurrent external edit can leave both copies; inspect changedPaths and returned paths.
Process-local mutation locks do not coordinate external Obsidian/git/sync writers.

## Verification after merge/deploy

1. Refresh ChatGPT tools and confirm upload has fileParams metadata.
2. Attach a small CSV and a PDF; upload to a temporary test folder and compare byte size/hash.
3. List with includeAttachments, read the CSV, patch a field using its hash, and verify
   a stale-hash edit is refused and PDF patching is refused.
4. Move the PDF referenced by a test note; verify bytes and updated links.
5. Trash it using its hash; verify the recoverable copy and backlink report.

Automated tests mock remote downloads and cover upload limits, redirects, cancellation,
metadata forwarding, CSV fidelity and trash. Actual ChatGPT attachment routing and current
download origins must still be verified after deployment.

## Download through authenticated MCP resources

Call `obsidian-download` with one exact vault-relative `path`. It returns metadata,
SHA-256 and an MCP `resource_link` such as
`obsidian-vault://file/<encoded-path>?sha256=<hash>`. Cluster Helper promotes the
link into MCP content, also when download finishes through operation_result.

The client retrieves bytes using `resources/read` on the same OAuth-protected
MCP endpoint. Cluster Helper forwards this to the internal-token-protected
`POST /vault-file-resource` route. The response is standard MCP resource contents
with MIME type and a base64 blob, not a base64 string in model-facing tool text.
No widget, public file route, signed URL, OpenAI API key or Files API upload is used.

The URI identifies a file version; it is not a credential and has no time expiry.
Every read repeats path, exclusion, symlink and regular-file validation, caps data
at 25 MiB, and rejects content whose SHA-256 changed. The resource read has a
60-second backend deadline and 65-second proxy timeout. It bypasses the managed
JSON result retention/pagination quota; download metadata retains the normal
queued/parallel/retry contract. File resource bytes are not retained in operation records.

Each service permits one active resource transfer per process, holding its slot until
both work and the HTTP response finish. Concurrent reads receive HTTP 429 with
Retry-After: 1. Disconnects cancel backend reads/upstream fetches; deadlines also close
stalled responses. These bounds limit simultaneous buffered/base64 copies, rather than
turning this JSON-based protocol into streaming binary transfer.

Downloads open with O_NOFOLLOW and validate the actual descriptor through Linux
/proc/self/fd before and after reading, including parent-directory replacement races.
They fail closed when procfs descriptor validation is unavailable. Deployment requires
Linux containers with procfs mounted. File metadata changes during reading are rejected.

MIME types use filename extensions, with application/octet-stream for unknown types.
Resource access does not grant filesystem writes. Resource listings are empty; the
caller selects files explicitly through download rather than exposing a vault catalog.

Compatibility: standard MCP resource support is implemented, but automatic import
as a ChatGPT analysable attachment is not established by the public file-input docs.
The GPT Actions openaiFileResponse contract is not an MCP contract. After deploying
both services, refresh tools, download a small PDF and CSV, request resources/read,
compare decoded bytes/hash and verify ChatGPT can actually open/analyse them.
If this client does not import resource blobs, keep this task open and investigate
a supported host-specific file-output mechanism; do not claim a successful attachment
download from metadata alone.

References:
- https://developers.openai.com/plugins/reference#tool-results
- https://modelcontextprotocol.io/specification/2025-06-18/server/resources
- https://developers.openai.com/api/docs/actions/sending-files (Actions only)
