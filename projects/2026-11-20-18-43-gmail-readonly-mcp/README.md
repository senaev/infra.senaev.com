# 2026-11-20 — Read-only Gmail MCP

Give ChatGPT and the owner's LLM workspace read access to Gmail with Google-enforced protection against writes.

## Goal

Search the mailbox, read messages and threads, and retrieve attachments. Prevent sending, drafting, labeling, archiving, trashing, deleting, and marking messages read.

## Context

The ChatGPT Gmail permission “Allow read actions” prompts before making changes. Strict read-only access requires a separate Gmail API grant. The custom MCP setup reported:

> Couldn't discover OAuth settings. Check the server URL or enter settings manually

The form contained the Google Gmail OAuth scope in its Server URL field. The proposed MCP endpoint is `https://mcp.senaev.com/gmail-readonly`.

- [Existing MCP resource routing](../../cluster-helper/src/mcpEndpoints.ts)
- [Existing MCP authorization server](../../cluster-helper/src/oauth/authorizationServer.ts)
- [Workspace client configuration and Vault conventions](../../AGENTS.md)
- [Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [ChatGPT custom MCP setup](https://developers.openai.com/api/docs/guides/custom-mcp-server)

## Plan

1. Add `/gmail-readonly` as its own OAuth resource under cluster-helper. Reuse the existing owner sign-in and client metadata flow. Bind MCP access to the intended owner and reject tokens issued for other resources.
2. Provision a dedicated Google OAuth client and obtain an offline grant with `https://www.googleapis.com/auth/gmail.readonly` as its only Gmail scope. Confirm the consent configuration supports durable refresh for this account. Store the client credentials and refresh token in Vault and inject them only into the Gmail API caller. Keep the Google grant separate from ChatGPT's MCP authorization and out of the LLM workspace.
3. Expose read-only MCP tools for paginated Gmail search, message and thread retrieval, and attachment retrieval. Include support for Spam and Trash when requested. Use fixed Gmail API read operations with validated inputs. Bound response sizes and keep message content and tokens out of application logs.
4. Add the endpoint to the owner's OpenCode and Claude Code MCP configuration. In ChatGPT, add it as a custom MCP server using the endpoint URL and OAuth. Once the new connection is verified, disconnect the built-in Gmail app if it still provides a write-enabled path. Verify which app connections Codex can use before considering its cutover complete.

## Verification

- Test missing credentials, wrong-resource tokens, and authorized calls. Verify the published tool list contains only reads, unknown tools are rejected, and mocked Gmail requests use only the intended read endpoints.
- Verify the Google grant carries only the read-only Gmail scope and refresh survives a service restart.
- Connect from ChatGPT and the owner's LLM workspace. Search known messages, retrieve a thread and attachment, and verify unread state remains intact. Confirm Sent and archived mail can be found. Verify the write-enabled ChatGPT connection is disconnected after cutover.

## Result

Project opened. Implementation, Google consent, and deployment are pending.
