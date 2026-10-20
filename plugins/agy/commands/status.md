---
description: Show the state of an Antigravity (agy) job without waiting for it
argument-hint: '<job-id> [--json]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" status $ARGUMENTS`

Present the command output to the user as it stands.
