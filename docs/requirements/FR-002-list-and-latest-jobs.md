---
id: FR-002
type: Requirement
status: Draft
title: "FR-002: Status with no job id lists jobs, and result with no job id shows the latest"
description: A session can find its agy jobs without remembering their ids. Status with no id lists the workspace's jobs newest first, and result with no id reports the newest one.
derives-from: [hub:R-121]
adrs: [ADR-001, ADR-002]
---
# FR-002: Status with no job id lists jobs, and result with no job id shows the latest

**Raised**: 2026-10-21

FR-001 makes status, result and cancel require a job id, and nothing lists the ids. A session that
did not keep the id from a job's start report cannot find its job.

## Source

The operator found the gap on first use: `/agy:status` with no arguments printed usage and failed.
The `codex` plugin is the model here. Its status with no id lists recent jobs, but its preference
for finished jobs is not adopted.

## Contract

1. **The job store.** Listing reads only the job store the invocation selects, the same one FR-001's
   commands use: `CLAUDE_PLUGIN_DATA/jobs` when that variable is set, else the runtime's documented
   fallback. Other stores are never searched.
2. **The workspace.** An invocation's workspace root is the real path, with every symlink resolved,
   of the git top-level directory of the directory it runs in. Outside a git work tree it is the real
   path of that directory. A job's directory is the real path of the directory recorded for the job,
   or the recorded path unchanged when it no longer exists. A job belongs to the workspace when its
   directory equals the root, or begins with the root followed by `/`, or the root is `/` itself
   (every absolute directory lies under `/`). A sibling such as `/work2` is therefore not inside
   `/work`.
3. **Order.** Jobs are ordered newest first by the `createdAt` value written when the job record is
   first created. Later updates to a record do not move it. Equal `createdAt` values are ordered by
   job id, descending in byte order. "Newest job" means the first job in this order.
4. **Status with no job id lists jobs.** It prints the newest 10 jobs of the workspace in that order.
   Every entry gives the job id, its leg (review or task), its state, the model it requested, and
   its `createdAt`. A succeeded entry also gives its verification outcome, verified or unverified.
   `--all` drops the workspace filter: it prints the newest 10 jobs of the whole store, across
   workspaces, in the same order, and adds each job's directory. Status with no id exits 0, whether
   it found jobs or not.
5. **Result with no job id reports the newest job.** It prints exactly what `result <newest job's id>`
   prints, with the same exit status, whatever that job's state is. An older succeeded job never
   takes precedence over a newer running, failed or cancelled one.
6. **Empty workspace.** Status with no id prints, on stdout, that the workspace has no agy jobs, and
   exits 0. With `--json` it prints `[]`. Result with no id prints the same message on stderr,
   prints nothing on stdout, with or without `--json`, and exits 1.
7. **JSON shape.** Status `--json` prints one JSON array. Each element has the string fields `id`,
   `leg` (`"review"` or `"task"`), `state` (`"running"`, `"succeeded"`, `"failed"` or
   `"cancelled"`), `model` and `createdAt` (ISO 8601, UTC). `verification` is `"verified"` or
   `"unverified"` on a succeeded job and `null` otherwise. `directory`, a string, is present only
   under `--all`. Result `--json` with no id
   prints the same document as `result <id> --json`.
8. **Cancel still needs a job id.** Cancel with no id starts nothing and changes no record. It says
   on stderr that cancel needs a job id and that status lists them, and exits 2, the usage code.
9. **Listing only reads.** Status and result with no id change no job record and wait for no job. The
   only process they start is `git`, to find the workspace root.
10. **Prompt text stays where FR-001 allows it.** No status entry, in either form, carries any part of
    a job's prompt. A no-id result carries prompt text only where `result <id>` would: inside the
    engine's own response or findings of a succeeded job.
11. **The subagent.** A request to the forwarding subagent that is empty or only whitespace reaches
    the runtime as status with no id. Every other request keeps FR-001 contract 8's grammar. Like
    FR-001's subagent checks, this runs a live Claude Code subagent. The runtime-invocation recorder
    observes the call, so the check reads what the runtime received, not what the model says.

## Acceptance

Each check uses its own empty job store and the stand-in engine, except the subagent check.

- **Listing order and fields.** In one workspace, these jobs are created one after another: a task
  that succeeds verified, a task that succeeds unverified, a review that fails, a task that is
  cancelled, and a background task held running. Status with no id lists exactly those five, newest
  first. Each entry carries id, leg, state, model and `createdAt`. The two succeeded entries show
  verified and unverified, and no other entry shows a verification. The `--json` array has the same
  order and values, with `verification: null` on the three non-succeeded entries and no `directory`
  field.
- **Order is by creation, not update.** Two jobs are given equal `createdAt` values. They are listed
  by job id, descending. An older job whose record is updated after a newer job was created still
  lists after the newer one.
- **Limit.** After 12 jobs in one workspace, status with no id lists exactly the 10 newest.
- **Across workspaces.** Twelve jobs are created alternately in two fixture repositories. From a
  subdirectory of the first repository, status with no id lists only that repository's six jobs.
  With `--all` it lists the 10 newest of all twelve, in global order, each with its directory.
- **Workspace boundaries.** Outside any git work tree, from a directory `D`, status with no id lists
  jobs recorded in `D` and in its subdirectories. It omits jobs recorded in a sibling whose path
  merely starts with `D`'s name. Run from a symlink to `D`, it lists the same jobs as from `D`. When
  `D` is `/`, every job is listed.
- **Empty.** In a workspace with no jobs, status with no id prints the no-jobs message on stdout and
  exits 0, and `--json` prints `[]`. Result with no id prints the no-jobs message on stderr, nothing
  on stdout, and exits 1.
- **Latest result.** After an older succeeded job and a newer failed job, result with no id prints
  byte for byte what result with the failed job's id prints, with the same exit status. Its `--json`
  form equals that id's `--json` form. A newer running job reports running with no body, and a newer
  cancelled job reports cancelled.
- **Cancel needs an id.** Cancel with no id exits 2, names status on stderr as the way to find ids,
  starts no process and leaves every job record byte-identical.
- **Read-only.** A background job is held running by a stand-in that writes nothing after its start.
  Status and result with no id each return within 2 seconds. The whole job store is byte-identical
  before and after both. The held job's engine is still alive. Neither command started any process
  other than `git`.
- **No prompt text.** Each job's prompt carries a unique random marker, and the stand-in's response
  quotes it. The marker appears in no status listing, in either form. In the no-id result it appears
  only inside the engine response, or the findings, of a succeeded job.
- **Subagent.** Given an empty request, and separately a whitespace-only request, the forwarding
  subagent's single runtime call is recorded as status with no id. Its reply equals the runtime's
  output.

## Out of scope

Pagination beyond the newest 10, filtering by state or leg, deleting or pruning jobs, other job
stores, and listing jobs across machines.
