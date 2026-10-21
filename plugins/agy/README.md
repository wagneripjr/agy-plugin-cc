# agy

A Claude Code plugin that hands a review or a task to Antigravity (`agy`) and tracks it as a job.

## Install

```
/plugin marketplace add wagneripjr/agy-plugin-cc
/plugin install agy@agy-plugin-cc
```

It needs the Antigravity CLI (`agy`) on your `PATH`, signed in. Run `/agy:setup` to check.

## Commands

- `/agy:task [--background|--wait] [--fresh|--resume <job-id>] [--model <m>] [--effort <e>] <task>`
  runs a task in agy's default mode. The task may edit the working tree.
- `/agy:review [same options] [focus]` runs a read-only review in plan mode and returns
  schema-checked findings.
- `/agy:status [<job-id>] [--all] [--json]`: given an id, reports that job. Without one, it lists
  this workspace's 10 newest jobs.
- `/agy:result [<job-id>] [--json]` reports a job, or the newest one when no id is given.
- `/agy:cancel <job-id>` ends a running job.
- `/agy:setup` reports agy's version, account, models, plugins and MCP servers. It changes nothing.

The `agy:agy-delegate` subagent forwards a request to the same runtime and returns its report
unchanged.

## Engine settings

A delegation that names no model or effort asks the engine for these:

- Default model: `gemini-4-argon`
- Default effort: `medium`

## What a job proves

Every run is a job with one terminal state: succeeded, failed or cancelled. A succeeded job is
checked against agy's own conversation file, and its report reads verified or unverified.

## Security

agy runs as your user. A task is not sandboxed, because agy's sandbox blocks the shell from the
workspace. The plugin starts agy on an allowlisted environment (`PATH`, `HOME`, `USER`, `LOGNAME`,
`SHELL`, `TMPDIR`, `LANG`, `LC_*`) and drops any value that carries the Claude Code or Codex
session's settings. The job store keeps prompt digests, never prompt text.

agy can still read any file your user can read, Claude Code transcripts included. Delegate to it
only work you would let such a process do. `SSH_AUTH_SOCK` and proxy variables are not passed.
