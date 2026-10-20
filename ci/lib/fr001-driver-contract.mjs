//status: Draft
export const DRIVER_MODULES = Object.freeze({
  delegation: Object.freeze({ path: 'ci/drivers/fr001-delegation-driver.mjs', factory: 'createDelegationDriver' }),
  pluginSource: Object.freeze({ path: 'ci/drivers/fr001-plugin-source-driver.mjs', factory: 'createPluginSourceDriver' }),
});

export const FACTORY_SIGNATURES = Object.freeze({
  createDelegationDriver: '(options: { repoRoot: string }) => Promise<DelegationDriver>',
  createPluginSourceDriver: '(options: { repoRoot: string }) => Promise<PluginSourceDriver>',
});

export const STAND_IN_BEHAVIOURS = Object.freeze([
  'completes-normally',
  'works-until-released',
  'exits-before-confirming-model',
  'exits-before-result',
  'reports-unsuccessful-result',
  'returns-schema-breaking-findings',
  'exits-with-error-after-success',
  'runs-another-model',
  'runs-another-model-and-keeps-working',
  'account-unavailable',
]);

export const CONVERSATION_TAMPERS = Object.freeze([
  'remove-conversation-file',
  'restore-conversation-from-before-the-turn',
]);

export const JOB_STATES = Object.freeze(['running', 'succeeded', 'failed', 'cancelled']);

export const FAILURE_REASONS = Object.freeze([
  'engine-could-not-start',
  'exited-without-result',
  'result-not-success',
  'schema-violated',
  'model-mismatch',
  'nonzero-exit-after-success',
  'no-conversation-to-continue',
]);

export const UNVERIFIED_REASONS = Object.freeze([
  'conversation-file-missing',
  'marked-step-absent',
  'step-count-not-grown',
]);

export const TYPES = Object.freeze({
  ProjectHandle: 'opaque; one fixture project the driver created: a new git repository, one commit, math.mjs with add(a, b) returning a - b on line 2, a correct strings.mjs, README.md',
  JobHandle: 'opaque; one job the plugin runtime created, as the driver observed it',
  StandInBehaviour: 'one of STAND_IN_BEHAVIOURS',
  ConversationTamper: 'one of CONVERSATION_TAMPERS',
  JobState: 'one of JOB_STATES',
  FailureReason: 'one of FAILURE_REASONS',
  UnverifiedReason: 'one of UNVERIFIED_REASONS',
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
  close: '() => Promise<void>',

  delegate: '(request: DelegationRequest) => Promise<JobHandle>',
  cancel: '(job: JobHandle) => Promise<void>',
  readStatus: '(job: JobHandle) => Promise<void>',
  readResult: '(job: JobHandle) => Promise<void>',
  runSetup: '() => Promise<void>',
  askSubagent: '(project: ProjectHandle, request: string) => Promise<void>',

  confirmStatusReads: '(job: JobHandle, state: JobState) => Promise<void>',
  confirmResultReads: '(job: JobHandle, state: JobState) => Promise<void>',
  confirmVerified: '(job: JobHandle) => Promise<void>',
  confirmUnverifiedBecause: '(job: JobHandle, reason: UnverifiedReason) => Promise<void>',
  confirmFailedBecause: '(job: JobHandle, reason: FailureReason) => Promise<void>',
  confirmFailureNamesBothModels: '(job: JobHandle) => Promise<void>',
  confirmProofNamesTurn: '(job: JobHandle) => Promise<void>',
  confirmConversationGrewInStore: '(job: JobHandle) => Promise<void>',

  confirmFindingsSatisfySchema: '(job: JobHandle) => Promise<void>',
  confirmFirstFindingAt: '(job: JobHandle, location: Location) => Promise<void>',
  confirmEveryFindingComplete: '(job: JobHandle) => Promise<void>',
  confirmProjectUnchanged: '(project: ProjectHandle) => Promise<void>',
  confirmDefectFixed: '(project: ProjectHandle) => Promise<void>',
  confirmTextNowhereInProject: '(project: ProjectHandle, text: string) => Promise<void>',

  confirmCarriesResponse: '(job: JobHandle) => Promise<void>',
  confirmNamesConversation: '(job: JobHandle) => Promise<void>',
  confirmBodyAbsent: '(job: JobHandle) => Promise<void>',
  confirmAnswerContains: '(job: JobHandle, text: string) => Promise<void>',
  confirmAnswerLacks: '(job: JobHandle, text: string) => Promise<void>',
  confirmSameConversation: '(job: JobHandle, earlier: JobHandle) => Promise<void>',
  confirmDifferentConversation: '(job: JobHandle, earlier: JobHandle) => Promise<void>',

  confirmResultCarriesSettings: '(job: JobHandle, settings: EngineSettings | null) => Promise<void>',
  confirmNoConfirmationArrived: '(job: JobHandle) => Promise<void>',
  confirmNamesEngineModel: '(job: JobHandle) => Promise<void>',
  confirmEffortMarkedUnconfirmed: '(job: JobHandle) => Promise<void>',
  confirmEngineAskedFor: '(job: JobHandle, settings: EngineSettings) => Promise<void>',
  confirmEngineAskedForDocumentedDefaults: '(job: JobHandle) => Promise<void>',
  confirmEngineStreamsEvents: '(job: JobHandle) => Promise<void>',
  confirmOnlyDelegationOptions: '(job: JobHandle) => Promise<void>',
  confirmReadOnlyWithSchema: '(job: JobHandle) => Promise<void>',
  confirmDefaultModeUnsandboxed: '(job: JobHandle) => Promise<void>',

  confirmReturnedWhileEngineWorking: '(job: JobHandle) => Promise<void>',
  confirmEngineStopped: '(job: JobHandle) => Promise<void>',
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
