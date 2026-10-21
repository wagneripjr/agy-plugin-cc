---
description: Show the result of an Antigravity (agy) job, with its response once it succeeded
argument-hint: '[<job-id>] [--json]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" result $ARGUMENTS`

Present the command output to the user as it stands. Do not summarise or rewrite Antigravity's response.
