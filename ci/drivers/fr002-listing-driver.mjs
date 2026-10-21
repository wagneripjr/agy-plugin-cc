import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { InstrumentError } from '../lib/feature-runner.mjs';
import { JOB_KINDS } from '../lib/fr002-driver-contract.mjs';
import { alive, canonical, findExecutable, git, subagentName, walkFiles, writeLauncher } from './fr001-delegation-driver.mjs';
import { hasOption, optionValue, readEngineRecords } from './fr001-engine-record.mjs';
import { PLUGIN_DATA_ENV, PLUGIN_ROOT, RUNTIME_ENTRY } from './fr001-plugin-layout.mjs';
import { GIT_TRACE_FILE, processStarts } from './fr002-process-starts.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLOCK = pathToFileURL(join(HERE, 'fr002-clock.mjs')).href;
const STORE_RECORDER = pathToFileURL(join(HERE, 'fr001-store-recorder.mjs')).href;
const RUNTIME_RECORDER = pathToFileURL(join(HERE, 'fr001-runtime-recorder.mjs')).href;
const STAND_IN = Object.freeze({
  'task-succeeds-verified': 'quotes-prompt-and-succeeds-in-a-recorded-conversation',
  'task-succeeds-unverified': 'quotes-prompt-and-succeeds',
  'review-succeeds': 'quotes-prompt-and-succeeds',
  'review-fails': 'quotes-prompt-and-reports-unsuccessful-result',
  'task-fails': 'quotes-prompt-and-reports-unsuccessful-result',
  'task-cancelled': 'quotes-prompt-and-succeeds-once-released',
  'task-held-running': 'quotes-prompt-and-succeeds-once-released',
});
const READING_ENGINE = 'task-succeeds-unverified';
const HELD = new Set(['task-cancelled', 'task-held-running']);
const DEADLINE = Object.freeze({ delegation: 15_000, background: 50_000, settle: 30_000, read: 10_000, cancel: 20_000, subagent: 300_000, subagentStart: 60_000 });
const QUIET_MS = 500;
const POLL_MS = 100;
const DISPATCH_TOOLS = Object.freeze(['Agent', 'Task']);
const SHELL_TOOL = 'Bash';
const WORD_CHAR = /[A-Za-z0-9_-]/;
const PATH_BEFORE = /[\s"'([{=:,]/;
const PATH_AFTER = /[\s"')\]},;]/;
const SHOWN = 4;
const PARENT_AGENT = 'fr002-dispatcher';

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

function brief(text, size = 100) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > size ? `${flat.slice(0, size)}...` : flat;
}

function rand() {
  return randomBytes(3).toString('hex');
}

function count(text, needle) {
  let found = 0;
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) found += 1;
  return found;
}

function positions(text, needle) {
  const found = [];
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) found.push(at);
  return found;
}

function hasWord(text, word, before = (c) => !WORD_CHAR.test(c), after = before) {
  return positions(text, word).some((at) => {
    const prev = at === 0 ? ' ' : text[at - 1];
    const next = at + word.length >= text.length ? ' ' : text[at + word.length];
    return before(prev) && after(next);
  });
}

function hasPath(text, path) {
  return hasWord(text, path, (c) => PATH_BEFORE.test(c), (c) => PATH_AFTER.test(c));
}

function covered(text, needle, copies) {
  const spans = copies.filter(Boolean).flatMap((copy) => positions(text, copy).map((at) => [at, at + copy.length]));
  return positions(text, needle).every((at) => spans.some(([from, to]) => at >= from && at + needle.length <= to));
}

function listed(problems) {
  return problems.length > SHOWN ? `${problems.slice(0, SHOWN).join('; ')}; and ${problems.length - SHOWN} more` : problems.join('; ');
}

function trimEnd(text) {
  return String(text).replace(/\n+$/, '');
}

function emptyBody(value) {
  if (value === undefined || value === null || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  return typeof value === 'object' && Object.keys(value).length === 0;
}

function strings(value, path = [], out = []) {
  if (typeof value === 'string') out.push({ path, value, key: false });
  else if (Array.isArray(value)) value.forEach((item, i) => strings(item, [...path, String(i)], out));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      out.push({ path: [...path, key], value: key, key: true });
      strings(item, [...path, key], out);
    }
  }
  return out;
}

function fieldsOf(finding) {
  return Object.values(finding ?? {}).filter((value) => typeof value === 'string' && value !== '');
}

class ListingDriver {
  #repoRoot;
  #runtime;
  #work;
  #observations;
  #data;
  #home;
  #placesDir;
  #bins = new Map();
  #jobs = new Map();
  #handles = new WeakMap();
  #places = [];
  #subagent = null;
  #children = new Set();

  constructor(repoRoot) {
    this.#repoRoot = repoRoot;
    this.#runtime = join(repoRoot, RUNTIME_ENTRY);
    this.#work = mkdtempSync(join(realpathSync(tmpdir()), 'fr002-'));
    this.#observations = join(this.#work, 'observations');
    this.#data = join(this.#work, 'plugin-data');
    this.#home = join(this.#work, 'home');
    this.#placesDir = join(this.#work, 'places');
    for (const dir of [this.#observations, this.#data, this.#home, this.#placesDir]) mkdirSync(dir, { recursive: true });
    if (!existsSync(this.#runtime)) throw new InstrumentError(`the plugin ships no runtime to read jobs through: ${RUNTIME_ENTRY} does not exist`);
  }

  #bin(kind) {
    const behaviour = STAND_IN[kind];
    if (!this.#bins.has(behaviour)) this.#bins.set(behaviour, writeLauncher(this.#work, 'fr001-stand-in-engine.mjs', 'standIn', { behaviour, observations: this.#observations }));
    return this.#bins.get(behaviour);
  }

  #storeRoot(store) {
    if (store === 'session') return this.#data;
    if (store === 'default') return this.#home;
    throw new InstrumentError(`the driver knows no job store called ${store}`);
  }

  #env({ store, from, engine = READING_ENGINE }) {
    const env = { ...process.env, HOME: this.#home, PATH: [this.#bin(engine), process.env.PATH].join(delimiter), PWD: from.path };
    delete env.NODE_OPTIONS;
    for (const name of Object.keys(env)) if (name.startsWith('GIT_TRACE')) delete env[name];
    if (this.#storeRoot(store) === this.#data) env[PLUGIN_DATA_ENV] = this.#data;
    else delete env[PLUGIN_DATA_ENV];
    return env;
  }

  #spawn(executable, args, { cwd, env, deadline, input = '', onLine }) {
    return new Promise((done) => {
      const startedAt = Date.now();
      const child = spawn(executable, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
      this.#children.add(child);
      const stdout = [];
      const stderr = [];
      let pending = '';
      let timedOut = false;
      child.stdout.on('data', (chunk) => {
        stdout.push(chunk);
        if (!onLine) return;
        pending += chunk.toString('utf8');
        const lines = pending.split('\n');
        pending = lines.pop();
        for (const line of lines) if (onLine(line, child) === 'stop') child.kill('SIGKILL');
      });
      child.stderr.on('data', (chunk) => { stderr.push(chunk); });
      child.stdin.on('error', () => {});
      child.stdin.end(input);
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, deadline);
      let settled = false;
      const settle = (code, signal, error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.#children.delete(child);
        const err = Buffer.concat(stderr);
        done({
          stdout: Buffer.concat(stdout),
          stderr: error ? Buffer.concat([err, Buffer.from(error.message)]) : err,
          code,
          signal,
          startedAt,
          endedAt: Date.now(),
          pid: child.pid ?? null,
          timedOut,
        });
      };
      child.on('error', (error) => settle(null, null, error));
      child.on('exit', (code, signal) => {
        child.on('close', () => settle(code, signal));
        setTimeout(() => settle(code, signal), 2000).unref();
      });
    });
  }

  async #invoke(args, { from, store, engine, deadline = DEADLINE.read, prefix = [] }) {
    const cwd = existsSync(from.path) ? from.path : this.#work;
    return this.#spawn(process.execPath, [...prefix, this.#runtime, ...args], { cwd, env: this.#env({ store, from, engine }), deadline });
  }

  #place(kind, path, real, extra = {}) {
    const place = { kind, path, real, ...extra };
    this.#places.push(place);
    return place;
  }

  #requirePlace(place, what) {
    if (!place || !this.#places.includes(place)) throw new InstrumentError(`${what} names a place this driver did not create`);
    return place;
  }

  #insideWorkTree(dir) {
    return git(dir, ['rev-parse', '--is-inside-work-tree']).stdout.trim() === 'true';
  }

  async createPlace(kind, of) {
    if (kind === 'repository') {
      const dir = mkdtempSync(join(this.#placesDir, 'repo-'));
      writeFileSync(join(dir, 'README.md'), '# Fixture\n\nA repository whose jobs are listed.\n');
      for (const args of [['init', '-q', '-b', 'master'], ['add', '--', 'README.md'], ['-c', 'user.name=FR-002 fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-q', '-m', 'Fixture']]) {
        const out = git(dir, args);
        if (out.status !== 0) throw new InstrumentError(`could not create the fixture repository: git ${args[0]} said ${brief(out.stderr, 160)}`);
      }
      return this.#place(kind, dir, dir);
    }
    if (kind === 'outside-directory') {
      const dir = mkdtempSync(join(this.#placesDir, 'outside-'));
      if (this.#insideWorkTree(dir)) throw new InstrumentError(`${dir} lies inside a git work tree, so it cannot serve as the outside directory`);
      return this.#place(kind, dir, dir);
    }
    if (kind === 'filesystem-root') {
      if (this.#insideWorkTree('/')) throw new InstrumentError('"/" lies inside a git work tree, so the filesystem root cannot be read as a workspace');
      return this.#place(kind, '/', '/');
    }
    const parent = this.#requirePlace(of, `a ${kind} place`);
    if (kind === 'subdirectory') {
      const dir = mkdtempSync(join(parent.real, 'sub-'));
      return this.#place(kind, dir, dir);
    }
    if (kind === 'prefix-sibling') {
      const dir = `${parent.real}-more-${rand()}`;
      mkdirSync(dir);
      return this.#place(kind, dir, dir);
    }
    if (kind === 'symlink') {
      const link = join(dirname(parent.real), `link-${rand()}`);
      symlinkSync(parent.real, link);
      return this.#place(kind, link, parent.real);
    }
    if (kind === 'unrelated-sibling') {
      const dir = mkdtempSync(join(dirname(parent.real), 'beside-'));
      return this.#place(kind, dir, dir);
    }
    throw new InstrumentError(`the driver cannot create a place of kind ${kind}`);
  }

  #job(handle) {
    const job = this.#handles.get(handle);
    if (!job) throw new InstrumentError('the scenario names a job this driver did not create');
    return job;
  }

  #label(job) {
    return `job #${job.n}`;
  }

  #names(ids) {
    if (ids.length === 0) return 'no job';
    return ids.map((id) => (this.#jobs.has(id) ? `#${this.#jobs.get(id).n}` : String(id))).join(' ');
  }

  #record(job) {
    const root = this.#storeRoot(job.store);
    const name = `${job.id}.json`;
    for (const rel of readdirSync(root, { recursive: true })) {
      if (basename(String(rel)) !== name) continue;
      try {
        const record = JSON.parse(readFileSync(join(root, String(rel)), 'utf8'));
        if (record?.id === job.id) return record;
      } catch {}
    }
    return null;
  }

  #engines(job) {
    const { from, until } = job.window;
    return readEngineRecords(this.#observations).filter((record) => hasOption(record.argv, 'print') && record.startedAt >= from && (until === undefined || record.startedAt < until));
  }

  #engineResult(engine) {
    return engine?.events.filter((event) => event.event === 'result').at(-1)?.result;
  }

  #snapshot() {
    const entries = new Map();
    for (const [label, root] of [['session store', this.#data], ['home', this.#home]]) {
      for (const line of walkFiles(root)) {
        if (line.endsWith('/')) entries.set(`${label}: ${line}`, 'directory');
        else {
          const at = line.lastIndexOf(' ');
          entries.set(`${label}: ${line.slice(0, at)}`, line.slice(at + 1));
        }
      }
    }
    return entries;
  }

  async #awaitQuietStores(job, deadline) {
    let last = canonical([...this.#snapshot()]);
    let since = Date.now();
    while (Date.now() - since < QUIET_MS) {
      if (Date.now() > deadline) throw new InstrumentError(`the job stores never went quiet for ${QUIET_MS}ms while ${this.#label(job)} was held`);
      await sleep(POLL_MS);
      const now = canonical([...this.#snapshot()]);
      if (now !== last) {
        last = now;
        since = Date.now();
      }
    }
  }

  async #awaitHeld(job) {
    const deadline = Date.now() + DEADLINE.settle;
    for (;;) {
      const [engine] = this.#engines(job);
      const init = engine?.events.find((event) => event.event === 'init');
      if (engine && alive(engine.pid) && init?.init?.model === job.model) break;
      if (Date.now() > deadline) throw new Error(`${this.#label(job)}'s engine never started and confirmed ${job.model}`);
      await sleep(POLL_MS);
    }
    await this.#awaitQuietStores(job, deadline);
  }

  async #readById(job) {
    const run = await this.#invoke(['result', job.id, '--json'], { from: job.place, store: job.store });
    try {
      return JSON.parse(run.stdout.toString('utf8'));
    } catch {
      return null;
    }
  }

  async #awaitState(job, state, deadline = DEADLINE.settle) {
    const until = Date.now() + deadline;
    let seen = null;
    for (;;) {
      seen = (await this.#readById(job))?.state ?? 'unreadable';
      if (seen === state) return;
      if (Date.now() > until) throw new Error(`${this.#label(job)} reads ${seen}, not ${state}, ${Math.round(deadline / 1000)}s after it was started`);
      await sleep(POLL_MS);
    }
  }

  #confirmCreatedAt(job) {
    const record = this.#record(job);
    if (!record) throw new InstrumentError(`${this.#label(job)} (${job.id}) has no record in the ${job.store} job store`);
    if (record.createdAt !== job.createdAt) throw new InstrumentError(`${this.#label(job)} (${job.id}) was recorded as created at ${record.createdAt}, not the requested ${job.createdAt}`);
  }

  async createJob({ place, kind, createdAt, model, store = 'session', marker }) {
    const at = this.#requirePlace(place, 'a job');
    if (at.kind === 'filesystem-root') throw new InstrumentError('the driver never creates a job at the filesystem root');
    const facts = JOB_KINDS[kind];
    if (!facts) throw new InstrumentError(`the driver knows no kind of job called ${kind}`);
    const n = this.#jobs.size + 1;
    const text = `${facts.leg === 'review' ? 'Check the fixture for listing' : 'Stand-in job'} ${n}${marker ? ` ${marker}` : ''}`;
    const held = HELD.has(kind);
    const args = [facts.leg, ...(held ? ['--background'] : []), '--model', model, '--effort', 'low', '--json', '--', text];
    const sessionBefore = store === 'default' ? canonical(walkFiles(this.#data)) : null;
    const clock = `--import=${CLOCK}?${new URLSearchParams({ at: createdAt, store: this.#storeRoot(store) })}`;
    const window = { from: Date.now(), until: undefined };
    const run = await this.#invoke(args, { from: at, store, engine: kind, prefix: [clock], deadline: held ? DEADLINE.background : DEADLINE.delegation });
    let id;
    try {
      id = JSON.parse(run.stdout.toString('utf8'))?.id;
    } catch {}
    if (typeof id !== 'string') throw new Error(`the ${facts.leg} delegation for job #${n} reported no job id (exit ${run.code}): ${brief(run.stderr.toString() || run.stdout.toString(), 160)}`);
    const handle = Object.freeze({ id });
    const job = { id, n, kind, place: at, store, marker, model, createdAt, window, handle, ...facts };
    this.#jobs.set(id, job);
    this.#handles.set(handle, job);
    this.#confirmCreatedAt(job);
    if (store === 'default' && canonical(walkFiles(this.#data)) !== sessionBefore) {
      throw new InstrumentError(`${this.#label(job)} was asked of the default job store but the session's job store changed`);
    }
    if (held) await this.#awaitHeld(job);
    if (kind === 'task-cancelled') {
      const cancel = await this.#invoke(['cancel', job.id, '--json'], { from: at, store, deadline: DEADLINE.cancel });
      if (cancel.timedOut) throw new Error(`the cancel of ${this.#label(job)} did not finish`);
    }
    await this.#awaitState(job, facts.state);
    window.until = Date.now();
    return handle;
  }

  async removePlace(place) {
    const target = this.#requirePlace(place, 'a removal');
    if (!['subdirectory', 'prefix-sibling'].includes(target.kind)) throw new InstrumentError(`a ${target.kind} place cannot be removed`);
    rmSync(target.real, { recursive: true, force: true });
    target.removed = true;
  }

  async relinkPlace(place, target) {
    const from = this.#requirePlace(place, 'a relink');
    const to = this.#requirePlace(target, 'a relink');
    if (from.kind !== 'unrelated-sibling') throw new InstrumentError(`only an unrelated-sibling place can be relinked, not a ${from.kind}`);
    if (!['repository', 'subdirectory', 'outside-directory'].includes(to.kind)) throw new InstrumentError(`a place cannot be relinked to a ${to.kind}`);
    renameSync(from.path, join(dirname(from.path), `moved-${rand()}`));
    symlinkSync(to.real, from.path);
    if (!lstatSync(from.path).isSymbolicLink() || realpathSync(from.path) !== to.real) throw new InstrumentError(`${from.path} did not become a link to ${to.real}`);
    from.relinkedTo = to;
  }

  async checkRecordedThroughLink(handle, place) {
    const job = this.#job(handle);
    const link = this.#requirePlace(place, 'a recorded-link check');
    const record = this.#record(job);
    const problems = [];
    if (!link.relinkedTo) problems.push('its place was never relinked');
    if (record?.cwd !== link.path) problems.push(`its record holds ${record?.cwd ?? 'no directory'}, not ${link.path}`);
    else if (!lstatSync(link.path, { throwIfNoEntry: false })?.isSymbolicLink()) problems.push(`${link.path} is not a symbolic link`);
    else if (realpathSync(link.path) !== link.relinkedTo?.real) problems.push(`${link.path} resolves to ${realpathSync(link.path)}, not ${link.relinkedTo?.real}`);
    if (problems.length > 0) throw new InstrumentError(`${this.#label(job)} is not recorded through a link: ${problems.join('; ')}`);
  }

  async releaseHeldJob(handle) {
    const job = this.#job(handle);
    const engines = this.#engines(job);
    if (engines.length === 0) throw new Error(`no engine was started for ${this.#label(job)}, so there is nothing to release`);
    for (const engine of engines) writeFileSync(join(this.#observations, `release-${engine.pid}`), '');
    await this.#awaitState(job, 'succeeded');
  }

  async snapshotStore() {
    return Object.freeze({ entries: this.#snapshot() });
  }

  async #reading(args, { from, form, store, describe }) {
    const place = this.#requirePlace(from, 'a reading');
    const observations = mkdtempSync(join(this.#work, 'reading-'));
    const settings = new URLSearchParams({ observations, store: this.#data, plugin: join(this.#repoRoot, PLUGIN_ROOT) });
    const argv = form === 'machine-readable' ? [...args, '--json'] : args;
    const env = this.#env({ store, from: place });
    env.GIT_TRACE2_EVENT = join(observations, GIT_TRACE_FILE);
    const run = await this.#spawn(process.execPath, [`--import=${STORE_RECORDER}?${settings}`, this.#runtime, ...argv], { cwd: place.path, env, deadline: DEADLINE.read });
    return Object.freeze({ ...run, argv, form, store, from: place, observations, returned: !run.timedOut, label: `\`${argv.join(' ')}\` from the ${describe ?? place.kind}` });
  }

  async listJobs({ from, all, form, store = 'session' }) {
    return this.#reading(['status', ...(all ? ['--all'] : [])], { from, form, store });
  }

  async readLatestResult({ from, form, store = 'session' }) {
    return this.#reading(['result'], { from, form, store });
  }

  async readResultOf({ job, from, form, store = 'session' }) {
    const target = this.#job(job);
    return this.#reading(['result', target.id], { from, form, store, describe: `${from.kind}, for ${this.#label(target)}` });
  }

  async cancelWithoutId({ from }) {
    return this.#reading(['cancel'], { from, form: 'readable', store: 'session' });
  }

  #text(reading, stream = 'stdout') {
    return reading[stream].toString('utf8');
  }

  #document(reading, what) {
    try {
      return JSON.parse(this.#text(reading));
    } catch {
      throw new Error(`${reading.label} printed no JSON ${what} (exit ${reading.code}): ${brief(this.#text(reading) || this.#text(reading, 'stderr'), 120)}`);
    }
  }

  #array(reading) {
    const doc = this.#document(reading, 'array');
    if (!Array.isArray(doc)) throw new Error(`${reading.label} printed JSON that is not an array: ${brief(this.#text(reading), 120)}`);
    return doc;
  }

  #entries(reading) {
    const text = this.#text(reading);
    const found = [...this.#jobs.keys()].map((id) => ({ id, at: text.indexOf(id) })).filter(({ at }) => at !== -1).sort((a, b) => a.at - b.at);
    return found.map(({ id, at }, i) => ({ id, text: text.slice(at, found[i + 1]?.at ?? text.length) }));
  }

  #listedIds(reading) {
    if (reading.form === 'machine-readable') return this.#array(reading).map((element) => element?.id);
    return this.#entries(reading).map((entry) => entry.id);
  }

  #requireReading(reading) {
    if (!reading || !Buffer.isBuffer(reading.stdout)) throw new InstrumentError('the scenario checks a reading this driver did not make');
    return reading;
  }

  async confirmExitStatus(reading, status) {
    this.#requireReading(reading);
    if (!reading.returned) throw new Error(`${reading.label} did not return within ${DEADLINE.read / 1000}s`);
    if (reading.code !== status) throw new Error(`${reading.label} exited ${reading.code ?? reading.signal}, not ${status}: ${brief(this.#text(reading, 'stderr') || this.#text(reading), 100)}`);
  }

  async confirmListsExactly(reading, expected) {
    this.#requireReading(reading);
    const got = this.#listedIds(reading);
    const want = expected.map((handle) => this.#job(handle).id);
    if (canonical(got) !== canonical(want)) throw new Error(`${reading.label} lists ${this.#names(got)}, not ${this.#names(want)}`);
  }

  #factsById(facts) {
    return new Map(facts.map((fact) => [this.#job(fact.job).id, fact]));
  }

  async confirmEntriesIdentify(reading, facts) {
    this.#requireReading(reading);
    const byId = this.#factsById(facts);
    const problems = [];
    const check = (id, has, given) => {
      const fact = byId.get(id);
      const name = this.#names([id]);
      if (!fact) return problems.push(`${name} is not a job of the scenario`);
      for (const field of ['leg', 'state', 'model']) if (!has(field, fact[field])) problems.push(`${name} does not give its ${field} ${fact[field]}`);
      if (!has('createdAt', fact.createdAt)) problems.push(`${name} was created at ${fact.createdAt}, but the listing gives ${given ?? 'no such instant'}`);
      return undefined;
    };
    if (reading.form === 'machine-readable') {
      for (const element of this.#array(reading)) {
        if (typeof element?.id !== 'string') problems.push(`an element has no string id: ${brief(JSON.stringify(element), 80)}`);
        else check(element.id, (field, value) => typeof element[field] === 'string' && element[field] === value, JSON.stringify(element.createdAt));
      }
    } else {
      for (const entry of this.#entries(reading)) check(entry.id, (field, value) => hasWord(entry.text, String(value)));
    }
    if (problems.length > 0) throw new Error(`${reading.label} misidentifies entries: ${listed([...new Set(problems)])}`);
  }

  async confirmVerificationOnlyOnSucceeded(reading, facts) {
    this.#requireReading(reading);
    const byId = this.#factsById(facts);
    const problems = [];
    if (reading.form === 'machine-readable') {
      for (const element of this.#array(reading)) {
        const fact = byId.get(element?.id);
        if (!fact) continue;
        const name = this.#label(this.#jobs.get(element.id));
        const want = fact.state === 'succeeded' ? fact.verification : null;
        if (!Object.hasOwn(element, 'verification') || element.verification !== want) problems.push(`${name} gives verification ${JSON.stringify(element.verification)}, not ${JSON.stringify(want)}`);
      }
    } else {
      for (const entry of this.#entries(reading)) {
        const fact = byId.get(entry.id);
        if (!fact) continue;
        const name = this.#label(this.#jobs.get(entry.id));
        const shows = { verified: hasWord(entry.text, 'verified'), unverified: hasWord(entry.text, 'unverified') };
        if (fact.state !== 'succeeded') {
          if (shows.verified || shows.unverified) problems.push(`${name} reads ${fact.state} yet gives a verification`);
        } else if (!shows[fact.verification] || shows[fact.verification === 'verified' ? 'unverified' : 'verified']) {
          problems.push(`${name} does not give exactly its verification ${fact.verification}`);
        }
      }
    }
    if (problems.length > 0) throw new Error(`${reading.label} misreports verification: ${listed(problems)}`);
  }

  #directoryNeedles(places) {
    return places.flatMap((place) => [place.real !== '/' ? place.real : null, place.kind === 'symlink' || place.relinkedTo ? place.path : null]).filter(Boolean);
  }

  async confirmNoDirectories(reading, places) {
    this.#requireReading(reading);
    const problems = [];
    if (reading.form === 'machine-readable') {
      for (const element of this.#array(reading)) if (element && Object.hasOwn(element, 'directory')) problems.push(`${this.#names([element.id])} has a directory field`);
    } else {
      const needles = this.#directoryNeedles(places.map((place) => this.#requirePlace(place, 'a directory check')));
      for (const entry of this.#entries(reading)) {
        const shown = needles.filter((needle) => entry.text.includes(needle));
        if (shown.length > 0) problems.push(`${this.#names([entry.id])} shows ${shown.join(', ')}`);
      }
    }
    if (problems.length > 0) throw new Error(`${reading.label} gives directories: ${listed(problems)}`);
  }

  async confirmDirectoriesGiven(reading, jobs) {
    this.#requireReading(reading);
    const expected = new Map(jobs.map(({ job, place }) => [this.#job(job).id, this.#requirePlace(place, 'a directory check')]));
    const relinked = this.#places.filter((place) => place.relinkedTo).map((place) => place.path);
    const problems = [];
    if (reading.form === 'machine-readable') {
      for (const element of this.#array(reading)) {
        const place = expected.get(element?.id);
        if (!place) problems.push(`${this.#names([element?.id])} is not a job of the scenario`);
        else if (element.directory !== place.real) problems.push(`${this.#names([element.id])} gives ${JSON.stringify(element.directory)}, not ${place.real}`);
      }
    } else {
      for (const entry of this.#entries(reading)) {
        const place = expected.get(entry.id);
        if (!place) problems.push(`${this.#names([entry.id])} is not a job of the scenario`);
        else if (!hasPath(entry.text, place.real)) problems.push(`${this.#names([entry.id])} does not give ${place.real}`);
        const links = relinked.filter((path) => entry.text.includes(path));
        if (links.length > 0) problems.push(`${this.#names([entry.id])} gives the relinked ${links.join(', ')}`);
      }
    }
    if (problems.length > 0) throw new Error(`${reading.label} misgives directories: ${listed(problems)}`);
  }

  async confirmIdentical(a, b) {
    this.#requireReading(a);
    this.#requireReading(b);
    const differs = [
      a.stdout.equals(b.stdout) ? null : 'stdout',
      a.stderr.equals(b.stderr) ? null : 'stderr',
      a.code === b.code ? null : `exit ${a.code} against ${b.code}`,
    ].filter(Boolean);
    if (differs.length > 0) throw new Error(`${a.label} and ${b.label} differ in ${differs.join(', ')}`);
  }

  async confirmRootListing(root, all) {
    for (const reading of [root.readable, root.machineReadable, all.readable, all.machineReadable]) await this.confirmExitStatus(reading, 0);
    const rootArray = this.#array(root.machineReadable);
    const allArray = this.#array(all.machineReadable);
    const places = new Set(allArray.map((element) => this.#jobs.get(element?.id)?.place).filter(Boolean));
    if (places.size < 2) throw new InstrumentError(`the listing of every workspace holds jobs of ${places.size} place(s), so it cannot show the root holding every workspace`);
    const stripped = allArray.map((element) => {
      const { directory, ...rest } = element ?? {};
      void directory;
      return rest;
    });
    if (canonical(rootArray) !== canonical(stripped)) throw new Error(`${root.machineReadable.label} lists ${this.#names(rootArray.map((e) => e?.id))}, while every workspace without directories lists ${this.#names(stripped.map((e) => e?.id))}${canonical(rootArray.map((e) => e?.id)) === canonical(stripped.map((e) => e?.id)) ? ' (same jobs, different fields)' : ''}`);
    const rootIds = this.#listedIds(root.readable);
    const allIds = this.#listedIds(all.readable);
    if (canonical(rootIds) !== canonical(allIds)) throw new Error(`${root.readable.label} lists ${this.#names(rootIds)}, not ${this.#names(allIds)}`);
  }

  async confirmSaysNoJobs(reading, stream) {
    this.#requireReading(reading);
    if (!this.#text(reading, stream).toLowerCase().includes('no agy jobs')) throw new Error(`${reading.label} does not say on ${stream} that there are no agy jobs: ${brief(this.#text(reading, stream), 100) || '(nothing)'}`);
  }

  async confirmEmptyList(reading) {
    this.#requireReading(reading);
    const array = this.#array(reading);
    if (array.length !== 0) throw new Error(`${reading.label} lists ${this.#names(array.map((e) => e?.id))}, not an empty list`);
  }

  async confirmPrintsNothing(reading, stream) {
    this.#requireReading(reading);
    if (reading[stream].length > 0) throw new Error(`${reading.label} prints on ${stream}: ${brief(this.#text(reading, stream), 100)}`);
  }

  async confirmSameResult(latest, byId) {
    this.#requireReading(latest);
    this.#requireReading(byId);
    const differs = [
      latest.stdout.equals(byId.stdout) ? null : 'stdout',
      latest.stderr.equals(byId.stderr) ? null : 'stderr',
      latest.code === byId.code ? null : `exit ${latest.code} against ${byId.code}`,
    ].filter(Boolean);
    if (differs.length > 0) throw new Error(`${latest.label} differs from ${byId.label} in ${differs.join(', ')}: ${brief(this.#text(latest) || this.#text(latest, 'stderr'), 80)}`);
  }

  async confirmResultReports(reading, handle, state) {
    this.#requireReading(reading);
    const job = this.#job(handle);
    const doc = this.#document(reading, 'result');
    if (doc?.id !== job.id || doc?.state !== state) throw new Error(`${reading.label} reports ${this.#names([doc?.id])} as ${doc?.state}, not ${this.#label(job)} as ${state}`);
  }

  async confirmResultNames(reading, handle, others) {
    this.#requireReading(reading);
    const job = this.#job(handle);
    const otherIds = others.map((other) => this.#job(other).id);
    if (reading.form === 'machine-readable') {
      const doc = this.#document(reading, 'result');
      if (doc?.id !== job.id) throw new Error(`${reading.label} names ${this.#names([doc?.id])}, not ${this.#label(job)}`);
      return;
    }
    const text = this.#text(reading);
    const named = [job.id, ...otherIds].filter((id) => text.includes(id));
    if (!named.includes(job.id) || named.length !== 1) throw new Error(`${reading.label} names ${this.#names(named)}, not ${this.#label(job)} alone`);
  }

  async confirmNoBody(reading) {
    this.#requireReading(reading);
    if (reading.form === 'machine-readable') {
      const doc = this.#document(reading, 'result');
      const body = ['response', 'findings'].filter((field) => !emptyBody(doc?.[field]));
      if (body.length > 0) throw new Error(`${reading.label} carries a ${body.join(' and ')} body`);
      return;
    }
    const text = this.#text(reading);
    const responses = readEngineRecords(this.#observations).map((engine) => this.#engineResult(engine)?.response).filter((response) => typeof response === 'string');
    const lines = [...new Set(responses.flatMap((response) => response.split('\n')).map((line) => line.trim()).filter(Boolean))];
    const carried = lines.filter((line) => text.includes(line));
    if (carried.length > 0) throw new Error(`${reading.label} carries a line of an engine's final response: ${brief(carried[0], 80)}`);
  }

  async confirmNamesStatusForIds(reading) {
    this.#requireReading(reading);
    const said = this.#text(reading, 'stderr');
    if (!said.toLowerCase().includes('job id') || !/\bstatus\b/i.test(said)) throw new Error(`${reading.label} does not say on stderr that a job id is needed and that status lists them: ${brief(said, 120) || '(nothing)'}`);
  }

  async confirmStoreMatches(before) {
    if (!(before?.entries instanceof Map)) throw new InstrumentError('the scenario compares the job store with a snapshot this driver did not take');
    const now = this.#snapshot();
    const problems = [];
    for (const [path, digest] of now) {
      if (!before.entries.has(path)) problems.push(`added ${path}`);
      else if (before.entries.get(path) !== digest) problems.push(`changed ${path}`);
    }
    for (const path of before.entries.keys()) if (!now.has(path)) problems.push(`removed ${path}`);
    if (problems.length > 0) throw new Error(`the job store changed: ${listed(problems)}`);
  }

  async confirmReturnedWithin(reading, seconds) {
    this.#requireReading(reading);
    const took = reading.endedAt - reading.startedAt;
    if (!reading.returned || took >= seconds * 1000) throw new Error(`${reading.label} ${reading.returned ? `took ${took}ms` : 'did not return'}, not under ${seconds}s`);
  }

  async confirmEngineRunning(handle) {
    const job = this.#job(handle);
    const engines = this.#engines(job);
    if (engines.length === 0) throw new Error(`no engine was started for ${this.#label(job)}`);
    if (!engines.some((engine) => alive(engine.pid))) throw new Error(`${this.#label(job)}'s engine is no longer running`);
  }

  async confirmStartedOnly(reading, allowed) {
    this.#requireReading(reading);
    if (!reading.pid) throw new Error(`${reading.label} never started, so its starts could not be observed`);
    const { starts, problems } = processStarts({ observations: reading.observations, pid: reading.pid, runtime: this.#runtime });
    if (problems.length > 0) throw new Error(`the processes ${reading.label} started could not be observed: ${listed(problems)}`);
    const other = starts.filter((start) => !allowed.includes(start.name));
    if (other.length > 0) throw new Error(`${reading.label} started ${[...new Set(other.map((start) => start.name))].join(', ')}, beyond ${allowed.length > 0 ? allowed.join(', ') : 'nothing'}`);
  }

  #markedJobs(marked) {
    return marked.map(({ job, marker }) => {
      const target = this.#job(job);
      const [engine] = this.#engines(target);
      if (!engine) throw new InstrumentError(`no engine was started for ${this.#label(target)}, so its marker cannot be traced`);
      if (!(optionValue(engine.argv, 'print') ?? '').includes(marker)) throw new InstrumentError(`${this.#label(target)}'s engine never received its marker`);
      const response = this.#engineResult(engine)?.response;
      if (typeof response === 'string' && !response.includes(marker)) throw new InstrumentError(`${this.#label(target)}'s engine did not quote its marker in its final response`);
      return { job: target, marker, engine };
    });
  }

  async confirmMarkersAbsent(reading, marked) {
    this.#requireReading(reading);
    const traced = this.#markedJobs(marked);
    const carried = traced.filter(({ marker }) => this.#text(reading).includes(marker) || this.#text(reading, 'stderr').includes(marker));
    if (carried.length > 0) throw new Error(`${reading.label} carries the prompt markers of ${carried.map(({ job }) => this.#label(job)).join(', ')}`);
  }

  async confirmMarkersConfinedToEngineOutput(reading, marked, newest) {
    this.#requireReading(reading);
    const traced = this.#markedJobs(marked);
    const target = this.#job(newest);
    const own = traced.find(({ job }) => job === target);
    if (!own) throw new InstrumentError(`${this.#label(target)}, the newest job, carries no marker`);
    const result = this.#engineResult(own.engine) ?? {};
    const response = typeof result.response === 'string' ? result.response : null;
    const findings = Array.isArray(result.structured_output?.findings) ? result.structured_output.findings : [];
    const state = this.#record(target)?.state ?? 'unrecorded';
    const out = this.#text(reading);
    const err = this.#text(reading, 'stderr');
    const name = (job) => `${this.#label(job)}'s marker`;
    const problems = [];
    for (const { job, marker } of traced) if (err.includes(marker)) problems.push(`stderr carries ${name(job)}`);
    if (state !== 'succeeded') {
      for (const { job, marker } of traced) if (out.includes(marker)) problems.push(`stdout carries ${name(job)} though ${this.#label(target)} reads ${state}`);
    } else {
      const placement = reading.form === 'machine-readable'
        ? this.#jsonPlacement(out, traced, response, findings)
        : this.#readablePlacement(out, traced, response, findings, target.leg);
      problems.push(...placement);
      for (const { job, marker } of traced) {
        const budget = (response ? count(response, marker) : 0) + findings.reduce((sum, finding) => sum + fieldsOf(finding).reduce((inner, field) => inner + count(field, marker), 0), 0);
        const seen = count(out, marker);
        if (seen > budget) problems.push(`stdout carries ${name(job)} ${seen} times, more than the ${budget} the engine's own output holds`);
      }
      if (!out.includes(own.marker)) problems.push(`stdout never carries ${name(target)}, so there is nothing to confine`);
    }
    if (problems.length > 0) throw new Error(`${reading.label} carries prompt text outside the engine's own output: ${listed([...new Set(problems)])}`);
  }

  #jsonPlacement(out, traced, response, findings) {
    let doc;
    try {
      doc = JSON.parse(out);
    } catch {
      return traced.some(({ marker }) => out.includes(marker)) ? ['stdout is not one JSON document, yet carries a marker'] : [];
    }
    const problems = [];
    const found = strings(doc);
    const findingFields = findings.flatMap(fieldsOf);
    for (const { job, marker } of traced) {
      const inStrings = found.reduce((sum, { value }) => sum + count(value, marker), 0);
      if (inStrings !== count(out, marker)) problems.push(`${this.#label(job)}'s marker sits outside the document's values`);
      for (const { path, value, key } of found) {
        if (!value.includes(marker)) continue;
        const permitted = key ? [] : path.length === 1 && path[0] === 'response' ? [response] : path[0] === 'findings' && path.length > 1 ? findingFields : [];
        if (permitted.length === 0 || !covered(value, marker, permitted)) problems.push(`${this.#label(job)}'s marker sits in ${key ? 'the key ' : ''}${path.join('.') || '(root)'}`);
      }
    }
    return problems;
  }

  #readablePlacement(out, traced, response, findings, leg) {
    const lines = out.split('\n');
    const blank = lines.indexOf('');
    const header = blank === -1 ? lines : lines.slice(0, blank);
    const body = blank === -1 ? [] : lines.slice(blank + 1);
    const problems = [];
    for (const { job, marker } of traced) if (header.some((line) => line.includes(marker))) problems.push(`the header carries ${this.#label(job)}'s marker`);
    if (leg === 'task') {
      const isResponse = response !== null && trimEnd(body.join('\n')) === trimEnd(response);
      if (!isResponse) for (const { job, marker } of traced) if (body.some((line) => line.includes(marker))) problems.push(`a body that is not the final response carries ${this.#label(job)}'s marker`);
      return problems;
    }
    const findingText = new Map();
    for (let i = 0; i < body.length; i += 1) {
      const n = Number(/^(\d+)\. /.exec(body[i])?.[1]);
      if (!n || n > findings.length || !body[i + 1]?.startsWith('   Evidence: ')) continue;
      findingText.set(i, { n, text: body[i].slice(`${n}. `.length) });
      findingText.set(i + 1, { n, text: body[i + 1].slice('   Evidence: '.length) });
    }
    body.forEach((line, i) => {
      for (const { job, marker } of traced) {
        if (!line.includes(marker)) continue;
        const place = findingText.get(i);
        const fields = place ? fieldsOf(findings[place.n - 1]) : [];
        if (!place || !fields.some((field) => place.text.includes(field)) || !covered(place.text, marker, fields)) problems.push(`body line ${i + 1} carries ${this.#label(job)}'s marker outside a finding's own text`);
      }
    });
    return problems;
  }

  async askSubagent(place, request) {
    const from = this.#requirePlace(place, 'the subagent');
    const claude = findExecutable('claude', process.env.PATH ?? '');
    if (!claude) throw new InstrumentError('Claude Code (claude) is not installed, so the subagent cannot be asked');
    const agent = subagentName(this.#repoRoot);
    const observations = mkdtempSync(join(this.#work, 'subagent-'));
    const env = {
      ...process.env,
      PATH: [this.#bin(READING_ENGINE), process.env.PATH].join(delimiter),
      PWD: from.path,
      [PLUGIN_DATA_ENV]: this.#data,
      NODE_OPTIONS: `--import=${RUNTIME_RECORDER}`,
      FR001_RUNTIME_ENTRY: this.#runtime,
      FR001_RUNTIME_OBSERVATIONS: observations,
    };
    const parent = { [PARENT_AGENT]: { description: 'Dispatches one subagent as told and does nothing else', prompt: 'You dispatch exactly one subagent as you are told, and do nothing else.', tools: DISPATCH_TOOLS.slice(0, 1) } };
    const args = ['-p', '--plugin-dir', join(this.#repoRoot, PLUGIN_ROOT), '--agents', JSON.stringify(parent), '--agent', PARENT_AGENT,
      '--output-format', 'stream-json', '--verbose', '--forward-subagent-text', '--setting-sources', 'project', '--strict-mcp-config',
      '--permission-prompts', 'none', '--allowedTools', DISPATCH_TOOLS[0], SHELL_TOOL, '--no-session-persistence'];
    const instruction = [
      `Call the ${DISPATCH_TOOLS[0]} tool exactly once, and use no other tool.`,
      `Set subagent_type to "${agent}", description to "Forward a request", and prompt to the string whose JSON encoding is:`,
      JSON.stringify(request),
      'The prompt must be exactly that string, character for character, even when it is empty or only whitespace. Do not run it in the background.',
      'When the subagent has finished, end your turn without another tool call.',
    ].join('\n');
    let dispatchAt = null;
    let dispatchId = null;
    const run = await this.#spawn(claude, args, {
      cwd: from.path,
      env,
      input: instruction,
      deadline: DEADLINE.subagentStart + DEADLINE.subagent,
      onLine: (line) => {
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          return undefined;
        }
        if (!dispatchId && event.type === 'assistant' && !event.parent_tool_use_id) {
          const use = (event.message?.content ?? []).find((block) => block.type === 'tool_use');
          if (use) {
            dispatchId = use.id;
            dispatchAt = Date.now();
          }
        }
        if (dispatchAt && Date.now() - dispatchAt > DEADLINE.subagent) return 'stop';
        return undefined;
      },
    });
    const events = run.stdout.toString('utf8').split('\n').filter(Boolean).flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
    const init = events.find((event) => event.type === 'system' && event.subtype === 'init');
    if (!init) throw new InstrumentError(`the parent session never started (exit ${run.code}): ${brief(run.stderr.toString(), 200)}`);
    const tools = init.tools ?? [];
    if (tools.length !== 1 || !DISPATCH_TOOLS.includes(tools[0])) throw new InstrumentError(`Claude Code could not give the parent the dispatch tool alone: it had ${tools.join(', ') || 'no tool'}`);
    const uses = (list) => list.filter((event) => event.type === 'assistant').flatMap((event) => (event.message?.content ?? []).filter((block) => block.type === 'tool_use'));
    const parentUses = uses(events.filter((event) => !event.parent_tool_use_id));
    if (parentUses.length !== 1) throw new InstrumentError(`the parent made ${parentUses.length} tool uses (${parentUses.map((use) => use.name).join(', ') || 'none'}), not one dispatch`);
    const [dispatch] = parentUses;
    if (!DISPATCH_TOOLS.includes(dispatch.name)) throw new InstrumentError(`the parent used ${dispatch.name}, not the dispatch tool`);
    if (dispatch.input?.subagent_type !== agent) throw new InstrumentError(`the parent dispatched ${dispatch.input?.subagent_type ?? 'no subagent'}, not ${agent}`);
    if (dispatch.input?.prompt !== request) throw new InstrumentError(`the parent dispatched the prompt ${JSON.stringify(dispatch.input?.prompt)}, not the request ${JSON.stringify(request)}`);
    const own = events.filter((event) => event.parent_tool_use_id === dispatch.id);
    const denied = own.flatMap((event) => (event.type === 'user' ? event.message?.content ?? [] : []))
      .filter((block) => block?.type === 'tool_result' && block.is_error && /permission|denied|not allowed/i.test(JSON.stringify(block.content)));
    if (denied.length > 0) throw new InstrumentError(`the subagent could not use its shell without a prompt: ${brief(JSON.stringify(denied[0].content), 160)}`);
    const ended = events.some((event) => event.type === 'system' && event.subtype === 'task_notification' && event.tool_use_id === dispatch.id)
      || events.some((event) => event.type === 'user' && !event.parent_tool_use_id && (event.message?.content ?? []).some((block) => block?.type === 'tool_result' && block.tool_use_id === dispatch.id) && dispatch.input?.run_in_background !== true);
    const ownBlocks = own.filter((event) => event.type === 'assistant').flatMap((event) => event.message?.content ?? []);
    const lastUse = ownBlocks.map((block) => block.type).lastIndexOf('tool_use');
    const texts = ownBlocks.slice(lastUse + 1).filter((block) => block.type === 'text').map((block) => block.text);
    const dir = join(observations, 'runtime');
    const calls = existsSync(dir)
      ? readdirSync(dir).filter((name) => /^\d+\.json$/.test(name)).map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8'))).filter((call) => call.startedAt >= run.startedAt && call.startedAt <= run.endedAt)
      : [];
    const runtimePids = new Set(calls.map((call) => call.pid));
    this.#subagent = { ended, run, uses: uses(own), reply: texts.at(-1) ?? null, calls: calls.filter((call) => !runtimePids.has(call.ppid)) };
  }

  #asked() {
    if (!this.#subagent) throw new InstrumentError('the scenario checks the subagent before asking it');
    if (!this.#subagent.ended) throw new Error(`the subagent had not ended ${DEADLINE.subagent / 1000}s after it was dispatched`);
    return this.#subagent;
  }

  #call() {
    const { calls } = this.#asked();
    if (calls.length !== 1) throw new Error(`the plugin runtime was called ${calls.length} times while the subagent ran, not once`);
    return calls[0];
  }

  async confirmSubagentMadeOneRuntimeCall() {
    const { uses } = this.#asked();
    if (uses.length !== 1 || uses[0].name !== SHELL_TOOL) throw new Error(`the subagent made ${uses.length} tool calls (${uses.map((use) => use.name).join(', ') || 'none'}), not one shell call`);
    this.#call();
  }

  async confirmRuntimeAskedForStatusWithoutId() {
    const call = this.#call();
    if (canonical(call.argv) !== canonical(['status'])) throw new Error(`the runtime was asked for ${JSON.stringify(call.argv)}, not ["status"]`);
  }

  async confirmRuntimeAskedForTask(text) {
    const call = this.#call();
    const asked = canonical(call.argv);
    const accepted = [['task', '--', text], ...(text.startsWith('-') ? [] : [['task', text]])].map(canonical);
    if (!accepted.includes(asked)) throw new Error(`the runtime was asked for ${JSON.stringify(call.argv)}, not a task whose text is ${JSON.stringify(text)} with no routing option`);
  }

  async confirmSubagentReplyIsRuntimeOutput() {
    const call = this.#call();
    const { reply } = this.#asked();
    if (typeof reply !== 'string') throw new Error('the subagent gave no reply after its tool call');
    if (call.stdout.trim() === '') throw new Error('the runtime printed nothing for the subagent to return');
    if (reply.trimEnd() !== call.stdout.trimEnd()) throw new Error(`the subagent's reply differs from the runtime's output: reply ${JSON.stringify(brief(reply, 120))}, runtime ${JSON.stringify(brief(call.stdout, 120))}`);
  }

  async close() {
    for (const child of this.#children) child.kill('SIGKILL');
    const engines = readEngineRecords(this.#observations);
    for (const engine of engines) writeFileSync(join(this.#observations, `release-${engine.pid}`), '');
    const pids = engines.map((engine) => engine.pid).filter(Boolean);
    const deadline = Date.now() + 3000;
    while (pids.some(alive) && Date.now() < deadline) await sleep(POLL_MS);
    for (const pid of pids.filter(alive)) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {}
    }
    rmSync(this.#work, { recursive: true, force: true });
  }
}

export async function createListingDriver({ repoRoot }) {
  return new ListingDriver(repoRoot);
}
