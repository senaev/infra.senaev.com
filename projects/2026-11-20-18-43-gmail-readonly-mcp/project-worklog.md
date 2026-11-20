## 2026-11-20 18:43 UTC — Opened the Gmail MCP project

Use a dedicated Gmail API read-only grant behind an owner-authenticated MCP resource. The existing MCP endpoint layout supports distinct resource audiences.

```text
export const OBSIDIAN_MCP_PATH = '/obsidian';
export const CODE_MCP_PATH = '/code-tools';
export const GRAFANA_MCP_PATH = '/grafana';
export const TELEGRAM_MCP_PATH = '/telegram';
```
