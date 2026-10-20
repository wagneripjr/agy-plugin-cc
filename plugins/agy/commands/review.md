---
description: Delegate a read-only code review to Antigravity (agy) and show the findings it returns against the plugin's schema
argument-hint: '[--wait] [--fresh|--resume <job-id>] [--model <model>] [--effort <effort>] [--json] [focus]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" review $ARGUMENTS`

Present the command output to the user as it stands. Do not add findings of your own, and do not fix anything the review reports.
