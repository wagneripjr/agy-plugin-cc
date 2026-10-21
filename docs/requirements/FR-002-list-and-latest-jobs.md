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
The `codex` plugin is the model here. Its status with no id lists recent jobs.

## Contract

1. **The workspace.** The workspace of an invocation is the git top-level directory of the
   directory it runs in, or that directory itself when it is not inside a git work tree. A job
   belongs to a workspace when the directory recorded for the job is the workspace root or lies
   inside it.
2. **Status with no job id lists jobs.** It lists the current workspace's jobs, newest first by the
   time each job was created, with ties broken by job id. It shows at most 10 jobs. Each entry gives
   the job id, its leg (review or task), its state, its verification outcome when it succeeded, the
   model it requested, and when it was created. `--all` lists the jobs of every workspace and adds
   each job's directory. A workspace with no jobs prints that it has none and exits 0.
3. **Result with no job id reports the newest job.** It reports the current workspace's newest job,
   exactly as `result <that job's id>` would. A workspace with no jobs prints that it has none and
   exits non-zero.
4. **Cancel still needs a job id.** Cancel with no id starts nothing, says that cancel needs a job id
   and that status lists them, and exits with the usage code. A cancel is never aimed at a job the
   caller did not name.
5. **Listing only reads.** Listing and the no-id result change no job record, start no process
   besides the reader itself, and never wait for a running job.
6. **No prompt text.** No listing entry and no `--json` field carries prompt text (ADR-002).
7. **The same surface.** `--json` gives the same information as one JSON document: an array of
   entries for status, and the result report for result. The forwarding subagent's routing grammar
   is unchanged, and an empty request reaches the runtime as status with no id.

## Acceptance

Each check uses its own empty job store and the stand-in engine, unless it says otherwise.

- **Listing order and fields.** Three jobs are started in one workspace, one after another. A task
  succeeds, a review fails, and a background task is still running. Status with no id lists exactly
  those three, newest first. Each entry carries the five fields, and the succeeded task shows its
  verification outcome. The same command with `--json` yields an array whose order and values match.
- **Limit.** After 12 jobs in one workspace, status with no id lists exactly the 10 newest.
- **Workspace scoping.** Jobs are started in two separate fixture repositories. Status with no id,
  run from a subdirectory of the first repository, lists only the first repository's jobs. With
  `--all` it lists both repositories' jobs, each with its directory.
- **Outside git.** Run from a directory that is not inside a git work tree, status with no id lists
  only the jobs recorded for that directory.
- **Empty.** In a workspace with no jobs, status with no id says there are none and exits 0. Result
  with no id says there are none and exits non-zero.
- **Latest result.** After two jobs in one workspace, result with no id prints the same report, byte
  for byte, as result with the newer job's id. Its `--json` form equals that id's `--json` form.
- **Cancel needs an id.** Cancel with no id exits with the usage code, names status as the way to
  find ids, and leaves every job record byte-identical.
- **Read-only, non-blocking.** With a background job running, status with no id returns within 2
  seconds. The job store's files are byte-identical before and after, and the running job's engine
  is still alive afterwards.
- **No prompt text.** No byte sequence of any job's prompt appears in the status listing, its
  `--json` form, or the no-id result's output, other than inside a stored engine response.
- **Subagent.** The forwarding subagent, given an empty request, calls the runtime once as status
  with no id and replies with its output unchanged.

## Out of scope

Pagination beyond the newest 10, filtering by state or leg, deleting or pruning jobs, and listing
jobs across machines.
