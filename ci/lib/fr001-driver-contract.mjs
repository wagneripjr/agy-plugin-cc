//status: Approved
export const DRIVER_MODULES = Object.freeze({
  delegation: Object.freeze({ path: 'ci/drivers/fr001-delegation-driver.mjs', factory: 'createDelegationDriver' }),
  pluginSource: Object.freeze({ path: 'ci/drivers/fr001-plugin-source-driver.mjs', factory: 'createPluginSourceDriver' }),
});

export const FACTORY_SIGNATURES = Object.freeze({
  createDelegationDriver: '(options: { repoRoot: string }) => Promise<DelegationDriver>',
  createPluginSourceDriver: '(options: { repoRoot: string }) => Promise<PluginSourceDriver>',
});

export const ACCEPTANCE_DEFINITIONS = Object.freeze({
  source: 'docs/requirements/FR-001-agy-delegation-target.md, section Acceptance; the driver measures each definition exactly as written there',
  fixture: 'Each engine run gets its own new git repository. A scenario that only checks facts of one kind of run (task, review, follow-up or background) may check a run of that kind made once per suite invocation. A scenario whose check mutates or depends on its own run gets a run of its own: the unchanged-tree, tamper, recall and fresh-versus-follow-up checks. Each repository has one commit holding three files: math.mjs, whose add(a, b) returns a - b on line 2 (the planted defect); strings.mjs, a correct upper(s); README.md.',
  unchangedTree: 'A tree is unchanged when two things are identical before and after the run: the output of `git status --porcelain --untracked-files=all --ignored`, and the set of (relative path, SHA-256) pairs for every regular file under the fixture root outside `.git/`, walked recursively, including files inside ignored directories. Job records live outside the fixture repository, so they never take part in this comparison.',
  fixedDefect: `The defect is fixed when node --input-type=module -e "import('./math.mjs').then(m=>process.exit(m.add(2,3)===5?0:1))" exits 0 in the fixture.`,
  conversationStore: 'A conversation is the SQLite file ~/.gemini/antigravity-cli/conversations/<conversation_id>.db. Its steps table is keyed by idx, and a user-input step has step_type 14 with the prompt text readable inside its step_payload.',
  lingerWindow: 'The observation origin is the moment the job record first reads terminal; the window closes 5 seconds after that origin.',
  sessionEnvironment: 'From useSessionEnvironment on, every runtime invocation the driver makes (delegation, status, result, cancel, setup) is started with the environment the driver would otherwise give it plus SESSION_ENVIRONMENT.planted, each set as Claude Code sets it for a plugin command: CLAUDE_PLUGIN_DATA is the job store the driver already isolates; CLAUDE_PLUGIN_ROOT is the absolute path of the shipped plugin root; CODEX_COMPANION_TRANSCRIPT_PATH is the absolute path of a transcript file the driver creates, outside the job store and every fixture project, holding a line that carries the session id; CODEX_COMPANION_SESSION_ID is a session id minted once per driver. Beside them the driver plants every entry of the sentinels of the SessionEnvironment it was given with exactly its name and value. A planted value overrides any value the suite itself inherited under the same name.',
  sessionSentinels: 'A SessionEnvironment carries sentinels: at least one variable per entry of SESSION_ENVIRONMENT.forbiddenPrefixes, each named that prefix followed by a part minted afresh for every suite run, and each holding a nonempty value minted the same way. The names are unknown before the suite runs, so no list of names the product carries can name them; withholding them takes withholding the whole prefix. The same SessionEnvironment, sentinels included, is planted in and checked against every delegation world of one suite run, shared-run hosts included.',
  engineEnvironment: "The engine's environment is the environment the process standing at agy's place on the search path holds when it starts, recorded by that process itself before it does anything else: the recording pass-through in front of the installed agy, which hands its own environment to agy unchanged, or the stand-in. It is never the environment the driver handed the runtime. A job's engine environment is that of the one engine process the job started; a job that started none has no engine environment, and both environment confirmations then fail.",
  sessionOmitted: 'The engine environment omits the session when no variable name in it begins with any of SESSION_ENVIRONMENT.forbiddenPrefixes, and no variable value in it contains, as a substring, the value planted under any name in SESSION_ENVIRONMENT.forbiddenValues or under any sentinel name. A failure names each offending variable and the rule it broke, never its value.',
  engineKeeps: "The engine environment keeps a variable when it holds that variable with exactly the value the runtime invocation that started the job was given. A failure names the variable and whether it was absent or changed.",
  sessionValueCarried: "useSessionValueIn(setting, carrying) makes every later runtime invocation of the driver start with one of the SCREENED_SETTINGS set, on top of everything else the driver gives it, so that its value contains, as a substring, the value the session environment plants under the variable named carrying (a name of SESSION_ENVIRONMENT.forbiddenValues or a sentinel name). A directory the setting names is an existing directory: inside the carried value when that value is an existing directory, otherwise a new directory whose name contains the carried value, made outside the job store and every fixture project. 'locale' adds a variable named LC_ followed by a part minted for this call, whose value holds text before and after the carried value. 'temporary-directory' sets TMPDIR to such a directory. 'search-path' appends one such directory as the last entry of the search path the driver would otherwise give, leaving every earlier entry as it was. 'home' sets HOME to such a directory. The carried value is unknown before the suite runs: session id and job store are minted per driver, sentinels per suite run.",
  noTurnOfEarlierJob: "A job's conversation holds no turn of an earlier job when the conversation file it names, read after the job ended, holds no user-input step (step_type 14) whose step_payload contains the earlier job's marker, the job id that the earlier job's prompt carried. A job that names no conversation, or whose conversation file cannot be read, fails the confirmation. Nothing about the engine's answer is checked.",
  jobStore: 'The job store is the directory planted as CLAUDE_PLUGIN_DATA for the driver, every regular file under it walked recursively. The driver keeps no recording of its own inside it.',
  jobStoreWrites: "From useSessionEnvironment on, until close, the driver observes every write that any process of the plugin runtime makes to a path under the job store: the runtime invocations the driver starts and every process they start in turn, the detached background worker included. It observes each write as it happens, with the path and the bytes written, never by sampling the directory, so a file created, read back and removed before a job ends is observed as surely as one that stays; a rename into or within the job store is observed with the content it carries. From these writes the driver knows the content of every file under the job store after each write. A file that appears under the job store whose written bytes the driver did not observe, whoever wrote it, or a runtime process whose writes the driver could not observe, makes every later confirmJobStoreNeverHeld fail, naming that file or process, instead of letting it pass.",
  storeNeverHeld: "The job store never held the given jobs' prompts or the given texts when no content that any file under the job store held, at any moment of the jobStoreWrites observation and in a final read of every regular file under it, read as UTF-8, contains a forbidden text. The forbidden texts are each given text, whole or any 24 consecutive characters of it (the scenario passes the task text of every job it delegated and the codeword it minted), and, for each given job, the whole prompt its one engine process received for its print option as that process itself recorded it, a review's generated prompt included; a prompt counts only whole, so the job marker and job id the store legitimately holds never count. Each forbidden text counts verbatim and as it reads inside a JSON string, that is JSON.stringify of it without the enclosing quotes. An occurrence lying wholly inside a copy, verbatim or JSON-escaped, of the final response a given job's engine itself emitted on its own event stream is not counted, because a stored engine response may quote the prompt. The final read happens only after every given job reads terminal. A given job that started no engine fails the confirmation. A failure names the file, whether it still exists, and which job's prompt or which text it held, never the text.",
  engineReceivedTask: "The engine received a job's task text when the prompt the job's one engine process received for its print option, as that process itself recorded it, contains the given text whole and byte for byte; the given text is the task text the caller handed the delegation, never a value read back from the job store. A job that started no engine fails the confirmation. A failure says whether the engine received no prompt or a prompt lacking the text, never the text.",
  promptDigest: "A job's record keeps its prompt only as the prompt's digest when the argv the job's record in the job store holds has as many elements as the argv its one engine process received, every element equals the engine's element at the same position except the prompt argument, and the element at the prompt argument's position is not the prompt and contains the lowercase hexadecimal SHA-256 of the prompt's UTF-8 bytes. The prompt argument is the value the engine received for its print option; the prompt is that value as the engine received it. A job that started no engine, or whose record holds no argv, fails the confirmation.",
});

export const ENGINE_OPTIONS = Object.freeze(['print', 'output-format', 'model', 'effort', 'mode', 'json-schema', 'conversation']);

export const SESSION_ENVIRONMENT = Object.freeze({
  planted: Object.freeze(['CLAUDE_PLUGIN_DATA', 'CLAUDE_PLUGIN_ROOT', 'CODEX_COMPANION_TRANSCRIPT_PATH', 'CODEX_COMPANION_SESSION_ID']),
  forbiddenPrefixes: Object.freeze(['CLAUDE_', 'CODEX_']),
  forbiddenValues: Object.freeze(['CLAUDE_PLUGIN_DATA', 'CODEX_COMPANION_TRANSCRIPT_PATH', 'CODEX_COMPANION_SESSION_ID']),
});

export const ENGINE_ENVIRONMENT_KEPT = Object.freeze(['PATH', 'HOME']);

export const SCREENED_SETTINGS = Object.freeze(['locale', 'temporary-directory', 'search-path', 'home']);

export const STAND_IN_BEHAVIOURS = Object.freeze([
  'completes-normally',
  'works-until-released',
  'reports-success-and-works-until-released',
  'exits-before-confirming-model',
  'exits-before-result',
  'reports-unsuccessful-result',
  'reports-unsuccessful-result-then-exits-with-error',
  'returns-schema-breaking-findings',
  'returns-schema-breaking-findings-then-exits-with-error',
  'exits-with-error-after-success',
  'runs-another-model',
  'runs-another-model-and-keeps-working',
  'account-unavailable',
]);

export const STAND_IN_DEFINITIONS = Object.freeze({
  'reports-success-and-works-until-released': 'Emits an init event naming the model the job requested, then a final result event whose status is SUCCESS, then emits nothing further and keeps its process alive until releaseEngine; once released it exits 0.',
});

export const OBSERVATION_ORDER = Object.freeze({
  engineReportedSuccess: "awaitEngineReportedSuccess resolves only after the driver has itself read a result event whose status is SUCCESS from the engine's own event stream, independently of the plugin's record, and found the engine process alive at that moment; it rejects when the engine exits first or a deadline passes.",
  freshReads: 'Every status or result confirmation starts a new status or result invocation at the moment it is called and never answers from a reading taken earlier, so a confirmation called after awaitEngineReportedSuccess resolved reads the record as it stands after the engine reported success.',
  engineStillRunning: 'confirmEngineRunning inspects the engine process at the moment it is called; called after the reads, it shows the engine stayed alive across them.',
});

export const CONVERSATION_TAMPERS = Object.freeze([
  'remove-conversation-file',
  'restore-conversation-from-before-the-turn',
  'keep-only-the-marked-step',
]);

export const JOB_STATES = Object.freeze(['running', 'succeeded', 'failed', 'cancelled']);

export const ENDING_REASONS = Object.freeze([
  'engine-could-not-start',
  'exited-without-result',
  'result-not-success',
  'schema-violated',
  'model-mismatch',
  'nonzero-exit-after-success',
  'no-conversation-to-continue',
  'cancel-requested',
  'session-value-in-path-or-home',
]);

export const UNVERIFIED_REASONS = Object.freeze([
  'conversation-file-missing',
  'marked-step-absent',
  'step-count-not-grown',
]);

export const TYPES = Object.freeze({
  ProjectHandle: 'opaque; one fixture project the driver created, as ACCEPTANCE_DEFINITIONS.fixture defines it',
  JobHandle: "opaque; one job the plugin runtime created, together with what the driver observed independently of the plugin's own record: the conversation store and the step count of any conversation the job names before the run began and after it ended, and the engine's own argv, environment, process id and event stream as the engine received and emitted them; every write to the job store made while the job ran is part of the driver-wide observation ACCEPTANCE_DEFINITIONS.jobStoreWrites defines",
  RecordReading: 'opaque; what one status read and one result read of a job reported: state, reason, engine settings, response, findings, conversation id and proof',
  StandInBehaviour: 'one of STAND_IN_BEHAVIOURS',
  ConversationTamper: 'one of CONVERSATION_TAMPERS; applied between the engine process exiting and the plugin opening the conversation file',
  JobState: 'one of JOB_STATES',
  EndingReason: 'one of ENDING_REASONS',
  UnverifiedReason: 'one of UNVERIFIED_REASONS',
  EngineOption: 'one of ENGINE_OPTIONS, an agy option name without its leading dashes',
  EngineSettings: "{ model: string, effort: string }; null where a confirmation takes one means the settings the job itself requested, the plugin's documented defaults",
  Location: '{ file: string, line: number }',
  DelegationRequest: '{ project: ProjectHandle, leg: "review" | "task", text?: string, background?: boolean, foreground?: boolean, resume?: JobHandle, fresh?: boolean, settings?: EngineSettings }',
  Routing: '{ background?: true, wait?: true, fresh?: true, resume?: string, model?: string, effort?: string }',
  SessionEnvironment: '{ planted, forbiddenPrefixes, forbiddenValues } as SESSION_ENVIRONMENT, plus sentinels: Readonly<Record<VariableName, string>>; ACCEPTANCE_DEFINITIONS.sessionEnvironment says how each planted name is set and ACCEPTANCE_DEFINITIONS.sessionSentinels what the sentinels are',
  VariableName: 'one environment variable name, such as those in ENGINE_ENVIRONMENT_KEPT',
  ScreenedSetting: 'one of SCREENED_SETTINGS; ACCEPTANCE_DEFINITIONS.sessionValueCarried says which variable each one sets and how',
});

export const DelegationDriver = Object.freeze({
  createProject: '() => Promise<ProjectHandle>',
  useInstalledEngine: '() => Promise<void>',
  useAbsentEngine: '() => Promise<void>',
  useStandInEngine: '(behaviour: StandInBehaviour) => Promise<void>',
  useInstalledEngineThen: '(tamper: ConversationTamper) => Promise<void>',
  useSessionEnvironment: '(session: SessionEnvironment) => Promise<void>',
  useSessionValueIn: '(setting: ScreenedSetting, carrying: VariableName) => Promise<void>',
  releaseEngine: '(job: JobHandle) => Promise<void>',
  awaitEngineReportedSuccess: '(job: JobHandle) => Promise<void>',
  awaitJobEnd: '(job: JobHandle) => Promise<void>',
  close: '() => Promise<void>',

  delegate: '(request: DelegationRequest) => Promise<JobHandle>',
  cancel: '(job: JobHandle) => Promise<void>',
  readStatus: '(job: JobHandle) => Promise<void>',
  readResult: '(job: JobHandle) => Promise<void>',
  readRecord: '(job: JobHandle) => Promise<RecordReading>',
  runSetup: '() => Promise<void>',
  askSubagent: '(project: ProjectHandle, request: string) => Promise<void>',

  confirmStatusReads: '(job: JobHandle, state: JobState) => Promise<void>',
  confirmResultReads: '(job: JobHandle, state: JobState) => Promise<void>',
  confirmStatusEndedBecause: '(job: JobHandle, state: JobState, reason: EndingReason) => Promise<void>',
  confirmResultEndedBecause: '(job: JobHandle, state: JobState, reason: EndingReason) => Promise<void>',
  confirmRecordMatches: '(job: JobHandle, before: RecordReading) => Promise<void>',
  confirmVerified: '(job: JobHandle) => Promise<void>',
  confirmUnverifiedBecause: '(job: JobHandle, reason: UnverifiedReason) => Promise<void>',
  confirmFailureNamesBothModels: '(job: JobHandle) => Promise<void>',
  confirmPromptCarriesJobMarker: '(job: JobHandle) => Promise<void>',
  confirmProofMatchesConversation: '(job: JobHandle) => Promise<void>',
  confirmConversationStartedEmpty: '(job: JobHandle) => Promise<void>',
  confirmConversationGrewInStore: '(job: JobHandle) => Promise<void>',
  confirmConversationHoldsNoTurnOf: '(job: JobHandle, earlier: JobHandle) => Promise<void>',
  confirmJobStoreNeverHeld: '(jobs: readonly JobHandle[], texts: readonly string[]) => Promise<void>',
  confirmEngineReceivedTaskText: '(job: JobHandle, text: string) => Promise<void>',
  confirmRecordKeepsPromptAsDigest: '(job: JobHandle) => Promise<void>',

  confirmFindingsAreEngineOutput: '(job: JobHandle) => Promise<void>',
  confirmFindingsSatisfySchema: '(job: JobHandle) => Promise<void>',
  confirmFirstFindingAt: '(job: JobHandle, location: Location) => Promise<void>',
  confirmEveryFindingComplete: '(job: JobHandle) => Promise<void>',
  confirmProjectUnchanged: '(project: ProjectHandle) => Promise<void>',
  confirmDefectFixed: '(project: ProjectHandle) => Promise<void>',
  confirmTextNowhereInProject: '(project: ProjectHandle, text: string) => Promise<void>',

  confirmCarriesEngineResponse: '(job: JobHandle) => Promise<void>',
  confirmNamesConversation: '(job: JobHandle) => Promise<void>',
  confirmBodyAbsent: '(job: JobHandle) => Promise<void>',
  confirmAnswerContains: '(job: JobHandle, text: string) => Promise<void>',
  confirmSameConversation: '(job: JobHandle, earlier: JobHandle) => Promise<void>',
  confirmDifferentConversation: '(job: JobHandle, earlier: JobHandle) => Promise<void>',
  confirmEngineAskedToContinue: '(job: JobHandle, earlier: JobHandle) => Promise<void>',
  confirmEngineAskedToContinueNothing: '(job: JobHandle) => Promise<void>',

  confirmResultCarriesSettings: '(job: JobHandle, settings: EngineSettings | null) => Promise<void>',
  confirmNoConfirmationArrived: '(job: JobHandle) => Promise<void>',
  confirmNamesEngineModel: '(job: JobHandle) => Promise<void>',
  confirmEffortMarkedUnconfirmed: '(job: JobHandle) => Promise<void>',
  confirmEngineAskedFor: '(job: JobHandle, settings: EngineSettings | null) => Promise<void>',
  confirmEngineAskedForDocumentedDefaults: '(job: JobHandle) => Promise<void>',
  confirmEngineStreamsEvents: '(job: JobHandle) => Promise<void>',
  confirmOnlyDelegationOptions: '(job: JobHandle, allowed: readonly EngineOption[]) => Promise<void>',
  confirmReadOnlyWithSchema: '(job: JobHandle) => Promise<void>',
  confirmDefaultModeUnsandboxed: '(job: JobHandle) => Promise<void>',
  confirmEngineEnvironmentOmitsSession: '(job: JobHandle, session: SessionEnvironment) => Promise<void>',
  confirmEngineEnvironmentKeeps: '(job: JobHandle, kept: readonly VariableName[]) => Promise<void>',

  confirmReturnedWhileEngineWorking: '(job: JobHandle) => Promise<void>',
  confirmEngineStopped: '(job: JobHandle) => Promise<void>',
  confirmEngineRunning: '(job: JobHandle) => Promise<void>',
  confirmReadersExited: '(job: JobHandle) => Promise<void>',
  confirmCancelReported: '(job: JobHandle, state: JobState) => Promise<void>',
  confirmNoEngineStarted: '(job: JobHandle) => Promise<void>',
  confirmAtMostOneEngine: '(job: JobHandle) => Promise<void>',
  confirmEngineGoneAtFinish: '(job: JobHandle) => Promise<void>',
  confirmNothingLeftRunning: '(job: JobHandle, afterSeconds: number) => Promise<void>',

  confirmSubagentMadeOneRuntimeCall: '() => Promise<void>',
  confirmRuntimeReceivedRouting: '(routing: Routing) => Promise<void>',
  confirmRuntimeReceivedTaskText: '(text: string) => Promise<void>',
  confirmSubagentReplyIsRuntimeOutput: '() => Promise<void>',

  confirmSetupReportsEngineMissing: '() => Promise<void>',
  confirmSetupEndedUnsuccessfully: '() => Promise<void>',
  confirmSetupWroteNothing: '() => Promise<void>',
  confirmSetupReportsEngine: '() => Promise<void>',
  confirmSetupAskedOnlyAboutItself: '() => Promise<void>',
  confirmSetupReportsAccountUnavailable: '() => Promise<void>',
});

export const PluginSourceDriver = Object.freeze({
  confirmRuntimeShipped: '() => Promise<void>',
  confirmRuntimeFilesAreNodeModules: '() => Promise<void>',
  confirmNoPackageDependency: '() => Promise<void>',
  confirmProcessesStartedWithArgumentLists: '() => Promise<void>',
  confirmNoShellNamedNorCommandString: '() => Promise<void>',
  confirmEngineExtensionsNeverChanged: '() => Promise<void>',
  confirmExactlyOneSubagent: '() => Promise<void>',
  confirmSubagentToolsShellOnly: '() => Promise<void>',
  confirmSubagentNamesAntigravity: '() => Promise<void>',
  confirmSubagentOmitsCodex: '() => Promise<void>',
});
