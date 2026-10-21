//status: Draft
export const DRIVER_MODULES = Object.freeze({
  listing: Object.freeze({ path: 'ci/drivers/fr002-listing-driver.mjs', factory: 'createListingDriver' }),
});

export const FACTORY_SIGNATURES = Object.freeze({
  createListingDriver: '(options: { repoRoot: string }) => Promise<ListingDriver>',
});

export const ACCEPTANCE_DEFINITIONS = Object.freeze({
  source: 'docs/requirements/FR-002-list-and-latest-jobs.md, sections Contract and Acceptance; the driver measures each definition exactly as written there. The FR-001 driver modules under ci/drivers/ may be reused; nothing here changes what FR-001 measures.',
  jobStore: 'Each driver owns one job store: a new empty directory, outside every place it creates, planted as CLAUDE_PLUGIN_DATA in every runtime invocation it starts (delegations, readings, cancels and the subagent session alike). The driver keeps no recording of its own inside it. No reading ever selects another store, so a reading from the filesystem root reads this store and never the store the runtime would fall back to.',
  places: 'A place is a directory the driver made for one scenario, named by its real path with every symlink resolved, except a symlink place, which is named by the link path. repository: a new git repository with one commit. subdirectory: a new directory inside the given place, whose name no other place shares. outside-directory: a new directory in which `git rev-parse --is-inside-work-tree` does not print true; the driver checks this before use and raises an InstrumentError when it does. prefix-sibling: a new directory beside the given place whose name is that place\'s name followed by further characters, so its path begins with the given path but not with the given path followed by "/". symlink: a symbolic link beside the given place that points to it. filesystem-root: "/"; the driver raises an InstrumentError when "/" lies inside a git work tree, and never creates a job there.',
  fromPlace: 'An invocation started from a place has that place as its working directory. Started from a symlink place, its working directory is given as the link path and PWD holds the link path, as a shell that entered through the link would leave them.',
  createdAtControl: "Every job the driver creates has as its createdAt exactly the instant the request names, written by the plugin runtime itself when it first creates the job's record. The driver achieves this by fixing the wall clock the runtime reads while it creates that record, never by writing, renaming or removing anything in the job store. Two requests naming the same instant give two jobs with equal createdAt values. A job whose createdAt, as status --json --all reports it, differs from its requested instant makes confirmEntriesIdentify fail, naming the job and both instants.",
  jobCreation: "createJob starts one delegation from the request's place on the stand-in engine, naming the request's model and the effort low, and resolves only when the job reads the state its kind defines in JOB_KINDS, read through the runtime's status with the job's id. A held job resolves once its engine is alive, it has confirmed its model, and no write has reached the job store for 500 ms. A cancelled job is started as a held job and cancelled by its id. The returned handle carries the id the delegation's start report gave.",
  heldJob: "A held job's stand-in emits its init event, naming the requested model, and its first step event, then writes nothing at all: no event, no output, no file, until releaseHeldJob. Its job record therefore stays as it is once the job store has gone quiet. releaseHeldJob lets it finish as a success and resolves when the job reads succeeded.",
  markedPrompts: "A request carrying a marker delegates a task text, or a review focus, that contains the marker. Every FR-002 stand-in that emits a final response quotes, inside it, the whole prompt it received for its print option; a review stand-in also quotes it in the evidence of each finding. A marker confirmation first checks, from the stand-in's own record, that each marked job's engine received its marker and, when it emitted a final response, quoted it there; a marked job whose engine did not raises an InstrumentError, since the check would otherwise pass for want of a marker to find.",
  reading: "A reading is one runtime invocation with no job id, or result with one job's id, started from a place with the driver's job store: status, status --all, result or cancel, plus --json when the form is machine-readable. It records the bytes printed on stdout and on stderr, the exit status, the wall time from its start to its exit, and every process start ACCEPTANCE_DEFINITIONS.processStarts defines. A reading that has not exited 10 seconds after it started is ended and recorded as not having returned.",
  readableEntries: "The readable listing's entries are found by job id: an entry begins where a job id first appears and runs to where the next listed job id first appears, or to the end. The listing lists a job when its id appears in it; the order is the order of first appearance. An entry gives a value when that value appears in it as a whole word: the leg (review or task), the state, the model, the createdAt exactly as status --json --all gives it, verified or unverified (unverified never counts as verified), and, for a directory, the job's directory path.",
  machineReadable: "The machine-readable listing is stdout parsed as one JSON document, which must be an array. Its elements, in order, are the listed jobs. Each element holds the strings id, leg (\"review\" or \"task\"), state (\"running\", \"succeeded\", \"failed\" or \"cancelled\"), model and createdAt (ISO 8601 in UTC, ending in Z), and verification, which is \"verified\" or \"unverified\" on a succeeded job and null on any other. directory, a string, is present on every element under --all and on none without it. A listing whose stdout is not one JSON array fails every confirmation that reads it.",
  directories: "A job's directory is the real path of the place it was created in. A listing gives a job's directory when its entry gives that path; it gives no directory when no entry contains the real path of any place of the scenario.",
  noJobsMessage: "A stream says the workspace has no agy jobs when its text, read case-insensitively, contains \"no agy jobs\". The readable listing of an empty workspace says it on stdout; the latest result of an empty workspace says it on stderr in both forms.",
  usageRefusal: "Cancel with no job id is refused as a usage error when it exits 2. Its error output says a job id is needed and names status as the way to list them when stderr, read case-insensitively, contains \"job id\" and the whole word status.",
  processStarts: "From driver creation until close, the driver observes, as it happens and never by sampling, every process start made by the processes of a reading: the reading's own process and every process it starts in turn. A start is named by the base name of its executable; a node executable running the plugin runtime is named by the runtime subcommand it was given. A reading whose starts the driver could not observe makes every confirmStartedOnly on it fail, naming the reading, instead of passing.",
  storeSnapshot: "A snapshot of the job store is the set of (relative path, kind, SHA-256 of the bytes) for every entry under it, walked recursively, directories included. Two snapshots match when the sets are equal; a mismatch names each path added, removed or changed, never its content.",
  equalListings: "Two listings are identical when, form by form, their stdout bytes, their stderr bytes and their exit statuses are equal.",
  rootListing: "The listing from the filesystem root equals the listing of every workspace, without directories, when its machine-readable array equals the --all array with directory removed from every element, its readable listing lists the same job ids in the same order as the readable --all listing, and both end with exit status 0. The --all listing must hold jobs of at least two places, or the confirmation raises an InstrumentError.",
  sameResult: "The latest result is, byte for byte, the newest job's result when, form by form, its stdout bytes and stderr bytes equal those of result <newest job's id> read from the same place with the same form, and its exit status is the same.",
  resultReports: "The latest result reports a job as a state when, in the machine-readable form, its id is the job's id and its state is that state. It reports no body when the machine-readable result holds no response and no findings (each absent, null or empty) and the readable form carries no line of the engine's final response.",
  markerConfinement: "A listing carries a job's marker when any of its bytes, in either form, contains the marker. The latest result carries a marker only inside the engine's own output when every occurrence of any marker in its stdout and stderr, in either form, lies wholly inside a copy, verbatim or JSON-escaped, of the final response or of a finding that the newest job's engine itself emitted on its event stream, and the newest job reads succeeded. When the newest job reads succeeded, its own marker must occur at least once, or the confirmation fails as having nothing to confine.",
  subagentRoute: "Headless Claude Code refuses to send a blank message to a model, so a blank request reaches the subagent through a parent: askSubagent starts one headless Claude Code session in the place, with the plugin loaded from this repository, the shell as its only allowed tool, and the driver's job store, and asks it to dispatch the plugin's subagent once with the request as the subagent's whole prompt. The driver confirms from the parent's event stream that exactly one dispatch happened and that its prompt equals the request byte for byte; anything else raises an InstrumentError, since the subagent was then never given the request. Every runtime invocation is recorded by the runtime-invocation recorder FR-001 uses, which records the argv and stdout the runtime itself received and printed.",
  subagentCall: "The subagent made exactly one tool call, to the plugin runtime, when its own events in the parent's stream hold exactly one tool use, a shell call, and the recorder holds exactly one runtime invocation whose parent is not itself a runtime invocation, started while the subagent ran.",
  statusWithoutId: 'The runtime was asked for status with no job id when that one recorded invocation received exactly the arguments ["status"].',
  subagentReply: "The subagent's reply is its final assistant text in the parent's event stream, after its tool call. It is the runtime's output, unchanged, when it equals the recorded invocation's stdout once trailing whitespace is removed from both, and that stdout is not empty.",
});

export const JOB_KINDS = Object.freeze({
  'task-succeeds-verified': Object.freeze({ leg: 'task', state: 'succeeded', verification: 'verified', engine: 'Completes as a success after recording its turn in a conversation file under the conversation store of the HOME it runs with: a user-input step (step_type 14) whose payload holds the prompt it received, and more steps after the run than before, so the plugin verifies the job.' }),
  'task-succeeds-unverified': Object.freeze({ leg: 'task', state: 'succeeded', verification: 'unverified', engine: 'Completes as a success and records no conversation file, so the plugin reads the job unverified.' }),
  'review-succeeds': Object.freeze({ leg: 'review', state: 'succeeded', verification: 'unverified', engine: 'Completes as a success with findings that satisfy the shipped schema, and records no conversation file.' }),
  'review-fails': Object.freeze({ leg: 'review', state: 'failed', verification: null, engine: 'Reports a final result whose status is not a success, with a final response, and exits 0.' }),
  'task-fails': Object.freeze({ leg: 'task', state: 'failed', verification: null, engine: 'Reports a final result whose status is not a success, with a final response, and exits 0.' }),
  'task-cancelled': Object.freeze({ leg: 'task', state: 'cancelled', verification: null, engine: 'Started in the background as a held job, then cancelled by its id.' }),
  'task-held-running': Object.freeze({ leg: 'task', state: 'running', verification: null, engine: 'Started in the background as a held job, as ACCEPTANCE_DEFINITIONS.heldJob defines.' }),
});

export const PLACE_KINDS = Object.freeze(['repository', 'subdirectory', 'outside-directory', 'prefix-sibling', 'symlink', 'filesystem-root']);

export const READING_FORMS = Object.freeze(['readable', 'machine-readable']);

export const STREAMS = Object.freeze(['stdout', 'stderr']);

export const EXIT_STATUS = Object.freeze({ listed: 0, noJobsResult: 1, usage: 2 });

export const READ_DEADLINE_SECONDS = 2;

export const TYPES = Object.freeze({
  PlaceKind: 'one of PLACE_KINDS',
  PlaceHandle: 'opaque; one place the driver made, as ACCEPTANCE_DEFINITIONS.places defines it',
  JobKind: 'one of the keys of JOB_KINDS',
  JobRequest: '{ place: PlaceHandle, kind: JobKind, createdAt: string (ISO 8601, UTC), model: string, marker?: string }',
  JobHandle: "{ readonly id: string } and opaque otherwise; one job the runtime created, with the stand-in's own record of what it received and emitted",
  JobFacts: '{ job: JobHandle, leg: "review" | "task", state: "running" | "succeeded" | "failed" | "cancelled", model: string, createdAt: string, verification: "verified" | "unverified" | null }',
  MarkedJob: '{ job: JobHandle, marker: string }',
  ReadingForm: 'one of READING_FORMS',
  Stream: 'one of STREAMS',
  ListingRequest: '{ from: PlaceHandle, all: boolean, form: ReadingForm }',
  LatestRequest: '{ from: PlaceHandle, form: ReadingForm }',
  ResultRequest: '{ job: JobHandle, from: PlaceHandle, form: ReadingForm }',
  CancelRequest: '{ from: PlaceHandle }',
  Reading: 'opaque; one reading as ACCEPTANCE_DEFINITIONS.reading defines it, with its request',
  StoreSnapshot: 'opaque; one snapshot as ACCEPTANCE_DEFINITIONS.storeSnapshot defines it',
});

export const ListingDriver = Object.freeze({
  createPlace: '(kind: PlaceKind, of?: PlaceHandle) => Promise<PlaceHandle>',
  createJob: '(request: JobRequest) => Promise<JobHandle>',
  releaseHeldJob: '(job: JobHandle) => Promise<void>',
  snapshotStore: '() => Promise<StoreSnapshot>',
  listJobs: '(request: ListingRequest) => Promise<Reading>',
  readLatestResult: '(request: LatestRequest) => Promise<Reading>',
  readResultOf: '(request: ResultRequest) => Promise<Reading>',
  cancelWithoutId: '(request: CancelRequest) => Promise<Reading>',
  askSubagent: '(place: PlaceHandle, request: string) => Promise<void>',
  close: '() => Promise<void>',

  confirmListsExactly: '(reading: Reading, expected: readonly JobHandle[]) => Promise<void>',
  confirmEntriesIdentify: '(reading: Reading, facts: readonly JobFacts[]) => Promise<void>',
  confirmVerificationOnlyOnSucceeded: '(reading: Reading, facts: readonly JobFacts[]) => Promise<void>',
  confirmNoDirectories: '(reading: Reading, places: readonly PlaceHandle[]) => Promise<void>',
  confirmDirectoriesGiven: '(reading: Reading, jobs: readonly { job: JobHandle, place: PlaceHandle }[]) => Promise<void>',
  confirmIdentical: '(a: Reading, b: Reading) => Promise<void>',
  confirmRootListing: '(root: { readable: Reading, machineReadable: Reading }, all: { readable: Reading, machineReadable: Reading }) => Promise<void>',
  confirmSaysNoJobs: '(reading: Reading, stream: Stream) => Promise<void>',
  confirmEmptyList: '(reading: Reading) => Promise<void>',
  confirmPrintsNothing: '(reading: Reading, stream: Stream) => Promise<void>',
  confirmExitStatus: '(reading: Reading, status: number) => Promise<void>',
  confirmSameResult: '(latest: Reading, byId: Reading) => Promise<void>',
  confirmResultReports: '(reading: Reading, job: JobHandle, state: string) => Promise<void>',
  confirmNoBody: '(reading: Reading) => Promise<void>',
  confirmNamesStatusForIds: '(reading: Reading) => Promise<void>',
  confirmStoreMatches: '(before: StoreSnapshot) => Promise<void>',
  confirmReturnedWithin: '(reading: Reading, seconds: number) => Promise<void>',
  confirmEngineRunning: '(job: JobHandle) => Promise<void>',
  confirmStartedOnly: '(reading: Reading, allowed: readonly string[]) => Promise<void>',
  confirmMarkersAbsent: '(reading: Reading, marked: readonly MarkedJob[]) => Promise<void>',
  confirmMarkersConfinedToEngineOutput: '(reading: Reading, marked: readonly MarkedJob[], newest: JobHandle) => Promise<void>',

  confirmSubagentMadeOneRuntimeCall: '() => Promise<void>',
  confirmRuntimeAskedForStatusWithoutId: '() => Promise<void>',
  confirmSubagentReplyIsRuntimeOutput: '() => Promise<void>',
});
