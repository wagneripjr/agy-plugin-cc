---
id: BUG-001
type: Bug
status: OPEN
title: The agy engine inherits the runtime's whole environment, so a task leg can read stored prompts and the operator's transcript path
description: The runtime spawns agy with no env option, so the unsandboxed task leg inherits CLAUDE_PLUGIN_DATA and CODEX_COMPANION_TRANSCRIPT_PATH and used them to read earlier jobs' prompts.
home: FR-001
requirements: [FR-001]
specs: [ci/features/FR-001-agy-delegation.feature, ci/test-fr001-acceptance.mjs]
adrs: [ADR-001]
---
# BUG-001: The agy engine inherits the runtime's whole environment, so a task leg can read stored prompts and the operator's transcript path

**Status**: OPEN
**Severity**: High
**Found**: 2026-10-20
**Version/build**: 4434cd2 (runtime unchanged since ed40913); agy 1.4.3, model gemini-3.8-flash, effort low

## Symptoms
The FR-001 acceptance row "A run that does not resume starts a conversation of its own [is explicitly marked fresh]" failed: a fresh conversation's answer contained the codeword that only an earlier, separate job had been given.

## Reproduction
1. Run `node ci/test-fr001-acceptance.mjs` at 4434cd2 with agy 1.4.3 on gemini-3.8-flash.
2. The recall fixture gives job A a codeword. A separate run marked fresh is then asked for the codeword.
3. The fresh run's agy conversation shows it ran `env` and found `CLAUDE_PLUGIN_DATA`. It read every job record under `plugin-data/jobs`, including job A's stored argv, which carries the codeword prompt. It also ran `cat "$CODEX_COMPANION_TRANSCRIPT_PATH"`, `agy session list`, `ls ~/.gemini/antigravity-cli/brain` and `ps aux | grep agy`.

## Expected vs Observed
- **Expected**: A fresh run cannot see another job's prompts or the operator's session transcript. The engine receives only the environment it needs to run.
- **Observed**: `plugins/agy/scripts/lib/engine.mjs` spawns agy with no `env` option, so agy inherits the runtime's whole environment. That includes the plugin data directory, which holds every job's argv and prompt, and the Claude Code transcript path.

## Root Cause
The engine spawn passes no `env`, so the child inherits `process.env` unchanged. ADR-001 deliberately leaves the task leg unsandboxed, so whatever the environment points at is reachable.

## Impact
Every task leg can read prior delegations' prompts, which may hold confidential task text, and the operator's Claude Code transcript. That breaks fresh-conversation isolation (FR-001 contract 5) and exposes session content to a third-party engine. The FR-001 recall acceptance check fails nondeterministically, depending on how inquisitive the model is.

## Evidence
`~/.gemini/antigravity-cli/conversations/cd98adeb-e415-4ef5-b9f4-32966488ae4e.db`, the fresh run's own conversation, records the `env`, `node -e` (BypassSandbox), `cat "$CODEX_COMPANION_TRANSCRIPT_PATH"` and job-store reads.
