---
id: ADR-002
type: ADR
status: Accepted
title: "ADR-002: agy runs on an allowlisted environment; disk reads by the unsandboxed engine are accepted residual risk"
description: The runtime starts agy with an allowlisted environment and stores no prompt text. Reads the unsandboxed task leg makes from disk as the operator's user are accepted, not prevented.
date: 2026-10-21
authors:
  - Wagner Ignacio Pinto Junior
tags:
  - security
  - runtime
supersedes: null
superseded_by: null
---
# ADR-002: agy runs on an allowlisted environment; disk reads by the unsandboxed engine are accepted residual risk

## Status

**Accepted**. The operator chose this scope for BUG-001 on 2026-10-21, over a sandbox-exec profile
and over a separate OS user.

## Context

ADR-001 runs the task leg without `--sandbox` and as the operator's user. BUG-001 found that agy
inherited the runtime's whole environment. With it, the engine followed `CLAUDE_PLUGIN_DATA` to the
job store, which held every job's prompt, and followed `CODEX_COMPANION_TRANSCRIPT_PATH` to the
operator's Claude Code transcript. With no environment clue at all, the engine also walked `$TMPDIR`
and grepped for text it wanted. Removing environment pointers cannot stop an unsandboxed process
running as the same user from reading files that user can read.

## Decision

1. **Allowlisted environment.** The runtime starts every agy process with an explicit environment
   built from an allowlist: `PATH`, `HOME`, `USER`, `LOGNAME`, `SHELL`, `TMPDIR`, `LANG` and `LC_*`.
   On agy 1.4.3, `HOME` alone suffices for print mode, because agy signs in from files under `HOME`.
2. **Values are screened, not just names.** Any allowlisted entry whose value contains the value of
   a `CLAUDE_*` or `CODEX_*` setting of the runtime's own environment is dropped. `PATH` and `HOME`
   are needed unchanged, so if either contains such a value the job fails before spawn, with a
   reason. They are never rewritten.
3. **The job store holds no prompt text.** The recorded argv keeps the prompt argument as its
   SHA-256 digest.
4. **Disk reads are accepted residual risk.** A task leg can still read anything the operator's user
   can read, including `~/.claude`, the job store's metadata and other temp directories. This plugin
   does not prevent that, and FR-001's checks do not depend on the engine refraining from it.

## Consequences

### Positive

- **POS-001**: The engine no longer receives a pointer to stored prompts or to the transcript.
- **POS-002**: Even when the engine finds the job store, it holds no prompt text.

### Negative

- **NEG-001**: A determined engine can still read the operator's files, the Claude Code transcripts
  under `~/.claude/projects/` included. Delegate to agy only work you would let a same-user process
  read your home for.
- **NEG-002**: `SSH_AUTH_SOCK`, proxy and CA variables, and alternate credential variables are not
  passed. A delegated task cannot `git push` over SSH or work behind a proxy until the allowlist is
  widened on evidence.

## Alternatives Considered

### Alternative 1: macOS sandbox-exec profile for the task leg

**Description**: Keep the workspace writable and the network open, and deny `~/.claude`, the job
store and other temp directories.

**Rejected because**: It overturns part of ADR-001, works on macOS only, and needs new probes. The
operator chose the smaller scope for now.

### Alternative 2: A dedicated low-privilege OS user for agy

**Description**: Run agy as a separate user that cannot read the operator's home.

**Rejected because**: It needs one-time system setup and breaks agy's login under the operator's
`HOME`.

## References

- ADR-001, BUG-001, FR-001 (contracts 1 and 5)
