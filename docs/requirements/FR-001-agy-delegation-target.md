---
id: FR-001
type: Requirement
status: Draft
title: "FR-001: Antigravity is a delegation target beside Codex"
description: A session hands a review or a task to agy through one plugin, and every agy leg a session runs goes through it, as a tracked, resumable, verifiable job.
derives-from: [hub:R-121]
adrs: [hub:ADR-014, hub:ADR-011, ADR-001]
---
# FR-001: Antigravity is a delegation target beside Codex

**Raised**: 2026-10-19

A session hands a review or a task to `agy` through one plugin, and every agy leg a session runs
goes through it.

## Source

Hub R-121, the operator's rulings, and the hub decisions recorded in ADR-001. The requirement is
framed by hub ADR-014, the runtime rule this repository adopts, and by hub ADR-011: this plugin is
a tool, not SDLC machinery. It ships with no dependency on `agentic-sdlc` or the private overlay,
while its own build runs under `agentic-sdlc`.

Frozen at two anchors, both read 2026-10-19: `agy` 1.4.2 (model family `gemini-4-argon`) and
`codex-plugin-cc` at `0630113` (plugin `codex` 1.0.7). If `agy --version` has moved, re-run the
probes ADR-001 records before building on them.

## Contract

1. **A delegation names its engine settings and the engine confirms them.** Every run records the
   model and effort it was given. Every run that reached the engine's `init` event also carries the
   model the engine reported there, so a reader sees that what was asked is what ran. A run that
   failed before `init` carries the requested settings and says no confirmation arrived. The plugin
   never lets the engine pick either setting.
2. **A review leg returns findings, never prose, and cannot write.** A review returns an object
   under a schema the plugin ships. Each finding in it carries at least a file, a line, a claim, the
   evidence checked and a verdict. The working tree is unchanged after a review leg. A review whose
   output does not satisfy the schema is reported as a failed review and is not rendered as prose.
3. **A task leg may edit, and it reports what it did.** A task returns the engine's final response
   and the conversation id. The tree is whatever the engine left.
4. **Every run is a tracked job with a terminal state.** A run is in one of four states: running,
   succeeded, failed or cancelled. Each of the following ends in failed, with the reason the plugin
   saw: a startup failure, an engine that exits without a `result` event, an engine that reports a
   non-success status, and output that violates a requested schema. A cancel ends the engine process
   and records cancelled. Status and result read the same record, both while the run is live and
   after it ends.
5. **A job is resumable, and resuming is a choice.** A follow-up continues the recorded
   conversation, and the caller names a fresh run explicitly. A follow-up answers with the prior
   turns in context.
6. **Proof is tied to the invocation.** The result names the conversation id, the conversation file
   and the turn the invocation added. A reader can then tell from agy's own records that this
   invocation's turn ran, not merely that the conversation exists. A succeeded run carries a
   verification outcome, either verified or unverified. It is unverified when the engine reported
   success but the conversation file is absent or did not gain the reported turn. Unverified is not
   a fifth state. It is a property of succeeded, and the result states it.
7. **Background and foreground share one surface.** A run started in the background survives the
   turn that started it. Its status and result are read through the same commands as a foreground
   run's.
8. **A forwarding subagent forwards.** The plugin ships one subagent for delegation, and its tool set
   is the shell alone. Its transcript for a delegation holds exactly one tool call: the plugin
   runtime, with the caller's task text preserved apart from routing flags. Its reply is the
   runtime's output verbatim, with nothing before or after it. Its description names the engine, so
   a model that wants a second lens picks this subagent or the Codex one on purpose.
9. **Skills and MCP are the engine's, and setup reports which ones are loaded.** The plugin injects no
   skills or MCP servers into agy. Setup reports whether `agy` is on the path, its version, the
   account state, the models it lists, and the plugins and MCP servers agy has loaded. Setup
   installs nothing and exits non-zero when `agy` is absent.
10. **The runtime rule is ADR-014's.** Every process the plugin starts is an executable plus an argv
    array. No runtime file names a shell or passes a command string.
11. **Hub practice, tested nowhere in this repository.** A review through this plugin is the agy
    leg of the cross-AI review practice. A raw `agy -p` from a session's shell is deprecated for the
    same reason raw `codex exec` is: no job record, no structured findings, and a proof
    reconstructed by hand. This item lands in hub memory and the hub practice note, not in this
    repository's suite. [hub, memory]

## Out of scope

- Session transfer into agy. `agy plugin import claude` and any session importer are unverified.
- The bidirectional stream-json mode. It is not needed while `--conversation` covers multi-turn work.
- Running the SDLC gates inside an agy session. That is the hub R-102 direction, decided for Codex
  by hub ADR-030 and not here.
- A stop-time review gate. The Codex plugin has an optional one, and adding a second on the same
  event is a cost decision the operator has not made.

## Acceptance

Each check runs against a scratch repository with one planted defect in one file, and names the
oracle it reads.

- A review leg returns a findings object whose first finding names that file and the defect. Each
  finding carries the five fields, and the tree is byte-identical to before the run.
- A task leg leaves the planted defect fixed, and the result carries the engine's final response
  text. The result's conversation id names a file under agy's conversations directory whose step
  count grew by the turn the result reports. The result reads succeeded and verified.
- A task leg whose conversation file is removed between the engine's exit and the plugin's check
  reads succeeded and unverified, and says why.
- A follow-up with that id, asked what the previous turn changed, names that file. A run the
  caller marks fresh after that follow-up gets a new conversation id.
- A run started in the background is in state running while the engine process is alive. Its
  result can be read after the process has exited, from a later invocation of the status and result
  commands.
- A cancel while the engine is alive ends the process, and the record reads cancelled.
- Three runs each read failed with a reason, and none of them is rendered as a result: one whose
  engine exits before a `result` event, one whose `result` status is not success, and one whose
  schema-constrained output is not valid under the schema.
- A run that cannot start the engine reads failed, carries the requested model and effort, and
  says no confirmation arrived. Every other run's result names the model agy's `init` event
  reported, which equals the one requested, and the effort the run was given.
- The subagent is given a task with a routing flag. Its transcript has one tool call: the runtime,
  invoked with the task text intact and the flag removed. Its reply is the runtime's stdout,
  unchanged. Its description text names Antigravity and does not name Codex.
- Setup on a machine without `agy` says so, exits non-zero and writes nothing. With `agy`, it
  reports the version, the account state, the models, and the plugins and MCP servers agy lists.
- The suite asserts that every spawn in the runtime passes an executable and an argv array, and
  that no runtime file names a shell or passes a single command string.

## Open for this repository

Decided here before or during delivery: the plugin's command names; the schema's fields beyond the
five named; the job record's layout and location; the marketplace name; and whether the repository
is public. The job record also needs a key of this repository's own. A job exists before the engine
returns a conversation id, and two runs in one conversation are two jobs. The conversation id and
the turn are therefore fields of the job, not its key, the same way the model plugin keeps job,
thread and turn apart.
