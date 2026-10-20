---
type: Vision
title: Vision
description: Antigravity becomes a managed delegation target for Claude Code sessions, with the same job record, structured findings and proof that the Codex plugin gives Codex.
---
# Vision

## Purpose

A Claude Code session has one delegation target with a managed runtime: Codex, through the `codex`
plugin. That plugin gives review, rescue, status, result and cancel, background jobs, structured
findings, and a job record that a reader checks against the engine's own files. Every other engine
is reached by a raw CLI call from the model's shell. That leaves no job record and no structured
findings, and the reader has to reconstruct the proof by hand from whatever the engine wrote.

This plugin gives Antigravity (`agy`) the same footing. Its Argon model family is a distinct engine
from both Claude and GPT, which is what a second lens needs. On `agy` 1.4.2 it runs headless.

## Target users

- **The operator.** Wagner delegates coding tasks and reviews to agy, with the skills and MCP
  servers agy already loads.
- **Claude Code sessions.** A session that wants a second lens chooses between this plugin and the
  Codex one on purpose.

## Success criteria

- Every agy leg a session runs goes through this plugin. A raw `agy -p` from the shell is the
  deprecated form.
- A review returns schema-valid findings and leaves the tree unchanged. A task returns the engine's
  final response.
- Every run is a tracked job whose terminal state, engine settings and proof of its turn can be
  read back after it ends, including from a later session.
- The plugin ships standalone, as zero-dependency Node with no shell. It installs nothing into agy.
