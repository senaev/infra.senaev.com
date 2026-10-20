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
Only HTTPS OpenAI file-storage hosts are accepted, including the named OpenAI Azure/S3
storage accounts; every redirect is revalidated. Unexpected future download origins fail
closed and require an allowlist update. Signed URLs and file data are not logged or returned.
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
- `obsidian-read` accepts explicit text/attachment paths. Results retain the existing
  `notes` envelope. Supported UTF-8 text gets bounded/paginated content and its whole-file
  hash; binaries get `binary: true`, empty content, size and hash only. Reading/hashing
  is capped at 25 MiB; text decoding/editing at 5 MiB.
- Supported text extensions: md, txt, csv, tsv, json, yaml, yml, xml, html, css, js, ts,
  log, svg, ini, toml, sql, sh, mjs, cjs. Invalid UTF-8 and binary control characters
  are rejected for editing. PDF/XLSX/image data is never edited as text.
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
