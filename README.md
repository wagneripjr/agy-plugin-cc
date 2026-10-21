---
type: Readme
title: agy-plugin-cc
description: A Claude Code plugin that makes Antigravity (agy) a delegation target beside Codex, with tracked, resumable, verifiable jobs.
---
# agy-plugin-cc

A Claude Code plugin marketplace with one plugin, `agy`. The plugin hands a review or a task to
the Antigravity CLI (`agy`) and gets back a tracked, resumable, verifiable job: a second lens from
a different engine than Claude.

```
/plugin marketplace add wagneripjr/agy-plugin-cc
/plugin install agy@agy-plugin-cc
```

See [plugins/agy/README.md](plugins/agy/README.md) for commands, defaults and the security model.

## Requirements

- Claude Code with plugin support
- The Antigravity CLI `agy`, signed in. It was measured against 1.4.2 through 1.4.4.
- Node.js 22.5 or newer. The runtime has no npm dependencies, and it reads agy's conversation files
  with `node:sqlite`.

## Repository

- `plugins/agy/` is the plugin: commands, the forwarding subagent and the Node runtime.
- `ci/` holds the acceptance suites. Run `node ci/test-fr001-acceptance.mjs` and
  `node ci/test-fr002-acceptance.mjs`. FR-001's suite runs the installed agy.
- `docs/` holds the requirements, ADRs, bug records and the traceability matrix.

## License

MIT. See [LICENSE](LICENSE).
