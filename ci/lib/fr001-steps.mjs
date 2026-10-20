//status: Approved
import { Given, InstrumentError, Then, When } from './feature-runner.mjs';

const MISBEHAVIOUR = Object.freeze({
  'exit before reporting a result': 'exits-before-result',
  'report a result that is not a success': 'reports-unsuccessful-result',
  'return findings that break the shipped schema': 'returns-schema-breaking-findings',
  'exit with an error after reporting success': 'exits-with-error-after-success',
  'run a different model than the one requested': 'runs-another-model',
  'run a different model than the one requested and keep working': 'runs-another-model-and-keeps-working',
  'return findings that break the shipped schema and then exit with an error': 'returns-schema-breaking-findings-then-exits-with-error',
  'report a result that is not a success and then exit with an error': 'reports-unsuccessful-result-then-exits-with-error',
  'report success and keep running until it is released': 'reports-success-and-works-until-released',
  'exit before confirming its model': 'exits-before-confirming-model',
  'complete its work normally': 'completes-normally',
  'keep working until it is released': 'works-until-released',
});

const ENDING = Object.freeze({
  'the engine could not start': 'engine-could-not-start',
  'the engine exited without a result': 'exited-without-result',
  "the engine's result was not a success": 'result-not-success',
  'the findings broke the shipped schema': 'schema-violated',
  'the engine exited with an error after reporting success': 'nonzero-exit-after-success',
  'the engine ran a different model than requested': 'model-mismatch',
  'there is no conversation to continue': 'no-conversation-to-continue',
  'a cancel was requested': 'cancel-requested',
});

const UNVERIFIED = Object.freeze({
  'the conversation file is missing': 'conversation-file-missing',
  'the marked step is absent': 'marked-step-absent',
  'the step count did not grow': 'step-count-not-grown',
});

const TAMPER = Object.freeze({
  'removed once the engine exits': 'remove-conversation-file',
  'put back to its state before the follow-up once the engine exits': 'restore-conversation-from-before-the-turn',
  "cut down to the follow-up's marked step once the engine exits": 'keep-only-the-marked-step',
});

const VALUELESS_ROUTING = new Set(['background', 'wait', 'fresh']);
const VALUED_ROUTING = new Set(['resume', 'model', 'effort']);

const NOT_RESUMING = Object.freeze({
  'names no prior job': 'none',
  'is explicitly marked fresh': 'fresh',
});

const FINISHED = Object.freeze({
  'been cancelled': 'cancelled',
  succeeded: 'succeeded',
  failed: 'failed',
});

const RUNTIME_RULE = Object.freeze({
  'every runtime file is a Node module': 'confirmRuntimeFilesAreNodeModules',
  'the plugin declares no package dependency': 'confirmNoPackageDependency',
  'every process the runtime starts is an executable with an argument list, never through a shell': 'confirmProcessesStartedWithArgumentLists',
  'no runtime file names a shell or passes a single command string': 'confirmNoShellNamedNorCommandString',
  "no runtime file changes Antigravity's MCP servers or plugins": 'confirmEngineExtensionsNeverChanged',
});

function lookup(table, phrase, what) {
  if (!Object.hasOwn(table, phrase)) throw new InstrumentError(`the vocabulary has no ${what} called "${phrase}"`);
  return table[phrase];
}

function routingOf(phrase) {
  if (phrase === 'none') return {};
  return Object.fromEntries(phrase.split(', ').map((item) => {
    const [name, ...value] = item.split(' ');
    if (VALUELESS_ROUTING.has(name) && value.length === 0) return [name, true];
    if (VALUED_ROUTING.has(name) && value.length === 1) return [name, value[0]];
    throw new InstrumentError(`the vocabulary has no routing option written "${item}"`);
  }));
}

const RUN = Object.freeze({
  'a review': (dsl) => dsl.review(),
  'a task': (dsl) => dsl.task(),
  'a task to fix the planted defect': (dsl) => dsl.task(),
  'a follow-up on that job': (dsl) => dsl.followUp(),
  'a follow-up on an earlier task': (dsl) => dsl.followUpOnEarlierTask(),
  'a task in the background': (dsl) => dsl.task({ background: true }),
});

const JOB_TO_ITS_END = Object.freeze({
  'a review': (dsl) => dsl.review(),
  'a task': (dsl) => dsl.task(),
  'a follow-up on an earlier task': (dsl) => dsl.followUpOnEarlierTask(),
  'a task in the background': (dsl) => dsl.task({ background: true }),
  'a task whose engine exits before reporting a result': (dsl) => dsl.taskOnStandIn('exits-before-result'),
  'a task whose engine runs a different model and keeps working': (dsl) => dsl.taskOnStandIn('runs-another-model-and-keeps-working'),
  'a background task cancelled while its engine works': (dsl) => dsl.cancelledBackgroundTask(),
});

export const delegationSteps = [
  Given(/^a project with the planted defect$/, (dsl) => dsl.projectWithPlantedDefect()),
  Given(/^Antigravity is installed$/, (dsl) => dsl.engineInstalled()),
  Given(/^Antigravity is not installed$/, (dsl) => dsl.engineNotInstalled()),
  Given(/^Antigravity is installed but its account is unavailable$/, (dsl) => dsl.engineWill('account-unavailable')),
  Given(/^Antigravity will (.+)$/, (dsl, phrase) => dsl.engineWill(lookup(MISBEHAVIOUR, phrase, 'engine behaviour'))),
  Given(/^Antigravity's conversation file will be (.+)$/, (dsl, phrase) =>
    dsl.conversationWillBeTampered(lookup(TAMPER, phrase, 'conversation tampering'))),
  Given(/^a task job that ran in a project with the planted defect$/, (dsl) => dsl.earlierTask()),
  Given(/^a task job that was told a secret codeword and asked not to write it anywhere$/, (dsl) => dsl.earlierTaskToldCodeword()),
  Given(/^the codeword appears nowhere in the project or its history$/, (dsl) => dsl.confirmCodewordNowhereInProject()),
  Given(/^a job that ended before Antigravity reported a conversation$/, (dsl) => dsl.jobWithoutConversation()),
  Given(/^a background task job whose engine is still working$/, (dsl) => dsl.backgroundTaskStillWorking()),
  Given(/^a job that has already (.+)$/, (dsl, phrase) => dsl.jobAlreadyFinished(lookup(FINISHED, phrase, 'finished state'))),

  When(/^a task is delegated to Antigravity in the background$/, (dsl) => dsl.task({ background: true })),
  When(/^a task is delegated to Antigravity in the foreground$/, (dsl) => dsl.task({ foreground: true })),
  When(/^a task is delegated to Antigravity with an explicit model and effort$/, (dsl) => dsl.taskWithExplicitSettings()),
  When(/^(a review|a task|a task to fix the planted defect|a follow-up on that job|a follow-up on an earlier task|a task in the background) is delegated to Antigravity$/, (dsl, run) =>
    RUN[run](dsl)),
  When(/^(.+) runs to its end$/, async (dsl, phrase) => {
    await lookup(JOB_TO_ITS_END, phrase, 'job')(dsl);
    await dsl.awaitJobEnd();
  }),
  When(/^a follow-up on that job asks for the codeword$/, (dsl) => dsl.askForCodeword({ resumes: 'earlier' })),
  When(/^a run that (.+) asks for the codeword in the same project$/, (dsl, phrase) =>
    dsl.askForCodeword({ resumes: lookup(NOT_RESUMING, phrase, 'way of not resuming') })),
  When(/^Antigravity has reported success and is still running$/, (dsl) => dsl.awaitReportedSuccessWhileRunning()),
  When(/^the engine finishes its work$/, (dsl) => dsl.releaseEngine()),
  When(/^the job's status and result are read$/, (dsl) => dsl.readStatusAndResult()),
  When(/^the job is cancelled$/, (dsl) => dsl.cancel()),
  When(/^the subagent is asked "(.*)"$/, (dsl, request) => dsl.askSubagent(request)),
  When(/^setup runs$/, (dsl) => dsl.runSetup()),

  Then(/^the review's findings are Antigravity's own structured output, with no prose in their place$/, (dsl) => dsl.confirmFindingsAreEngineOutput()),
  Then(/^the review's findings satisfy the shipped findings schema$/, (dsl) => dsl.confirmFindingsSatisfySchema()),
  Then(/^the first finding points at the planted defect$/, (dsl) => dsl.confirmFirstFindingIsPlantedDefect()),
  Then(/^every finding names a file, a line, a claim, the evidence checked and a verdict$/, (dsl) => dsl.confirmEveryFindingComplete()),
  Then(/^the project is unchanged$/, (dsl) => dsl.confirmProjectUnchanged()),
  Then(/^the job reads succeeded, verified by the turn it ran in a new conversation$/, (dsl) => dsl.confirmVerifiedByOwnTurnInNewConversation()),
  Then(/^the job reads succeeded and unverified because (.+)$/, (dsl, phrase) =>
    dsl.confirmSucceededAndUnverified(lookup(UNVERIFIED, phrase, 'unverified reason'))),
  Then(/^the planted defect is fixed$/, (dsl) => dsl.confirmDefectFixed()),
  Then(/^the result carries Antigravity's own final response and the conversation it ran in$/, (dsl) => dsl.confirmCarriesEngineResponseAndConversation()),
  Then(/^the conversation file is in Antigravity's conversation store and gained steps during the run$/, (dsl) => dsl.confirmConversationGrewInStore()),
  Then(/^the answer contains the codeword$/, (dsl) => dsl.confirmAnswerContainsCodeword()),
  Then(/^the answer does not contain the codeword$/, (dsl) => dsl.confirmAnswerLacksCodeword()),
  Then(/^the follow-up continued the earlier job's conversation$/, (dsl) => dsl.confirmContinuedEarlierConversation()),
  Then(/^the engine was asked to continue the earlier job's conversation$/, (dsl) => dsl.confirmEngineAskedToContinueEarlierConversation()),
  Then(/^the run's conversation is not the earlier job's$/, (dsl) => dsl.confirmConversationOfItsOwn()),
  Then(/^the engine was not asked to continue any conversation$/, (dsl) => dsl.confirmEngineAskedToContinueNothing()),
  Then(/^the job reads (failed|cancelled) because (.+)$/, (dsl, state, phrase) =>
    dsl.confirmEndedBecause(state, lookup(ENDING, phrase, 'ending reason'))),
  Then(/^the result reads (failed|cancelled) because (.+), with the requested engine settings and no response or findings$/, (dsl, state, phrase) =>
    dsl.confirmEndedResult(state, lookup(ENDING, phrase, 'ending reason'))),
  Then(/^the job reads failed with a reason naming both the requested model and the engine's model$/, (dsl) => dsl.confirmFailureNamesBothModels()),
  Then(/^no engine was started for the follow-up$/, (dsl) => dsl.confirmNoEngineStarted()),
  Then(/^the delegation returned while the engine was still working$/, (dsl) => dsl.confirmReturnedWhileEngineWorking()),
  Then(/^the job's status reads running$/, (dsl) => dsl.confirmState('running')),
  Then(/^the job's result reads running with no body$/, async (dsl) => {
    await dsl.confirmResultState('running');
    await dsl.confirmNoBody();
  }),
  Then(/^a later status read shows the job succeeded$/, (dsl) => dsl.confirmState('succeeded')),
  Then(/^a later result read shows the job succeeded with Antigravity's own final response$/, async (dsl) => {
    await dsl.confirmResultState('succeeded');
    await dsl.confirmCarriesEngineResponse();
  }),
  Then(/^each read finished on its own after printing$/, (dsl) => dsl.confirmReadersExited()),
  Then(/^the engine is no longer running$/, (dsl) => dsl.confirmEngineStopped()),
  Then(/^the engine is still running$/, (dsl) => dsl.confirmEngineStillRunning()),
  Then(/^the cancel reports the job as (running|succeeded|failed|cancelled)$/, (dsl, state) => dsl.confirmCancelReported(state)),
  Then(/^the job's status and result read exactly as they did before the cancel$/, (dsl) => dsl.confirmRecordUnchangedByCancel()),
  Then(/^the result says no confirmation arrived from the engine$/, (dsl) => dsl.confirmNoConfirmationArrived()),
  Then(/^the result names the model the engine reported$/, (dsl) => dsl.confirmNamesEngineModel()),
  Then(/^the result names the model the engine reported and says the engine does not confirm the effort$/, async (dsl) => {
    await dsl.confirmNamesEngineModel();
    await dsl.confirmEffortMarkedUnconfirmed();
  }),
  Then(/^the engine was asked for exactly the model and effort the job requested$/, (dsl) => dsl.confirmEngineAskedForRequestedSettings()),
  Then(/^the result says the engine does not confirm the effort$/, (dsl) => dsl.confirmEffortMarkedUnconfirmed()),
  Then(/^the engine was asked for the plugin's documented default model and effort$/, (dsl) => dsl.confirmEngineAskedForDocumentedDefaults()),
  Then(/^the engine was asked to stream its events$/, (dsl) => dsl.confirmEngineStreamsEvents()),
  Then(/^the engine was given only the delegation's own options, nothing that adds a skill, plugin, MCP server, agent, project or directory$/, (dsl) =>
    dsl.confirmOnlyDelegationOptions()),
  Then(/^the engine ran in plan mode with the shipped findings schema$/, (dsl) => dsl.confirmReadOnlyWithSchema()),
  Then(/^the engine ran in neither plan mode nor a sandbox$/, (dsl) => dsl.confirmDefaultModeUnsandboxed()),
  Then(/^the job started at most one engine$/, (dsl) => dsl.confirmAtMostOneEngine()),
  Then(/^the engine had exited when the job first read finished$/, (dsl) => dsl.confirmEngineGoneAtFinish()),
  Then(/^five seconds after the job first read finished, nothing the plugin started for the job is still running$/, (dsl) => dsl.confirmNothingLeftRunning()),
  Then(/^the subagent made exactly one tool call, to the plugin runtime$/, (dsl) => dsl.confirmSubagentMadeOneRuntimeCall()),
  Then(/^the runtime's routing options were exactly: (.+)$/, (dsl, phrase) => dsl.confirmRuntimeReceivedRouting(routingOf(phrase))),
  Then(/^the runtime received the task text "(.*)" byte for byte$/, (dsl, text) => dsl.confirmRuntimeReceivedTaskText(text)),
  Then(/^the subagent's reply is the runtime's output, unchanged$/, (dsl) => dsl.confirmSubagentReplyIsRuntimeOutput()),
  Then(/^setup reports that Antigravity is not installed$/, (dsl) => dsl.confirmSetupReportsEngineMissing()),
  Then(/^setup ends unsuccessfully$/, (dsl) => dsl.confirmSetupEndedUnsuccessfully()),
  Then(/^setup wrote nothing$/, (dsl) => dsl.confirmSetupWroteNothing()),
  Then(/^setup reports Antigravity's version, account state, models, plugins and MCP servers as Antigravity lists them$/, (dsl) =>
    dsl.confirmSetupReportsEngine()),
  Then(/^the only Antigravity commands setup ran were its version, its models, its plugin list and its MCP server list$/, (dsl) =>
    dsl.confirmSetupAskedOnlyAboutItself()),
  Then(/^setup reports the account as unavailable with Antigravity's message$/, (dsl) => dsl.confirmSetupReportsAccountUnavailable()),
];

export const pluginSourceSteps = [
  Given(/^the plugin as shipped$/, () => {}),
  Then(/^the plugin ships a runtime$/, (dsl) => dsl.confirm('confirmRuntimeShipped')),
  Then(/^(every runtime file is a Node module|the plugin declares no package dependency|every process the runtime starts is an executable with an argument list, never through a shell|no runtime file names a shell or passes a single command string|no runtime file changes Antigravity's MCP servers or plugins)$/, (dsl, rule) =>
    dsl.confirm(RUNTIME_RULE[rule])),
  Then(/^the plugin ships exactly one subagent$/, (dsl) => dsl.confirm('confirmExactlyOneSubagent')),
  Then(/^that subagent's only tool is the shell$/, (dsl) => dsl.confirm('confirmSubagentToolsShellOnly')),
  Then(/^the subagent's description names Antigravity$/, (dsl) => dsl.confirm('confirmSubagentNamesAntigravity')),
  Then(/^the subagent's description does not name Codex$/, (dsl) => dsl.confirm('confirmSubagentOmitsCodex')),
];
