//status: Draft
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
  fixture: 'Each scenario gets its own new git repository with one commit holding three files: math.mjs, whose add(a, b) returns a - b on line 2 (the planted defect); strings.mjs, a correct upper(s); README.md.',
  unchangedTree: 'A tree is unchanged when two things are identical before and after the run: the output of `git status --porcelain --untracked-files=all --ignored`, and the set of (relative path, SHA-256) pairs for every regular file under the fixture root outside `.git/`, walked recursively, including files inside ignored directories. Job records live outside the fixture repository, so they never take part in this comparison.',
  fixedDefect: `The defect is fixed when node --input-type=module -e "import('./math.mjs').then(m=>process.exit(m.add(2,3)===5?0:1))" exits 0 in the fixture.`,
  conversationStore: 'A conversation is the SQLite file ~/.gemini/antigravity-cli/conversations/<conversation_id>.db. Its steps table is keyed by idx, and a user-input step has step_type 14 with the prompt text readable inside its step_payload.',
  lingerWindow: 'The observation origin is the moment the job record first reads terminal; the window closes 5 seconds after that origin.',
});

export const ENGINE_OPTIONS = Object.freeze(['print', 'output-format', 'model', 'effort', 'mode', 'json-schema', 'conversation']);

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
]);

export const UNVERIFIED_REASONS = Object.freeze([
  'conversation-file-missing',
  'marked-step-absent',
  'step-count-not-grown',
]);

export const TYPES = Object.freeze({
  ProjectHandle: 'opaque; one fixture project the driver created, as ACCEPTANCE_DEFINITIONS.fixture defines it',
  JobHandle: "opaque; one job the plugin runtime created, together with what the driver observed independently of the plugin's own record: the conversation store and the step count of any conversation the job names before the run began and after it ended, and the engine's own argv, process id and event stream as the engine received and emitted them",
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
});

export const DelegationDriver = Object.freeze({
  createProject: '() => Promise<ProjectHandle>',
  useInstalledEngine: '() => Promise<void>',
  useAbsentEngine: '() => Promise<void>',
  useStandInEngine: '(behaviour: StandInBehaviour) => Promise<void>',
  useInstalledEngineThen: '(tamper: ConversationTamper) => Promise<void>',
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
  confirmAnswerLacks: '(job: JobHandle, text: string) => Promise<void>',
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
