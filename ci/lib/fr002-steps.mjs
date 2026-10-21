//status: Draft
import { Given, InstrumentError, Then, When } from './feature-runner.mjs';

const JOB = Object.freeze({
  'a task that succeeds verified': 'task-succeeds-verified',
  'a task that succeeds unverified': 'task-succeeds-unverified',
  'a review that succeeds': 'review-succeeds',
  'a review that fails': 'review-fails',
  'a task that fails': 'task-fails',
  'a task that is cancelled': 'task-cancelled',
  'a task held running': 'task-held-running',
});

const BLANK_REQUEST = Object.freeze({
  'an empty request': '',
  'a request of only whitespace': '  \t \n',
});

const REPORTED = Object.freeze({
  'running with no body': { state: 'running', noBody: true },
  cancelled: { state: 'cancelled', noBody: false },
});

function lookup(table, phrase, what) {
  if (!Object.hasOwn(table, phrase)) throw new InstrumentError(`the vocabulary has no ${what} called "${phrase}"`);
  return table[phrase];
}

export const listingSteps = [
  Given(/^these jobs were created in (.+?), oldest first: (.+)$/, (dsl, place, jobs) =>
    dsl.createJobs(place, jobs.split(', ').map((phrase) => lookup(JOB, phrase, 'kind of job')))),
  Given(/^a job was created in (.+)$/, (dsl, place) => dsl.createJobs(place, ['task-succeeds-unverified'])),
  Given(/^twelve jobs were created in the workspace$/, (dsl) => dsl.createSeries('the workspace', 12)),
  Given(/^four jobs were created in the workspace at the same instant$/, (dsl) => dsl.createAtOneInstant('the workspace', 4)),
  Given(/^twelve jobs were created alternately in the first and the second repository$/, (dsl) =>
    dsl.createAlternately(['the first repository', 'the second repository'], 12)),
  Given(/^the job store holds no job$/, () => {}),
  Given(/^every job's prompt carries a marker of its own, which the engine quotes back$/, (dsl) => dsl.markPrompts()),

  When(/^the jobs are listed from (.+)$/, (dsl, place) => dsl.list(place, { all: false })),
  When(/^the jobs of every workspace are listed from (.+)$/, (dsl, place) => dsl.list(place, { all: true })),
  When(/^the latest result is read from (.+)$/, (dsl, place) => dsl.readLatest(place)),
  When(/^the newest job's result is read by its id from (.+)$/, (dsl, place) => dsl.readNewestById(place)),
  When(/^a cancel is asked for with no job id from (.+)$/, (dsl, place) => dsl.cancelWithoutId(place)),
  When(/^the held task is released and finishes$/, (dsl) => dsl.releaseHeld()),
  When(/^the subagent is given (.+)$/, (dsl, phrase) => dsl.askSubagent(lookup(BLANK_REQUEST, phrase, 'blank request'))),

  Then(/^the listing shows exactly (.+), newest first$/, (dsl, selection) => dsl.confirmListsExactly(selection)),
  Then(/^every entry gives its job's id, leg, state, requested model and creation time$/, (dsl) => dsl.confirmEntriesIdentify()),
  Then(/^only a succeeded entry gives a verification, the one its job earned$/, (dsl) => dsl.confirmVerificationOnlyOnSucceeded()),
  Then(/^no entry gives a directory$/, (dsl) => dsl.confirmNoDirectories()),
  Then(/^every entry gives its job's directory$/, (dsl) => dsl.confirmDirectoriesGiven()),
  Then(/^the listings from the outside directory and from the symbolic link to it are identical$/, (dsl) => dsl.confirmSymlinkListsAsDirectory()),
  Then(/^the listing from the filesystem root equals the listing of every workspace, without directories$/, (dsl) => dsl.confirmRootListingIsEveryWorkspace()),
  Then(/^the readable listing says the workspace has no agy jobs$/, (dsl) => dsl.confirmReadableSaysNoJobs()),
  Then(/^the machine-readable listing is an empty list$/, (dsl) => dsl.confirmMachineReadableEmpty()),
  Then(/^the listing ends successfully$/, (dsl) => dsl.confirmListingSucceeded()),
  Then(/^the latest result says on its error stream that the workspace has no agy jobs$/, (dsl) => dsl.confirmLatestSaysNoJobsOnErrorStream()),
  Then(/^the latest result prints nothing on its output$/, (dsl) => dsl.confirmLatestPrintsNothing()),
  Then(/^the latest result ends as a failure$/, (dsl) => dsl.confirmLatestFailed()),
  Then(/^the latest result is, byte for byte, the newest job's result read by its id, with the same exit status$/, (dsl) => dsl.confirmLatestIsNewestById()),
  Then(/^the latest result reports the newest job as (.+)$/, (dsl, phrase) => {
    const { state, noBody } = lookup(REPORTED, phrase, 'reported state');
    return dsl.confirmLatestReports(state, { noBody });
  }),
  Then(/^the cancel is refused as a usage error$/, (dsl) => dsl.confirmCancelRefusedAsUsage()),
  Then(/^the cancel's error output says a job id is needed and names status as the way to list them$/, (dsl) => dsl.confirmCancelNamesStatus()),
  Then(/^the cancel started no process$/, (dsl) => dsl.confirmCancelStartedNothing()),
  Then(/^the job store is byte for byte as it was before the (cancel|reading)$/, (dsl, what) => dsl.confirmStoreUnchangedBy(what)),
  Then(/^the held job's engine is still running$/, (dsl) => dsl.confirmHeldEngineRunning()),
  Then(/^the reading returned within two seconds$/, (dsl) => dsl.confirmReturnedPromptly()),
  Then(/^the reading started no process other than git$/, (dsl) => dsl.confirmStartedOnlyGit()),
  Then(/^no listing carries any job's marker$/, (dsl) => dsl.confirmNoListingCarriesMarkers()),
  Then(/^the latest result carries a job's marker only inside the engine's own response or findings of a succeeded job$/, (dsl) => dsl.confirmLatestConfinesMarkers()),
  Then(/^the subagent made exactly one tool call, to the plugin runtime$/, (dsl) => dsl.confirmSubagentMadeOneRuntimeCall()),
  Then(/^the runtime was asked for status with no job id$/, (dsl) => dsl.confirmRuntimeAskedForStatusWithoutId()),
  Then(/^the subagent's reply is the runtime's output, unchanged$/, (dsl) => dsl.confirmSubagentReplyIsRuntimeOutput()),
];
