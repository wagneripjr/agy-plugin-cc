---
id: ADR-001
type: ADR
status: Accepted
title: "ADR-001: One agy process per turn, two legs chosen by mode, never under --sandbox"
description: The plugin spawns one print-mode agy process per turn with no broker, picks the review or task leg by --mode, never runs a task leg under --sandbox, adopts ADR-014's runtime rule and ships a thin forwarding subagent.
date: 2026-10-19
authors:
  - Wagner Ignacio Pinto Junior
tags:
  - runtime
  - delegation
supersedes: null
superseded_by: null
---
# ADR-001: One agy process per turn, two legs chosen by mode, never under --sandbox

## Status

**Accepted**. These are the hub's shape rulings for hub R-121, recorded at the hub on 2026-10-19,
taken over here so they survive the deletion of the dispatch brief that carried them.

## Context

The plugin makes Antigravity (`agy`) a delegation target beside Codex. The `codex` plugin is the
model and never the base: nothing is forked or copied from it. The operator also ruled that an
agy-native route is preferred where one is better. The hub measured none better than print mode.

The measurements were taken against `agy` 1.4.2 (model family `gemini-4-argon`) and
`codex-plugin-cc` at `0630113` (plugin `codex` 1.0.7), both read 2026-10-19:

- `agy -p <prompt> --output-format stream-json` completes a coding task headless. It emits `init`
  (model, cwd, tools, `permission_mode`), then `step_update` per step, then `result`
  (`conversation_id`, `status`, `response`, `duration_seconds`, `num_turns`, `usage`).
- `--conversation <id>` resumes with memory of prior turns, and the same conversation file gains steps.
- `--mode plan` refuses edits. With no `--mode`, or with `accept-edits` or `auto`, `init.permission_mode` reads
  `request-review`, and edits, shell commands and an outbound `curl` all ran without a prompt.
- `--sandbox` lets the agent's edit tool write workspace files. Every shell write inside the
  workspace fails with "operation not permitted", `git` cannot read `~/.gitconfig`, `npm` cannot
  exec `node`, `/tmp` stays writable and the network stays open.
- The only daemon is Remote Control, a browser-facing session relay. No JSON-RPC app-server is
  advertised and no ACP flag exists.
- In `codex-plugin-cc`, the app-server client, the broker and `codex.mjs` make up 1 825 of the 5 341
  lines under `plugins/codex/scripts`, and all of them are Codex-specific.

## Decision

1. **One process per turn, no broker.** agy's primitive is a print-mode process. It ends with a
   `result` event and a conversation id that the next process can resume. Nothing needs to stay
   alive between turns, and there is no protocol to speak to.
2. **Two legs, chosen by mode.** The review leg runs `--mode plan` with a findings schema the plugin
   ships, passed through `--json-schema`. The task leg runs in the default mode. The prompt text
   never decides which leg runs.
3. **A task leg never runs under `--sandbox`.** The measured sandbox blocks the shell from the
   workspace and leaves the network open, which is the inverse of what a build-and-test leg needs.
   A task leg is contained by the working tree it is pointed at and by the task text.
4. **Hub ADR-014's runtime rule is adopted.** Its mandatory scope is the four SDLC repositories.
   This plugin takes on the same rule by this decision: zero-dependency Node, every process started
   as an executable plus an argv array, and never a shell.
5. **A thin forwarding subagent, shaped like the Codex plugin's.** In the 2026-09-29 incident, a
   wrapper model answered a review itself because its forwarding rules were loose. The Codex
   subagent's rules are the measured remedy. The subagent's tool set is the shell alone, and it
   makes exactly one call, to the plugin runtime.

## Consequences

### Positive

- **POS-001**: No long-lived process to supervise, restart or leak. A job is one child process plus
  its record.
- **POS-002**: Read-only review is enforced by the engine's mode, not by asking nicely in a prompt.
- **POS-003**: Proof of a run lives in agy's own conversation file, which the plugin can check
  against the turn it reports.

### Negative

- **NEG-001**: A task leg has no process-level containment. Pointing it at the wrong tree, or giving
  it a careless task text, can edit, execute and reach the network.
- **NEG-002**: Each turn pays agy's startup cost, because nothing is kept warm.
- **NEG-003**: The plan-mode guarantee holds only for as long as agy keeps refusing edits in plan mode. That is
  measured on 1.4.2 and is not a contract agy publishes.

## Alternatives Considered

### Alternative 1: Port the Codex app-server client and broker

**Description**: Keep a long-lived agy process behind a broker, the way the `codex` plugin keeps
`codex app-server`.

**Rejected because**: agy advertises no app-server protocol. The only daemon is Remote Control, a
browser relay. A broker would be machinery with nothing to drive.

### Alternative 2: Bidirectional stream-json (`--print= --input-format stream-json`)

**Description**: Hold one agy process open per conversation and feed it turns on stdin.

**Rejected because**: the input schema was not derived, and `--conversation` already covers
multi-turn work through separate processes.

### Alternative 3: Run every leg under `--sandbox`

**Description**: Use agy's sandbox as the containment for both legs.

**Rejected because**: it blocks every shell write in the workspace, so builds, tests and git fail,
and it still leaves the network open. It contains the wrong things.

### Alternative 4: Fork the `codex` plugin

**Description**: Copy `codex-plugin-cc` and swap the engine.

**Rejected because**: the operator ruled that the Codex plugin is a model, never a base. The
engine-specific core (2 075 lines with the broker lifecycle) has no agy counterpart.

## Implementation Notes

The engine-neutral shapes in the model repository are job control, tracked jobs, state, render and
git review-target selection. They are worth re-deriving, but not copying.

## References

- hub R-121 (roadmap item), hub ADR-014 (runtime rule), hub ADR-011 (tools are not SDLC machinery)
- FR-001
