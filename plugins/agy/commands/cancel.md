---
description: Cancel a running Antigravity (agy) job and show the state it ended in
argument-hint: '<job-id> [--json]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" cancel $ARGUMENTS`

Present the command output to the user as it stands. `/agy:status` lists the job ids.
