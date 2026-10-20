//status: Draft
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { InstrumentError } from './feature-runner.mjs';
import { DRIVER_MODULES, DelegationDriver, ENGINE_OPTIONS, PluginSourceDriver } from './fr001-driver-contract.mjs';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const PLANTED_DEFECT = Object.freeze({ file: 'math.mjs', line: 2 });
const FIX_THE_DEFECT = 'The add(a, b) function in math.mjs returns the wrong value. Fix it so that it returns the sum of a and b.';
const EXPLICIT_SETTINGS = Object.freeze({ model: 'gemini-4-argon', effort: 'low' });
const CODEWORD_QUESTION = 'What codeword did I give you in the previous turn? Answer with the codeword only.';
const LINGER_WINDOW_SECONDS = 5;

async function loadDriver(module, contract) {
  const path = join(REPO_ROOT, module.path);
  if (!existsSync(path)) throw new InstrumentError(`the FR-001 protocol driver is not implemented yet: ${module.path}`);
  const exported = await import(pathToFileURL(path).href);
  if (typeof exported[module.factory] !== 'function') {
    throw new InstrumentError(`${module.path} does not export ${module.factory}`);
  }
  const driver = await exported[module.factory]({ repoRoot: REPO_ROOT });
  const missing = Object.keys(contract).filter((name) => typeof driver?.[name] !== 'function');
  if (missing.length > 0) throw new InstrumentError(`${module.path} leaves contract methods unimplemented: ${missing.join(', ')}`);
  return driver;
}

function mintCodeword() {
  return `KESTREL-${randomBytes(4).toString('hex').toUpperCase()}`;
}

export class DelegationDsl {
  #driver;
  #project = null;
  #jobs = new Map();
  #latest = null;
  #codeword = null;
  #requested = null;
  #beforeCancel = null;

  constructor(driver) {
    this.#driver = driver;
  }

  static async create() {
    const driver = await loadDriver(DRIVER_MODULES.delegation, DelegationDriver);
    await driver.useInstalledEngine();
    return new DelegationDsl(driver);
  }

  async close() {
    await this.#driver.close();
  }

  #job(alias = 'latest') {
    const job = alias === 'latest' ? this.#latest : this.#jobs.get(alias);
    if (!job) throw new InstrumentError(`the scenario refers to ${alias === 'latest' ? 'a job' : `the ${alias} job`} before delegating one`);
    return job;
  }

  #remember(alias, job) {
    this.#jobs.set(alias, job);
    this.#latest = job;
    return job;
  }

  async #ensureProject() {
    if (!this.#project) this.#project = await this.#driver.createProject();
    return this.#project;
  }

  async projectWithPlantedDefect() {
    this.#project = await this.#driver.createProject();
  }

  async engineInstalled() {
    await this.#driver.useInstalledEngine();
  }

  async engineNotInstalled() {
    await this.#driver.useAbsentEngine();
  }

  async engineWill(behaviour) {
    await this.#driver.useStandInEngine(behaviour);
  }

  async conversationWillBeTampered(tamper) {
    await this.#driver.useInstalledEngineThen(tamper);
  }

  async delegate({ leg = 'task', alias = leg, text, background = false, foreground = false, resume, fresh = false, settings } = {}) {
    const project = await this.#ensureProject();
    this.#requested = settings ?? null;
    const request = { project, leg, text: text ?? (leg === 'task' ? FIX_THE_DEFECT : undefined), background, foreground, fresh };
    if (resume) request.resume = this.#job(resume);
    if (settings) request.settings = settings;
    return this.#remember(alias, await this.#driver.delegate(request));
  }

  async review() {
    return this.delegate({ leg: 'review' });
  }

  async task(options = {}) {
    return this.delegate({ leg: 'task', ...options });
  }

  async taskWithExplicitSettings() {
    return this.task({ settings: EXPLICIT_SETTINGS });
  }

  async followUp(text = 'Summarise what you changed in the previous turn.') {
    return this.delegate({ leg: 'task', alias: 'follow-up', resume: 'earlier', text });
  }

  async followUpOnEarlierTask() {
    await this.earlierTask();
    return this.followUp();
  }

  async taskOnStandIn(behaviour) {
    await this.#driver.useStandInEngine(behaviour);
    return this.task();
  }

  async cancelledBackgroundTask() {
    await this.backgroundTaskStillWorking();
    await this.cancel();
  }

  async awaitJobEnd() {
    await this.#driver.awaitJobEnd(this.#job());
  }

  async earlierTask() {
    await this.#ensureProject();
    return this.task({ alias: 'earlier' });
  }

  async earlierTaskToldCodeword() {
    this.#codeword = mintCodeword();
    await this.#ensureProject();
    return this.task({
      alias: 'earlier',
      text: `${FIX_THE_DEFECT} Also remember the codeword ${this.#codeword} for a later turn. Do not write the codeword anywhere: not in any file, commit message or comment.`,
    });
  }

  async askForCodeword({ resumes }) {
    if (resumes === 'earlier') return this.delegate({ leg: 'task', alias: 'follow-up', resume: 'earlier', text: CODEWORD_QUESTION });
    if (resumes === 'fresh') return this.delegate({ leg: 'task', alias: 'fresh', fresh: true, text: CODEWORD_QUESTION });
    return this.delegate({ leg: 'task', alias: 'fresh', text: CODEWORD_QUESTION });
  }

  async jobWithoutConversation() {
    await this.#driver.useStandInEngine('exits-before-confirming-model');
    await this.#ensureProject();
    return this.task({ alias: 'earlier' });
  }

  async backgroundTaskStillWorking() {
    await this.#ensureProject();
    await this.#driver.useStandInEngine('works-until-released');
    return this.task({ background: true });
  }

  async jobAlreadyFinished(state) {
    if (state === 'cancelled') return this.cancelledBackgroundTask();
    return this.taskOnStandIn(state === 'succeeded' ? 'completes-normally' : 'exits-before-result');
  }

  async releaseEngine() {
    await this.#driver.releaseEngine(this.#job());
  }

  async cancel() {
    this.#beforeCancel = await this.#driver.readRecord(this.#job());
    await this.#driver.cancel(this.#job());
  }

  async readStatusAndResult() {
    await this.#driver.readStatus(this.#job());
    await this.#driver.readResult(this.#job());
  }

  async runSetup() {
    await this.#driver.runSetup();
  }

  async askSubagent(request) {
    await this.#driver.askSubagent(await this.#ensureProject(), request);
  }

  async confirmFindingsAreEngineOutput() {
    await this.#driver.confirmFindingsAreEngineOutput(this.#job());
  }

  async confirmFindingsSatisfySchema() {
    await this.#driver.confirmFindingsSatisfySchema(this.#job());
  }

  async confirmFirstFindingIsPlantedDefect() {
    await this.#driver.confirmFirstFindingAt(this.#job(), PLANTED_DEFECT);
  }

  async confirmEveryFindingComplete() {
    await this.#driver.confirmEveryFindingComplete(this.#job());
  }

  async confirmProjectUnchanged() {
    await this.#driver.confirmProjectUnchanged(this.#project);
  }

  async confirmDefectFixed() {
    await this.#driver.confirmDefectFixed(this.#project);
  }

  async confirmCodewordNowhereInProject() {
    await this.#driver.confirmTextNowhereInProject(this.#project, this.#codeword);
  }

  async confirmState(state) {
    await this.#driver.confirmStatusReads(this.#job(), state);
  }

  async confirmResultState(state) {
    await this.#driver.confirmResultReads(this.#job(), state);
  }

  async confirmVerifiedByOwnTurnInNewConversation() {
    await this.confirmState('succeeded');
    await this.#driver.confirmVerified(this.#job());
    await this.#driver.confirmPromptCarriesJobMarker(this.#job());
    await this.#driver.confirmProofMatchesConversation(this.#job());
    await this.#driver.confirmConversationStartedEmpty(this.#job());
  }

  async confirmSucceededAndUnverified(reason) {
    await this.confirmState('succeeded');
    await this.#driver.confirmUnverifiedBecause(this.#job(), reason);
  }

  async confirmEndedBecause(state, reason) {
    await this.#driver.confirmStatusEndedBecause(this.#job(), state, reason);
  }

  async confirmEndedResult(state, reason) {
    await this.#driver.confirmResultEndedBecause(this.#job(), state, reason);
    await this.#driver.confirmResultCarriesSettings(this.#job(), this.#requested);
    await this.#driver.confirmBodyAbsent(this.#job());
  }

  async confirmFailureNamesBothModels() {
    await this.#driver.confirmStatusEndedBecause(this.#job(), 'failed', 'model-mismatch');
    await this.#driver.confirmFailureNamesBothModels(this.#job());
  }

  async confirmConversationGrewInStore() {
    await this.#driver.confirmConversationGrewInStore(this.#job());
  }

  async confirmCarriesEngineResponseAndConversation() {
    await this.#driver.confirmCarriesEngineResponse(this.#job());
    await this.#driver.confirmNamesConversation(this.#job());
  }

  async confirmCarriesEngineResponse() {
    await this.#driver.confirmCarriesEngineResponse(this.#job());
  }

  async confirmNoBody() {
    await this.#driver.confirmBodyAbsent(this.#job());
  }

  async confirmAnswerContainsCodeword() {
    await this.#driver.confirmAnswerContains(this.#job(), this.#codeword);
  }

  async confirmAnswerLacksCodeword() {
    await this.#driver.confirmAnswerLacks(this.#job(), this.#codeword);
  }

  async confirmContinuedEarlierConversation() {
    await this.#driver.confirmSameConversation(this.#job(), this.#job('earlier'));
  }

  async confirmEngineAskedToContinueEarlierConversation() {
    await this.#driver.confirmEngineAskedToContinue(this.#job(), this.#job('earlier'));
  }

  async confirmConversationOfItsOwn() {
    await this.#driver.confirmDifferentConversation(this.#job(), this.#job('earlier'));
  }

  async confirmEngineAskedToContinueNothing() {
    await this.#driver.confirmEngineAskedToContinueNothing(this.#job());
  }

  async confirmNoConfirmationArrived() {
    await this.#driver.confirmNoConfirmationArrived(this.#job());
  }

  async confirmNamesEngineModel() {
    await this.#driver.confirmNamesEngineModel(this.#job());
  }

  async confirmEngineAskedForRequestedSettings() {
    await this.#driver.confirmEngineAskedFor(this.#job(), this.#requested);
  }

  async confirmEffortMarkedUnconfirmed() {
    await this.#driver.confirmEffortMarkedUnconfirmed(this.#job());
  }

  async confirmEngineAskedForDocumentedDefaults() {
    await this.#driver.confirmEngineAskedForDocumentedDefaults(this.#job());
  }

  async confirmEngineStreamsEvents() {
    await this.#driver.confirmEngineStreamsEvents(this.#job());
  }

  async confirmOnlyDelegationOptions() {
    await this.#driver.confirmOnlyDelegationOptions(this.#job(), ENGINE_OPTIONS);
  }

  async confirmReadOnlyWithSchema() {
    await this.#driver.confirmReadOnlyWithSchema(this.#job());
  }

  async confirmDefaultModeUnsandboxed() {
    await this.#driver.confirmDefaultModeUnsandboxed(this.#job());
  }

  async confirmReturnedWhileEngineWorking() {
    await this.#driver.confirmReturnedWhileEngineWorking(this.#job());
  }

  async confirmEngineStopped() {
    await this.#driver.confirmEngineStopped(this.#job());
  }

  async confirmReadersExited() {
    await this.#driver.confirmReadersExited(this.#job());
  }

  async confirmCancelReported(state) {
    await this.#driver.confirmCancelReported(this.#job(), state);
  }

  async confirmRecordUnchangedByCancel() {
    if (!this.#beforeCancel) throw new InstrumentError('the scenario compares a record with the one before a cancel without cancelling');
    await this.#driver.confirmRecordMatches(this.#job(), this.#beforeCancel);
  }

  async confirmNoEngineStarted() {
    await this.#driver.confirmNoEngineStarted(this.#job());
  }

  async confirmAtMostOneEngine() {
    await this.#driver.confirmAtMostOneEngine(this.#job());
  }

  async confirmEngineGoneAtFinish() {
    await this.#driver.confirmEngineGoneAtFinish(this.#job());
  }

  async confirmNothingLeftRunning() {
    await this.#driver.confirmNothingLeftRunning(this.#job(), LINGER_WINDOW_SECONDS);
  }

  async confirmSubagentMadeOneRuntimeCall() {
    await this.#driver.confirmSubagentMadeOneRuntimeCall();
  }

  async confirmRuntimeReceivedRouting(routing) {
    await this.#driver.confirmRuntimeReceivedRouting(routing);
  }

  async confirmRuntimeReceivedTaskText(text) {
    await this.#driver.confirmRuntimeReceivedTaskText(text);
  }

  async confirmSubagentReplyIsRuntimeOutput() {
    await this.#driver.confirmSubagentReplyIsRuntimeOutput();
  }

  async confirmSetupReportsEngineMissing() {
    await this.#driver.confirmSetupReportsEngineMissing();
  }

  async confirmSetupEndedUnsuccessfully() {
    await this.#driver.confirmSetupEndedUnsuccessfully();
  }

  async confirmSetupWroteNothing() {
    await this.#driver.confirmSetupWroteNothing();
  }

  async confirmSetupReportsEngine() {
    await this.#driver.confirmSetupReportsEngine();
  }

  async confirmSetupAskedOnlyAboutItself() {
    await this.#driver.confirmSetupAskedOnlyAboutItself();
  }

  async confirmSetupReportsAccountUnavailable() {
    await this.#driver.confirmSetupReportsAccountUnavailable();
  }
}

export class PluginSourceDsl {
  #driver;

  constructor(driver) {
    this.#driver = driver;
  }

  static async create() {
    return new PluginSourceDsl(await loadDriver(DRIVER_MODULES.pluginSource, PluginSourceDriver));
  }

  async confirm(rule) {
    if (typeof this.#driver[rule] !== 'function' || !(rule in PluginSourceDriver)) {
      throw new InstrumentError(`no plugin-source confirmation named ${rule}`);
    }
    await this.#driver[rule]();
  }
}
