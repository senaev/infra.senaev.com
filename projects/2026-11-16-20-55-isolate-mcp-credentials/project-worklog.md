# Worklog

## 2026-11-16 20:55 UTC — Project created

The user asked for a project to isolate the MCP credentials from the agent runtime, after MCP
servers with OAuth were added to Claude Code (PRs #211, #213, #214). Today the Claude Code MCP
tokens are in `~/.claude/.credentials.json` in the shared `HOME`, and the OpenCode ones in its data
folder: both readable by the agent. No option is chosen yet; the README ranks them.
