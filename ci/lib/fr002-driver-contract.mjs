//status: Draft
export const DRIVER_MODULES = Object.freeze({
  listing: Object.freeze({ path: 'ci/drivers/fr002-listing-driver.mjs', factory: 'createListingDriver' }),
});

export const FACTORY_SIGNATURES = Object.freeze({
  createListingDriver: '(options: { repoRoot: string }) => Promise<ListingDriver>',
});

export const ACCEPTANCE_DEFINITIONS = Object.freeze({
  source: 'docs/requirements/FR-002-list-and-latest-jobs.md, sections Contract and Acceptance; the driver measures each definition exactly as written there. The FR-001 driver modules under ci/drivers/ may be reused; nothing here changes what FR-001 measures.',
  jobStore: "Each driver owns two job stores and one home, each a new empty directory outside every place it creates. The session's job store is selected by planting it as CLAUDE_PLUGIN_DATA. The default job store is the one the runtime selects when CLAUDE_PLUGIN_DATA is absent from its environment; it lies wherever the runtime's documented fallback puts it under the driver's home. Every runtime invocation the driver starts itself (delegations, readings and cancels) runs with HOME set to the driver's home, so no invocation ever reaches a store of the operator's. A request choosing the session's store plants CLAUDE_PLUGIN_DATA; one choosing the default store removes it from the environment. The subagent session alone runs with the operator's HOME, because Claude Code signs in from it, and always with the session's job store planted. The driver keeps no recording of its own inside either store. After creating a job in the default store, the driver confirms that a new file appeared under its home and that the session's job store did not change; otherwise it raises an InstrumentError, since the job did not land in the store the scenario named.",
  storeChoice: "STORE_CHOICES names the two stores: 'session' is the session's job store and 'default' is the default job store. Every request that takes a store and omits it means 'session'.",
  places: "A place is a directory the driver made for one scenario, named by its real path with every symlink resolved, except a symlink place, which is named by the link path. repository: a new git repository with one commit. subdirectory: a new directory inside the given place, whose name no other place shares. outside-directory: a new directory in which `git rev-parse --is-inside-work-tree` does not print true; the driver checks this before use and raises an InstrumentError when it does. prefix-sibling: a new directory beside the given place whose name is that place's name followed by further characters, so its path begins with the given path but not with the given path followed by \"/\". symlink: a symbolic link beside the given place that points to it. filesystem-root: \"/\"; the driver raises an InstrumentError when \"/\" lies inside a git work tree, and never creates a job there. removePlace deletes a subdirectory or prefix-sibling place and everything inside it, never touching either job store, and raises an InstrumentError for any other kind of place; the place keeps its name, and every later reading of the scenario is started from a place that still exists.",
  fromPlace: 'An invocation started from a place has that place as its working directory. Started from a symlink place, its working directory is given as the link path and PWD holds the link path, as a shell that entered through the link would leave them.',
  createdAtControl: "Every job the driver creates has as its createdAt exactly the instant the request names, written by the plugin runtime itself when it first creates the job's record. The driver achieves this by fixing the wall clock the runtime reads while it creates that record, never by writing, renaming or removing anything in a job store. Two requests naming the same instant give two jobs with equal createdAt values. Before createJob resolves, the driver reads the job's record in its store, without changing it, and raises an InstrumentError naming the job and both instants when the createdAt written there is not the requested instant; a scenario's ordering checks therefore never run on a fixture whose instants were not the ones it asked for. Separately, a job whose createdAt, as a listing reports it, differs from its requested instant makes confirmEntriesIdentify fail, naming the job and both instants.",
  jobCreation: "createJob starts one delegation from the request's place on the stand-in engine, in the store the request chooses, naming the request's model and the effort low, and resolves only when the job reads the state its kind defines in JOB_KINDS, read through the runtime's result with the job's id from the same store, and its createdAt has been confirmed as ACCEPTANCE_DEFINITIONS.createdAtControl defines. A held job resolves once its engine is alive, it has confirmed its model, and no write has reached the job store for 500 ms. A cancelled job is started as a held job and cancelled by its id. The returned handle carries the id the delegation's start report gave.",
  heldJob: "A held job's stand-in emits its init event, naming the requested model, and its first step event, then writes nothing at all: no event, no output, no file, until releaseHeldJob. Its job record therefore stays as it is once the job store has gone quiet. releaseHeldJob lets it finish as a success and resolves when the job reads succeeded.",
  markedPrompts: "A request carrying a marker delegates a task text, or a review focus, that contains the marker. Every FR-002 stand-in that emits a final response quotes, inside it, the whole prompt it received for its print option; a review stand-in also quotes it in the evidence of each finding. A marker confirmation first checks, from the stand-in's own record, that each marked job's engine received its marker and, when it emitted a final response, quoted it there; a marked job whose engine did not raises an InstrumentError, since the check would otherwise pass for want of a marker to find.",
  reading: "A reading is one runtime invocation with no job id, or result with one job's id, started from a place with the store the request chooses: status, status --all, result or cancel, plus --json when the form is machine-readable. A cancel always reads the session's store. It records the bytes printed on stdout and on stderr, the exit status, the wall time from its start to its exit, and every process start ACCEPTANCE_DEFINITIONS.processStarts defines. A reading that has not exited 10 seconds after it started is ended and recorded as not having returned.",
  readableEntries: "The readable listing's entries are found by job id: an entry begins where a job id first appears and runs to where the next listed job id first appears, or to the end. The listing lists a job when its id appears in it; the order is the order of first appearance. An entry gives a value when that value appears in it as a whole word: the leg (review or task), the state, the model, the createdAt exactly as status --json --all gives it, verified or unverified (unverified never counts as verified), and, for a directory, the job's directory path.",
  machineReadable: "The machine-readable listing is stdout parsed as one JSON document, which must be an array. Its elements, in order, are the listed jobs. Each element holds the strings id, leg (\"review\" or \"task\"), state (\"running\", \"succeeded\", \"failed\" or \"cancelled\"), model and createdAt (ISO 8601 in UTC, ending in Z), and verification, which is \"verified\" or \"unverified\" on a succeeded job and null on any other. directory, a string, is present on every element under --all and on none without it. A listing whose stdout is not one JSON array fails every confirmation that reads it.",
  directories: "A job's directory is the real path of the place it was created in; for a symlink place that is the real path of the directory the link points to, and a removed place keeps the real path it had when its job was created. A listing gives a job's directory when its entry gives that path; it gives no directory when no entry contains the real path of any place of the scenario, other than the filesystem root, nor the link path of a symlink place.",
  noJobsMessage: "A stream says the workspace has no agy jobs when its text, read case-insensitively, contains \"no agy jobs\". The readable listing of an empty workspace says it on stdout; the latest result of an empty workspace says it on stderr in both forms.",
  usageRefusal: "Cancel with no job id is refused as a usage error when it exits 2. Its error output says a job id is needed and names status as the way to list them when stderr, read case-insensitively, contains \"job id\" and the whole word status.",
  processStarts: "From driver creation until close, the driver observes, as it happens and never by sampling, every process started by a reading's own process and by every process descended from it, at any depth. The start of the reading's own process, which is the driver launching the invocation under test, is not one of them; every start that process makes, and every start its descendants make, is. A start is named by the base name of its executable; a node executable running the plugin runtime is named by the runtime subcommand it was given. A reading whose starts the driver could not observe makes every confirmStartedOnly on it fail, naming the reading, instead of passing.",
  storeSnapshot: "A snapshot of the job store is the set of (relative path, kind, SHA-256 of the bytes) for every entry under the session's job store and under the driver's home, which holds the default job store, walked recursively, directories included. Two snapshots match when the sets are equal; a mismatch names each path added, removed or changed, never its content.",
  equalListings: "Two listings are identical when, form by form, their stdout bytes, their stderr bytes and their exit statuses are equal.",
  rootListing: "The listing from the filesystem root equals the listing of every workspace, without directories, when its machine-readable array equals the --all array with directory removed from every element, its readable listing lists the same job ids in the same order as the readable --all listing, and both end with exit status 0. The --all listing must hold jobs of at least two places, or the confirmation raises an InstrumentError. The DSL also confirms, with confirmNoDirectories, that neither form of the root listing gives a directory.",
  sameResult: "The latest result is, byte for byte, the newest job's result when, form by form, its stdout bytes and stderr bytes equal those of result <newest job's id> read from the same place with the same form, and its exit status is the same.",
  resultReports: "The latest result reports a job as a state when, in the machine-readable form, its id is the job's id and its state is that state. It reports no body when the machine-readable result holds no response and no findings (each absent, null or empty) and the readable form carries no line of the engine's final response.",
  resultNames: "The latest result names a job when, in the machine-readable form, the result document's id is that job's id, and, in the readable form, that job's id appears on stdout and the id of no other job of the scenario does. It fails naming the id it found instead.",
  markerConfinement: "A listing carries a job's marker when any of its bytes, in either form, contains the marker. The latest result carries a marker only inside the engine's own output when, in each form: stderr holds no marker; when the newest job does not read succeeded, stdout holds no marker; and when it reads succeeded, every occurrence of any marker on stdout lies wholly inside a permitted copy, and the number of occurrences of each marker on stdout is at most its number in one copy of the newest job's final response plus one copy of each of its findings. A permitted copy is a verbatim copy of the final response, or of a field of a finding, that the newest job's engine itself emitted on its event stream, placed, in the machine-readable form, in the value of the result document's response member or inside its findings member, and nowhere else in that document; and, in the readable form, anywhere on stdout. A result that prints a response or a finding a second time, in another member of the document, again in the readable form, or on stderr, therefore fails, as does one that moves a response or a finding out of the response or findings member. When the newest job reads succeeded, its own marker must occur at least once, or the confirmation fails as having nothing to confine.",
  subagentRoute: "Headless Claude Code refuses to send a blank message to a model, so a blank request reaches the subagent through a parent: askSubagent starts one headless Claude Code session in the place, with the plugin loaded from this repository and the session's job store, and asks it to dispatch the plugin's forwarding subagent once with the request as the subagent's whole prompt. The two tool scopes are separate. The parent itself may use only the tool that dispatches a subagent. The subagent keeps the tool set its own definition grants, the shell and nothing else, and its tool uses run without a permission prompt. Neither scope is widened to make the other work: when the session cannot give the parent dispatch alone while the subagent keeps its shell, askSubagent raises an InstrumentError naming that. askSubagent resolves only once the subagent's own run has ended, as its own completion in the parent's event stream shows, whether the dispatch returned at once or ran in the background, and the parent session has exited; a subagent that has not ended 300 seconds after the dispatch is recorded as not having ended, and the confirmations read what was recorded. The driver confirms from the parent's event stream that exactly one dispatch happened, that its prompt equals the request byte for byte, that it named the plugin's forwarding subagent, and that the parent made no tool use of its own besides it; anything else raises an InstrumentError, since the subagent was then never given the request, or something other than the subagent acted. Nothing the parent or the subagent says in prose is evidence of delivery or forwarding. Once that dispatch is verified, what the runtime received is the product's doing: a wrong argv, a second runtime call or a reply that differs fails the confirmations below as a product failure. Every runtime invocation is recorded by the runtime-invocation recorder FR-001 uses, which records the argv and stdout the runtime itself received and printed.",
  oracleCounterexamples: "Each confirmation named in ORACLE_COUNTEREXAMPLES must be shown, by the code step, to fail on a reading crafted to match each case listed under it, before any RED or GREEN of this suite is credited; a confirmation that accepts one of them cannot fail for the wrong implementation it exists to catch.",
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

export const ORACLE_COUNTEREXAMPLES = Object.freeze({
  confirmMarkersConfinedToEngineOutput: Object.freeze([
    'a succeeded result that also prints its final response in another member of the result document',
    'a succeeded result that prints its final response twice in the readable form',
    'a succeeded result that also prints its final response on stderr',
    'a succeeded result whose final response sits in another member instead of the response member',
    'a failed result whose reason quotes the final response',
  ]),
  confirmResultNames: Object.freeze([
    "a result naming another job of the scenario",
    "a readable result naming the job and also another job of the scenario",
  ]),
});

export const STORE_CHOICES = Object.freeze(['session', 'default']);

export const PLACE_KINDS = Object.freeze(['repository', 'subdirectory', 'outside-directory', 'prefix-sibling', 'symlink', 'filesystem-root']);

export const READING_FORMS = Object.freeze(['readable', 'machine-readable']);

export const STREAMS = Object.freeze(['stdout', 'stderr']);

export const EXIT_STATUS = Object.freeze({ listed: 0, noJobsResult: 1, usage: 2 });

export const READ_DEADLINE_SECONDS = 2;

export const TYPES = Object.freeze({
  PlaceKind: 'one of PLACE_KINDS',
  PlaceHandle: 'opaque; one place the driver made, as ACCEPTANCE_DEFINITIONS.places defines it',
  JobKind: 'one of the keys of JOB_KINDS',
  StoreChoice: 'one of STORE_CHOICES',
  JobRequest: '{ place: PlaceHandle, kind: JobKind, createdAt: string (ISO 8601, UTC), model: string, store: StoreChoice, marker?: string }',
  JobHandle: "{ readonly id: string } and opaque otherwise; one job the runtime created, with the stand-in's own record of what it received and emitted",
  JobFacts: '{ job: JobHandle, leg: "review" | "task", state: "running" | "succeeded" | "failed" | "cancelled", model: string, createdAt: string, verification: "verified" | "unverified" | null }',
  MarkedJob: '{ job: JobHandle, marker: string }',
  ReadingForm: 'one of READING_FORMS',
  Stream: 'one of STREAMS',
  ListingRequest: '{ from: PlaceHandle, all: boolean, form: ReadingForm, store: StoreChoice }',
  LatestRequest: '{ from: PlaceHandle, form: ReadingForm, store: StoreChoice }',
  ResultRequest: '{ job: JobHandle, from: PlaceHandle, form: ReadingForm, store: StoreChoice }',
  CancelRequest: '{ from: PlaceHandle }',
  Reading: 'opaque; one reading as ACCEPTANCE_DEFINITIONS.reading defines it, with its request',
  StoreSnapshot: 'opaque; one snapshot as ACCEPTANCE_DEFINITIONS.storeSnapshot defines it',
});

export const ListingDriver = Object.freeze({
  createPlace: '(kind: PlaceKind, of?: PlaceHandle) => Promise<PlaceHandle>',
  createJob: '(request: JobRequest) => Promise<JobHandle>',
  removePlace: '(place: PlaceHandle) => Promise<void>',
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
  confirmResultNames: '(reading: Reading, job: JobHandle, others: readonly JobHandle[]) => Promise<void>',
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
