---
id: FR-001
type: Requirement
status: Draft
title: "FR-001: Antigravity is a delegation target beside Codex"
description: A session hands a review or a task to agy through one plugin, and every agy leg a session runs goes through it, as a tracked, resumable, verifiable job.
derives-from: [hub:R-121]
adrs: [hub:ADR-014, hub:ADR-011, ADR-001, ADR-002]
specs: [ci/features/FR-001-*.feature, ci/test-fr001-*.mjs]
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
probes below and the ones ADR-001 records before building on them.

## Frozen interfaces

These are agy's own interfaces, which this repository does not own. They were measured on `agy`
1.4.2, in addition to ADR-001's probes. The contract relies on them, and an implementation re-checks
them if the engine moves.

- `--mode plan --json-schema <schema> --output-format stream-json` emits `init` (carrying
  `init.model`) and a final `result` whose `structured_output` holds the schema object. It does not
  edit the tree. Both legs therefore read the same event stream.
- `result.status` reads `SUCCESS` on success. `result.num_turns` read 2 for a single
  schema-constrained invocation, so it does not count invocations.
- A conversation is the SQLite file `~/.gemini/antigravity-cli/conversations/<conversation_id>.db`.
  Its `steps` table is keyed by `idx`, and a user-input step has `step_type` 14. One
  schema-constrained invocation wrote two user-input steps, and only the first carried the prompt
  text. The prompt text is stored readable inside that step's `step_payload`.
- `init` does not report the effort. agy has no account command; `agy models` lists models only for
  a usable account. `agy mcp list` and `agy plugin list` enumerate configured MCP servers and
  installed plugins.

## Contract

1. **A delegation names its engine settings and the engine confirms the model.** Every run is
   started with an explicit `--model` and `--effort`, chosen by the caller or by the plugin's
   documented defaults, never omitted so that agy picks. The job record keeps the argv it spawned,
   with the prompt argument replaced by its SHA-256 digest, so the job store holds no prompt text.
   A run that reached `init` records `init.model`. If that differs from the requested model, the
   plugin ends the engine process and the run is failed, with a reason naming both models. The
   effort is recorded as requested, and the result says the engine does not confirm it. A run that
   ended before `init`, including one whose engine never started, carries the requested settings
   and says no confirmation arrived.
2. **A review leg returns findings, never prose, and cannot write.** A review runs `--mode plan`
   with a findings schema the plugin ships. Each finding in it carries at least a file, a line, a
   claim, the evidence checked and a verdict. The review's result is the structured output of
   agy's final `result` event. Output that does not validate against that schema makes the run failed. The run's result is then
   not rendered as findings, and the response prose is not shown in their place. The working
   tree is unchanged after a review leg, as defined under Acceptance.
3. **A task leg may edit, and it reports what it did.** A task runs in agy's default mode and never
   with `--sandbox`. It returns the engine's final response and the conversation id. The tree is
   whatever the engine left.
4. **Every run is a tracked job with one terminal state.** A job is `running` from the moment its
   record is created until the engine process has exited and the plugin has assigned exactly one of
   `succeeded`, `failed` or `cancelled`. It is succeeded only when all of these hold: a `result`
   event arrived, its status is `SUCCESS`, any requested schema validated, the model matched, and
   the process exited 0. Otherwise it is failed, with the first reason the plugin saw. The possible
   reasons are: the engine could not start, the process exited without a `result` event,
   `result.status` was not `SUCCESS`, the output violated the schema, the model mismatched, or the
   exit code was nonzero after a `SUCCESS` result. A cancel that arrives while the job is running
   ends the engine process and records cancelled. A cancel on a terminal job changes nothing and
   reports the state the job already has. The first terminal state written is final. Status and
   result read the same record. A result on a running job reports running and no body. A result on
   a failed or cancelled job reports the state, the reason and the engine settings, and no response
   or findings body.
5. **A job is resumable, and resuming is a choice.** An invocation that names no prior job starts a
   fresh conversation, and an explicit fresh marker selects the same thing. A follow-up names a
   prior job and continues that job's recorded conversation with `--conversation <id>`. A follow-up
   naming a job that has no recorded conversation id fails before spawning agy, with a reason. A
   follow-up answers with the prior turns in context. A fresh run's conversation holds no turn of an
   earlier job.
6. **Proof is tied to the invocation.** Every prompt the plugin sends carries the job's id as a
   marker. When the engine reports success, the plugin opens the conversation file named by the
   conversation id. It records the `idx` of the user-input step, as defined under Frozen
   interfaces, whose payload
   contains that marker, and the step count before and after the invocation (0 before, for a fresh
   conversation). The result names the conversation id, the conversation file, that step `idx` and
   both counts. A succeeded run carries a verification outcome, either verified or unverified. It
   is verified when the file exists, contains the marked user-input step, and its step count is
   larger than before the invocation. It is unverified otherwise, and the result names which of the
   three failed. Unverified is not a fifth state. It is a property of succeeded, and the result
   states it.
7. **Background and foreground share one surface.** A run started in the background survives the
   command that started it: that command returns while the engine is still running. Its status and
   result are read through the same commands as a foreground run's. A foreground run's record is
   readable through those same commands after it ends.
8. **A forwarding subagent forwards.** The plugin ships exactly one subagent, and its tool set is the
   shell alone. Its transcript for a delegation holds exactly one tool call: the plugin runtime.
   The routing flags are the leading run of tokens drawn from the valueless `--background`,
   `--wait` and `--fresh`, and the value-taking `--resume <job-id>`, `--model <value>` and
   `--effort <value>`. A value-taking flag consumes the next token as its value. The run ends at the
   first token that is neither a flag in the set nor a value one of them consumed, or at `--`. The routing flags go to the runtime as flags, and everything after them is the
   task text, passed byte for byte, including any token that looks like a flag. The subagent's reply
   is the runtime's stdout verbatim, with nothing before or after it. Its description names
   Antigravity and does not name Codex, so a model that wants a second lens picks it on purpose.
9. **Skills and MCP are the engine's, and setup reports which ones are loaded.** The runtime
   never runs `agy mcp add|remove|enable|disable` or `agy plugin install|uninstall|enable|disable|import`,
   and it passes no argument that adds a skill, plugin or MCP server to a run. Setup reports
   whether `agy` is on the path, its version (`agy --version`), and the account state. The account
   state is usable when `agy models` exits 0 with a model list, and unavailable otherwise, with
   agy's message. Setup also reports the models listed, and the plugins and MCP servers that
   `agy plugin list` and `agy mcp list` report. Setup runs only those four commands. It exits
   non-zero and writes nothing when `agy` is absent.
10. **The runtime rule is ADR-014's.** The runtime is zero-dependency Node `.mjs`. Every process the
    plugin starts is an executable plus an argv array, with `shell` absent or false. No runtime file
    names a shell or passes a command string. A job spawns at most one agy process. A job that fails
    before spawning, such as a follow-up with no recorded conversation id, spawns none. A job's
    agy process has exited before its terminal state is written, because the state is assigned at
    process exit. Any process the plugin started to run or wait on that job may write the terminal
    state, and has exited within 5 seconds of the moment the record first reads terminal. Status and
    result invocations are readers. They are not part of any job, and they exit after printing.
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

**Fixture.** Each engine run gets its own new git repository. A scenario that only checks facts of
one kind of run (task, review, follow-up or background) may check a run of that kind made once per
suite invocation. A scenario whose check mutates or depends on its own run gets a run of its own:
the unchanged-tree, tamper, recall and fresh-versus-follow-up checks. Each repository has one commit
holding three files:

- `math.mjs`, whose `add(a, b)` returns `a - b` on line 2. This is the planted defect.
- `strings.mjs`, a correct `upper(s)`.
- `README.md`.

**Unchanged tree.** A tree is unchanged when two things are identical before and after the run:
the output of `git status --porcelain --untracked-files=all --ignored`, and the set of
(relative path, SHA-256) pairs for every regular file under the fixture root outside `.git/`,
walked recursively, including files inside ignored directories. Job records live outside the
fixture repository, so they never take part in this comparison.

**Fixed defect.** The defect is fixed when `node --input-type=module -e "import('./math.mjs').then(m=>process.exit(m.add(2,3)===5?0:1))"`
exits 0 in the fixture.

The checks:

- **Review.** A review leg returns a findings object that validates against the shipped schema. Its
  first finding's `file` resolves to the fixture's `math.mjs`, and its `line` is 2. Every finding
  carries the five fields, and the tree is unchanged.
- **Review proof.** The same review's result reads succeeded and verified. It names the conversation
  file, the marked step `idx` and both step counts.
- **Task.** A task leg leaves the defect fixed. Its result carries the engine's final response text
  and reads succeeded and verified, and it names a conversation file under
  `~/.gemini/antigravity-cli/conversations/` whose step count after the run exceeds the count before it.
- **Missing conversation file.** In a separate fixture, a task leg's conversation file is removed
  between the engine's exit and the plugin's check. The result reads succeeded and unverified, and
  names the missing file as the reason.
- **Turn not added.** In a separate fixture, a follow-up's conversation file is replaced, between the
  engine's exit and the plugin's check, with the copy taken before the follow-up started. The result
  reads succeeded and unverified, and names the absent marked step as the reason.
- **Follow-up recall.** A task leg runs. Its task text also gives a codeword generated randomly for
  this test and tells the engine not to write it anywhere, so the codeword is absent from the
  fixture tree and its git history. A follow-up on that job asks: "What codeword did I give you in
  the previous turn? Answer with the codeword only." The follow-up's response contains the codeword,
  and it reuses the job's conversation id. A fresh run in the same fixture asks the same question.
  It gets a different conversation id. Its conversation file held 0 steps before it started, and that
  file holds no user-input step carrying the earlier job's marker. The fresh run's response is not
  checked, because an unsandboxed engine can find the codeword on disk (ADR-002).
- **Stored prompts.** After a review, a task, a follow-up and a background task, no file in the job
  store contains any job's prompt text, and each recorded argv carries the prompt only as its
  SHA-256 digest. A stored engine response may quote the prompt, so responses are not checked.
- **Missing conversation id.** A follow-up naming a job whose record has no conversation id reads
  failed before any agy process is spawned.
- **Background.** A run started in the background returns from the starting command while the engine
  process is alive. Status reads running for as long as that process is alive. A result read during
  that time reports running and no body. After the process exits, a later, separate invocation of
  the status and result commands reads the terminal state. A foreground run's record reads the same
  way through those commands.
- **Cancel.** A cancel while the engine is alive ends the process, and the record reads cancelled. A
  cancel on that now-terminal job leaves it cancelled.
- **Failures.** Each of the following reads failed with its reason, and its result carries no
  response or findings body:
  - a run whose engine exits before a `result` event;
  - a run whose `result.status` is not `SUCCESS`;
  - a run whose schema-constrained output does not validate;
  - a run whose process exits nonzero after a `SUCCESS` result;
  - a run whose `init.model` differs from the requested model.
- **Engine settings.** A run whose engine cannot be started reads failed, carries the requested
  model and effort, and says no confirmation arrived. So does a run whose engine starts and exits
  before `init`. Every run that reached `init` names `init.model`, and its recorded argv contains
  `--model` with the requested model and `--effort` with the requested effort.
- **Legs.** Every recorded argv contains `--output-format stream-json`. Its only agy flags are
  `--print`, `--output-format`, `--model`, `--effort`, `--mode`, `--json-schema` and
  `--conversation`, so no flag adds a skill, plugin, MCP server, agent, project or directory to a
  run. A review leg's argv contains `--mode plan` and `--json-schema`. A task leg's argv contains
  neither `--mode plan` nor `--sandbox`.
- **Processes.** Every job records at most one agy spawn, and the missing-conversation-id job records
  none. At the moment the record first reads terminal, the job's recorded agy process is not alive.
  Five seconds after that moment, no process the plugin started for that job is alive. Each status
  and result invocation exits after printing.
- **Subagent.** The plugin ships exactly one agent definition, and its tools are the shell alone. Given
  `--background fix the --fresh parser`, its transcript has one tool call: the runtime, invoked
  with the background flag and the task text `fix the --fresh parser`. Given
  `--resume J1 --effort low what did you change`, the runtime receives resume `J1`, effort `low`,
  and the task text `what did you change`. Its reply is the runtime's stdout, unchanged. Its description text names Antigravity and does not name Codex.
- **Setup.** On a machine without `agy`, setup says so, exits non-zero and writes nothing. With `agy`,
  it reports the version, the account state, the models, and the plugins and MCP servers that agy
  lists. The only agy invocations it spawns are `--version`, `models`, `plugin list` and `mcp list`.
- **Runtime rule.** The suite asserts the following:
  - every runtime file is `.mjs`;
  - the plugin declares no package dependency;
  - every spawn passes an executable and an argv array, with no `shell: true`;
  - no runtime file names a shell or passes a single command string;
  - no runtime file spawns an agy subcommand that changes MCP servers or plugins.

## Open for this repository

Decided here before or during delivery: the plugin's command names; the schema's fields beyond the
five named; the job record's layout and its location outside the working tree; the documented
default model and effort; the marketplace name; and whether the repository is public. A job's key
belongs to this repository. A job exists before the engine returns a conversation id, and two runs
in one conversation are two jobs. The conversation id and the marked step are therefore fields of
the job, not its key.
