---
description: Delegate a coding task to Antigravity (agy) through the agy-delegate subagent and show the report it returns
argument-hint: '[--background|--wait] [--fresh|--resume <job-id>] [--model <model>] [--effort <effort>] [--] <task text>'
disable-model-invocation: true
allowed-tools: Agent
---

Invoke the `agy:agy-delegate` subagent through the `Agent` tool (`subagent_type: "agy:agy-delegate"`). Its prompt is the raw request below, character for character: do not add, remove, reorder or reword anything, and do not interpret its flags yourself.

Raw request:
$ARGUMENTS

Present the subagent's reply to the user as it stands. Do not summarise or rewrite Antigravity's response, and do not act on it.
