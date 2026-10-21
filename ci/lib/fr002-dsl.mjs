//status: Draft
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { InstrumentError } from './feature-runner.mjs';
import { DRIVER_MODULES, EXIT_STATUS, JOB_KINDS, ListingDriver, READ_DEADLINE_SECONDS } from './fr002-driver-contract.mjs';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const FIRST_INSTANT = Date.parse('2026-01-01T00:00:00.000Z');
const SPACING_MS = 1000;
const LISTING_LIMIT = 10;
const ONLY_GIT = Object.freeze(['git']);
const NOTHING = Object.freeze([]);

const PLACES = Object.freeze({
  'the workspace': { kind: 'repository' },
  'the first repository': { kind: 'repository' },
  'the second repository': { kind: 'repository' },
  'a subdirectory of the first repository': { kind: 'subdirectory', of: 'the first repository' },
  'the outside directory': { kind: 'outside-directory' },
  'a subdirectory of the outside directory': { kind: 'subdirectory', of: 'the outside directory' },
  'a sibling of the outside directory whose name begins with its name': { kind: 'prefix-sibling', of: 'the outside directory' },
  'a symbolic link to the outside directory': { kind: 'symlink', of: 'the outside directory' },
  'the filesystem root': { kind: 'filesystem-root' },
});

async function loadDriver(module, contract) {
  const path = join(REPO_ROOT, module.path);
  if (!existsSync(path)) throw new InstrumentError(`the FR-002 protocol driver is not implemented yet: ${module.path}`);
  const exported = await import(pathToFileURL(path).href);
  if (typeof exported[module.factory] !== 'function') throw new InstrumentError(`${module.path} does not export ${module.factory}`);
  const driver = await exported[module.factory]({ repoRoot: REPO_ROOT });
  const missing = Object.keys(contract).filter((name) => typeof driver?.[name] !== 'function');
  if (missing.length > 0) throw new InstrumentError(`${module.path} leaves contract methods unimplemented: ${missing.join(', ')}`);
  return driver;
}

function newestFirst(a, b) {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return Buffer.compare(Buffer.from(b.handle.id), Buffer.from(a.handle.id));
}

function mintMarker() {
  return `MARKER-${randomBytes(6).toString('hex').toUpperCase()}`;
}

export class ListingDsl {
  #driver;
  #places = new Map();
  #jobs = [];
  #nextInstant = FIRST_INSTANT;
  #marking = false;
  #listings = new Map();
  #last = null;
  #latest = null;
  #byId = null;
  #cancel = null;

  constructor(driver) {
    this.#driver = driver;
  }

  static async create() {
    return new ListingDsl(await loadDriver(DRIVER_MODULES.listing, ListingDriver));
  }

  async close() {
    await this.#driver.close();
  }

  async #place(alias) {
    if (!Object.hasOwn(PLACES, alias)) throw new InstrumentError(`the vocabulary has no place called "${alias}"`);
    if (!this.#places.has(alias)) {
      const { kind, of } = PLACES[alias];
      const parent = of ? await this.#place(of) : undefined;
      this.#places.set(alias, await this.#driver.createPlace(kind, parent));
    }
    return this.#places.get(alias);
  }

  #instant() {
    const instant = new Date(this.#nextInstant).toISOString();
    this.#nextInstant += SPACING_MS;
    return instant;
  }

  async #create(alias, kind, createdAt) {
    if (!Object.hasOwn(JOB_KINDS, kind)) throw new InstrumentError(`the vocabulary has no kind of job called "${kind}"`);
    const model = `stand-in-model-${String(this.#jobs.length + 1).padStart(2, '0')}`;
    const marker = this.#marking ? mintMarker() : undefined;
    const handle = await this.#driver.createJob({ place: await this.#place(alias), kind, createdAt, model, marker });
    this.#jobs.push({ handle, alias, kind, createdAt, model, marker, ...JOB_KINDS[kind] });
  }

  async createJobs(alias, kinds) {
    for (const kind of kinds) await this.#create(alias, kind, this.#instant());
  }

  async createSeries(alias, count) {
    await this.createJobs(alias, Array(count).fill('task-succeeds-unverified'));
  }

  async createAtOneInstant(alias, count) {
    const instant = this.#instant();
    for (let i = 0; i < count; i += 1) await this.#create(alias, 'task-succeeds-unverified', instant);
  }

  async createAlternately(aliases, count) {
    for (let i = 0; i < count; i += 1) await this.#create(aliases[i % aliases.length], 'task-succeeds-unverified', this.#instant());
  }

  markPrompts() {
    if (this.#jobs.length > 0) throw new InstrumentError('the scenario asks for marked prompts after creating jobs without them');
    this.#marking = true;
  }

  #heldJob() {
    const held = this.#jobs.filter((job) => job.state === 'running');
    if (held.length !== 1) throw new InstrumentError(`the scenario refers to the held job while ${held.length} jobs are held running`);
    return held[0];
  }

  async releaseHeld() {
    const job = this.#heldJob();
    await this.#driver.releaseHeldJob(job.handle);
    Object.assign(job, { state: 'succeeded', verification: 'unverified' });
  }

  async #observe(kind, alias, read) {
    const before = await this.#driver.snapshotStore();
    const from = await this.#place(alias);
    const readable = await read(from, 'readable');
    const machineReadable = await read(from, 'machine-readable');
    const operation = { kind, alias, readable, machineReadable, before };
    this.#last = operation;
    return operation;
  }

  async list(alias, { all }) {
    const operation = await this.#observe('listing', alias, (from, form) => this.#driver.listJobs({ from, all, form }));
    operation.all = all;
    this.#listings.set(`${alias}|${all}`, operation);
  }

  async readLatest(alias) {
    this.#latest = await this.#observe('latest', alias, (from, form) => this.#driver.readLatestResult({ from, form }));
  }

  async readNewestById(alias) {
    const job = this.#newestIn(alias);
    this.#byId = await this.#observe('by-id', alias, (from, form) => this.#driver.readResultOf({ job: job.handle, from, form }));
  }

  async cancelWithoutId(alias) {
    const before = await this.#driver.snapshotStore();
    this.#cancel = { before, reading: await this.#driver.cancelWithoutId({ from: await this.#place(alias) }) };
  }

  async askSubagent(request) {
    await this.#driver.askSubagent(await this.#place('the workspace'), request);
  }

  #newestIn(alias) {
    const [newest] = this.#jobs.filter((job) => job.alias === alias).sort(newestFirst);
    if (!newest) throw new InstrumentError(`the scenario refers to the newest job of ${alias} before creating one there`);
    return newest;
  }

  #listing() {
    if (!this.#last || this.#last.kind !== 'listing') throw new InstrumentError('the scenario checks a listing before listing any jobs');
    return this.#last;
  }

  #listingOf(alias, all) {
    const listing = this.#listings.get(`${alias}|${all}`);
    if (!listing) throw new InstrumentError(`the scenario compares a listing ${all ? 'of every workspace ' : ''}from ${alias} it never read`);
    return listing;
  }

  #latestRead() {
    if (!this.#latest) throw new InstrumentError('the scenario checks the latest result before reading it');
    return this.#latest;
  }

  #cancelled() {
    if (!this.#cancel) throw new InstrumentError('the scenario checks a cancel before asking for one');
    return this.#cancel;
  }

  #lastReading() {
    if (!this.#last) throw new InstrumentError('the scenario checks a reading before making one');
    return this.#last;
  }

  async #bothForms(operation, confirm) {
    await confirm(operation.readable);
    await confirm(operation.machineReadable);
  }

  #selection(phrase) {
    const ordered = [...this.#jobs].sort(newestFirst);
    const within = (aliases) => ordered.filter((job) => aliases.includes(job.alias));
    const selections = {
      'the jobs created': () => ordered,
      'the ten newest jobs created': () => ordered.slice(0, LISTING_LIMIT),
      'the jobs created in the first repository': () => within(['the first repository']),
      'the jobs created in the outside directory and its subdirectory': () => within(['the outside directory', 'a subdirectory of the outside directory']),
    };
    if (!Object.hasOwn(selections, phrase)) throw new InstrumentError(`the vocabulary has no selection of jobs called "${phrase}"`);
    const selected = selections[phrase]();
    if (selected.length === 0) throw new InstrumentError(`the scenario expects ${phrase} but created none`);
    return selected;
  }

  #facts(jobs) {
    return jobs.map(({ handle, leg, state, model, createdAt, verification }) => ({ job: handle, leg, state, model, createdAt, verification }));
  }

  #marked() {
    const marked = this.#jobs.filter((job) => job.marker).map(({ handle, marker }) => ({ job: handle, marker }));
    if (marked.length === 0) throw new InstrumentError('the scenario checks markers without creating any marked job');
    return marked;
  }

  async confirmListsExactly(phrase) {
    const expected = this.#selection(phrase).map((job) => job.handle);
    await this.#bothForms(this.#listing(), (reading) => this.#driver.confirmListsExactly(reading, expected));
  }

  async confirmEntriesIdentify() {
    const facts = this.#facts(this.#jobs);
    await this.#bothForms(this.#listing(), (reading) => this.#driver.confirmEntriesIdentify(reading, facts));
  }

  async confirmVerificationOnlyOnSucceeded() {
    const facts = this.#facts(this.#jobs);
    await this.#bothForms(this.#listing(), (reading) => this.#driver.confirmVerificationOnlyOnSucceeded(reading, facts));
  }

  async confirmNoDirectories() {
    const places = [...this.#places.values()];
    await this.#bothForms(this.#listing(), (reading) => this.#driver.confirmNoDirectories(reading, places));
  }

  async confirmDirectoriesGiven() {
    const jobs = this.#jobs.map((job) => ({ job: job.handle, place: this.#places.get(job.alias) }));
    await this.#bothForms(this.#listing(), (reading) => this.#driver.confirmDirectoriesGiven(reading, jobs));
  }

  async confirmSymlinkListsAsDirectory() {
    const direct = this.#listingOf('the outside directory', false);
    const linked = this.#listingOf('a symbolic link to the outside directory', false);
    await this.#driver.confirmIdentical(direct.readable, linked.readable);
    await this.#driver.confirmIdentical(direct.machineReadable, linked.machineReadable);
  }

  async confirmRootListingIsEveryWorkspace() {
    const root = this.#listingOf('the filesystem root', false);
    const all = this.#listingOf('the filesystem root', true);
    await this.#driver.confirmRootListing(
      { readable: root.readable, machineReadable: root.machineReadable },
      { readable: all.readable, machineReadable: all.machineReadable },
    );
  }

  async confirmReadableSaysNoJobs() {
    await this.#driver.confirmSaysNoJobs(this.#listing().readable, 'stdout');
  }

  async confirmMachineReadableEmpty() {
    await this.#driver.confirmEmptyList(this.#listing().machineReadable);
  }

  async confirmListingSucceeded() {
    await this.#bothForms(this.#listing(), (reading) => this.#driver.confirmExitStatus(reading, EXIT_STATUS.listed));
  }

  async confirmLatestSaysNoJobsOnErrorStream() {
    await this.#bothForms(this.#latestRead(), (reading) => this.#driver.confirmSaysNoJobs(reading, 'stderr'));
  }

  async confirmLatestPrintsNothing() {
    await this.#bothForms(this.#latestRead(), (reading) => this.#driver.confirmPrintsNothing(reading, 'stdout'));
  }

  async confirmLatestFailed() {
    await this.#bothForms(this.#latestRead(), (reading) => this.#driver.confirmExitStatus(reading, EXIT_STATUS.noJobsResult));
  }

  async confirmLatestIsNewestById() {
    const latest = this.#latestRead();
    if (!this.#byId) throw new InstrumentError("the scenario compares the latest result with the newest job's result without reading it by id");
    await this.#driver.confirmSameResult(latest.readable, this.#byId.readable);
    await this.#driver.confirmSameResult(latest.machineReadable, this.#byId.machineReadable);
  }

  async confirmLatestReports(state, { noBody }) {
    const latest = this.#latestRead();
    const newest = this.#newestIn(latest.alias);
    await this.#driver.confirmResultReports(latest.machineReadable, newest.handle, state);
    if (noBody) await this.#bothForms(latest, (reading) => this.#driver.confirmNoBody(reading));
  }

  async confirmCancelRefusedAsUsage() {
    await this.#driver.confirmExitStatus(this.#cancelled().reading, EXIT_STATUS.usage);
  }

  async confirmCancelNamesStatus() {
    await this.#driver.confirmNamesStatusForIds(this.#cancelled().reading);
  }

  async confirmCancelStartedNothing() {
    await this.#driver.confirmStartedOnly(this.#cancelled().reading, NOTHING);
  }

  async confirmStoreUnchangedBy(what) {
    const before = what === 'cancel' ? this.#cancelled().before : this.#lastReading().before;
    await this.#driver.confirmStoreMatches(before);
  }

  async confirmHeldEngineRunning() {
    await this.#driver.confirmEngineRunning(this.#heldJob().handle);
  }

  async confirmReturnedPromptly() {
    await this.#bothForms(this.#lastReading(), (reading) => this.#driver.confirmReturnedWithin(reading, READ_DEADLINE_SECONDS));
  }

  async confirmStartedOnlyGit() {
    await this.#bothForms(this.#lastReading(), (reading) => this.#driver.confirmStartedOnly(reading, ONLY_GIT));
  }

  async confirmNoListingCarriesMarkers() {
    const marked = this.#marked();
    await this.#bothForms(this.#listing(), (reading) => this.#driver.confirmMarkersAbsent(reading, marked));
  }

  async confirmLatestConfinesMarkers() {
    const marked = this.#marked();
    const latest = this.#latestRead();
    const newest = this.#newestIn(latest.alias).handle;
    await this.#bothForms(latest, (reading) => this.#driver.confirmMarkersConfinedToEngineOutput(reading, marked, newest));
  }

  async confirmSubagentMadeOneRuntimeCall() {
    await this.#driver.confirmSubagentMadeOneRuntimeCall();
  }

  async confirmRuntimeAskedForStatusWithoutId() {
    await this.#driver.confirmRuntimeAskedForStatusWithoutId();
  }

  async confirmSubagentReplyIsRuntimeOutput() {
    await this.#driver.confirmSubagentReplyIsRuntimeOutput();
  }
}
