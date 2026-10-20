---
description: Report whether Antigravity (agy) is installed, its version, account state, models, plugins and MCP servers
argument-hint: '[--json]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" setup $ARGUMENTS`

Present the command output to the user as it stands. Do not install, sign in, or change any Antigravity plugin or MCP server.
