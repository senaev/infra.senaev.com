# 2026-11-07 — Migrate Telegram messages to Rich Markdown

Standardize Telegram communication across the repository on rich messages formatted with Markdown, without losing existing functionality or content.

## Goal

- Use Rich Markdown consistently for Telegram messages, notifications, reports, and progress updates, rather than maintaining parallel HTML and plain-message formatting.
- Preserve existing presentation and interactions, including emphasis, links, code, collapsible sections, inline buttons, replies, and updates to progress messages.
- Keep user-provided content readable and accurately escaped, regardless of special characters.
- Deliver complete messages without silent truncation. When a rich message is too long, split it into multiple correctly formatted messages.
- Keep Telegram formatting and length-handling consistent across the repository, without changing the underlying application behavior.

This project covers Telegram messages only; HTML used for web pages remains unchanged.
