import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { InstrumentError } from '../lib/feature-runner.mjs';
import { hasOption, optionValue, readEngineRecords, readSteps, stepCount } from './fr001-engine-record.mjs';
import { validate } from './fr001-json-schema.mjs';
import { AGENTS_DIR, DEFAULTS_DOC, FINDINGS_SCHEMA, PLUGIN_DATA_ENV, PLUGIN_MANIFEST, PLUGIN_ROOT, RUNTIME_ENTRY, conversationStore } from './fr001-plugin-layout.mjs';
import { ACCOUNT_UNAVAILABLE_MESSAGE } from './fr001-stand-in-engine.mjs';

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);
const USER_INPUT_STEP = 14;
const VALUED_ENGINE_OPTIONS = new Set(['print', 'output-format', 'model', 'effort', 'mode', 'json-schema', 'conversation']);
const SETUP_QUESTIONS = ['--version', 'models', 'plugin list', 'mcp list'];
const RECORD_FIELDS = ['state', 'reason', 'settings', 'engine', 'response', 'findings', 'conversation', 'proof'];
const SYSTEM_DIRS = ['/usr/bin', '/bin', '/usr/sbin', '/sbin'];
const FIXED_DEFECT_ORACLE = "import('./math.mjs').then(m=>process.exit(m.add(2,3)===5?0:1))";
const FIXTURE = Object.freeze({
  'math.mjs': 'export function add(a, b) {\n  return a - b;\n}\n',
  'strings.mjs': 'export function upper(s) {\n  return s.toUpperCase();\n}\n',
  'README.md': '# Fixture\n\nA small module pair used to exercise delegation.\n',
});
const DEADLINE = Object.freeze({
  delegation: 240_000,
  standInDelegation: 15_000,
  background: 15_000,
  reader: 15_000,
  cancel: 15_000,
  setup: 60_000,
  subagent: 120_000,
  jobEnd: 240_000,
  engineRecord: 15_000,
  successReport: 15_000,
});
const POLL_MS = 100;
const LINGER_WINDOW_MS = 5000;

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}

function excerpt(text, size = 600) {
  const flat = String(text ?? '').trim();
  return flat.length > size ? `${flat.slice(0, size)}...` : flat;
}

function findExecutable(name, path, exclude = []) {
  for (const dir of path.split(delimiter)) {
    if (!dir || exclude.includes(dir)) continue;
    const candidate = join(dir, name);
    try {
      if (statSync(candidate).isFile() && (statSync(candidate).mode & 0o111) !== 0) return candidate;
    } catch {}
  }
  return null;
}

function processTable() {
  const out = spawnSync('ps', ['-A', '-o', 'pid=,ppid=,pgid=,stat=,command='], { encoding: 'utf8' }).stdout;
  return out.split('\n').filter(Boolean).map((line) => {
    const [pid, ppid, pgid, stat, ...command] = line.trim().split(/\s+/);
    return { pid: Number(pid), ppid: Number(ppid), pgid: Number(pgid), stat, command: command.join(' ') };
  });
}

function alive(pid) {
  if (!pid) return false;
  const out = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' }).stdout.trim();
  return out !== '' && !out.startsWith('Z');
}

function walkFiles(root, skip = () => false) {
  const out = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const rel = relative(root, path);
      if (skip(rel)) continue;
      if (entry.isDirectory()) {
        out.push(`${rel}/`);
        visit(path);
      } else if (entry.isFile()) {
        out.push(`${rel} ${createHash('sha256').update(readFileSync(path)).digest('hex')}`);
      } else {
        out.push(`${rel} (special)`);
      }
    }
  };
  if (existsSync(root)) visit(root);
  return out.sort();
}

function git(cwd, args) {
  return spawnSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8', maxBuffer: 64 << 20 });
}

function sameFile(a, b) {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return resolve(a) === resolve(b);
  }
}

function engineOptions(argv) {
  const options = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('-') || token === '-') continue;
    const name = token.replace(/^-+/, '').split('=')[0];
    options.push(name);
    if (VALUED_ENGINE_OPTIONS.has(name) && !token.includes('=')) i += 1;
  }
  return options;
}

function decodeRouting(argv) {
  const routing = {};
  let i = 0;
  while (i < argv.length) {
    const token = argv[i];
    if (token === '--') {
      i += 1;
      break;
    }
    if (['--background', '--wait', '--fresh'].includes(token)) {
      routing[token.slice(2)] = true;
      i += 1;
      continue;
    }
    if (['--resume', '--model', '--effort'].includes(token) && i + 1 < argv.length) {
      routing[token.slice(2)] = argv[i + 1];
      i += 2;
      continue;
    }
    if (token === '--json') {
      i += 1;
      continue;
    }
    break;
  }
  return { routing, text: argv.slice(i).join(' ') };
}

class FR001DelegationDriver {
  #repoRoot;
  #runtime;
  #work;
  #observations;
  #data;
  #home;
  #realAgy;
  #engine = { mode: 'installed', tamper: null };
  #windows = [];
  #setup = null;
  #subagent = null;
  #projects = [];

  constructor(repoRoot) {
    this.#repoRoot = repoRoot;
    this.#runtime = join(repoRoot, RUNTIME_ENTRY);
    this.#work = mkdtempSync(join(realpathSync(tmpdir()), 'fr001-'));
    this.#observations = join(this.#work, 'observations');
    this.#data = join(this.#work, 'plugin-data');
    this.#home = join(this.#work, 'home');
    for (const dir of [this.#observations, this.#data, this.#home]) mkdirSync(dir, { recursive: true });
    this.#realAgy = findExecutable('agy', process.env.PATH ?? '');
  }

  #safePath(extra = []) {
    const dirs = [...extra, dirname(process.execPath), ...SYSTEM_DIRS];
    const stray = findExecutable('agy', dirs.slice(extra.length).join(delimiter));
    if (stray) throw new InstrumentError(`cannot simulate a machine without Antigravity: ${stray} is on the minimal path`);
    return dirs.join(delimiter);
  }

  #launcher(module, entry, config) {
    const bin = mkdtempSync(join(this.#work, 'bin-'));
    const path = join(bin, 'agy');
    const url = pathToFileURL(join(dirname(new URL(import.meta.url).pathname), module)).href;
    writeFileSync(path, `#!${process.execPath}\nimport(${JSON.stringify(url)}).then((m) => m.${entry}(${JSON.stringify(config)}));\n`);
    chmodSync(path, 0o755);
    return bin;
  }

  async useInstalledEngine() {
    this.#engine = { mode: 'installed', tamper: null };
  }

  async useAbsentEngine() {
    this.#engine = { mode: 'absent', path: this.#safePath(), home: this.#home };
  }

  async useStandInEngine(behaviour) {
    const bin = this.#launcher('fr001-stand-in-engine.mjs', 'standIn', { behaviour, observations: this.#observations });
    this.#engine = { mode: 'stand-in', behaviour, path: this.#safePath([bin]), home: this.#home };
  }

  async useInstalledEngineThen(tamper) {
    this.#engine = { mode: 'installed', tamper };
  }

  #engineEnv() {
    const engine = this.#engine;
    if (engine.mode === 'installed' && !engine.path) {
      if (!this.#realAgy) throw new InstrumentError('Antigravity (agy) is not installed on this machine, so the installed engine cannot be observed');
      const bin = this.#launcher('fr001-engine-pass-through.mjs', 'passThrough', {
        realEngine: this.#realAgy,
        observations: this.#observations,
        store: conversationStore(process.env.HOME),
        tamper: engine.tamper,
      });
      engine.path = [bin, process.env.PATH].join(delimiter);
      engine.home = process.env.HOME;
    }
    const env = { ...process.env, PATH: engine.path, HOME: engine.home, [PLUGIN_DATA_ENV]: this.#data };
    delete env.NODE_OPTIONS;
    return env;
  }

  #requireRuntime() {
    if (!existsSync(this.#runtime)) throw new Error(`the plugin ships no runtime to delegate through: ${RUNTIME_ENTRY} does not exist`);
  }

  #openWindow(kind, owner) {
    const now = Date.now();
    const last = this.#windows.at(-1);
    if (last && last.until === undefined) last.until = now;
    const window = { kind, owner, from: now, until: undefined };
    this.#windows.push(window);
    return window;
  }

  #enginesIn(window) {
    return readEngineRecords(this.#observations).filter((record) => record.startedAt >= window.from && (window.until === undefined || record.startedAt < window.until));
  }

  #engines(job) {
    return this.#enginesIn(job.window);
  }

  async #requireEngine(job) {
    const deadline = Date.now() + DEADLINE.engineRecord;
    while (Date.now() < deadline) {
      const [engine] = this.#engines(job);
      if (engine) return engine;
      await sleep(POLL_MS);
    }
    throw new Error(`no Antigravity process was started for job ${job.id}`);
  }

  #enginePids(job) {
    return this.#engines(job).flatMap((record) => [record.pid, record.realPid]).filter(Boolean);
  }

  #engineAlive(job) {
    return this.#enginePids(job).some(alive);
  }

  #run(args, { env, cwd, deadline, input, onExit = () => {}, executable = process.execPath, prefix = [this.#runtime] }) {
    return new Promise((done) => {
      const startedAt = Date.now();
      const child = spawn(executable, [...prefix, ...args], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.stdin.on('error', () => {});
      child.stdin.end(input ?? '');
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, deadline);
      child.on('error', (error) => {
        clearTimeout(timer);
        done({ code: null, signal: null, stdout, stderr: `${stderr}${error.message}`, startedAt, endedAt: Date.now(), pid: child.pid, timedOut, observed: onExit() });
      });
      child.on('exit', (code, signal) => {
        const observed = onExit();
        const endedAt = Date.now();
        clearTimeout(timer);
        let settled = false;
        const settle = () => {
          if (settled) return;
          settled = true;
          child.stdout.destroy();
          child.stderr.destroy();
          done({ code, signal, stdout, stderr, startedAt, endedAt, pid: child.pid, timedOut, observed });
        };
        child.on('close', settle);
        setTimeout(settle, 2000).unref();
      });
    });
  }

  #report(run, what) {
    if (run.timedOut) throw new Error(`${what} did not finish on its own within ${Math.round((run.endedAt - run.startedAt) / 1000)}s`);
    try {
      return JSON.parse(run.stdout);
    } catch {
      throw new Error(`${what} printed no readable report (exit ${run.code}): ${excerpt(run.stdout || run.stderr)}`);
    }
  }

  #observeTerminal(job, reading, at, engineAlive) {
    if (job.firstTerminal || !TERMINAL.has(reading?.state)) return;
    job.firstTerminal = { at, engineAlive, state: reading.state };
    job.lingerSnapshot = sleep(at + LINGER_WINDOW_MS - Date.now()).then(() => ({ at: Date.now(), table: processTable() }));
  }

  async createProject() {
    const dir = mkdtempSync(join(this.#work, 'project-'));
    for (const [name, text] of Object.entries(FIXTURE)) writeFileSync(join(dir, name), text);
    for (const args of [['init', '-q', '-b', 'master'], ['add', '--', ...Object.keys(FIXTURE)], ['-c', 'user.name=FR-001 fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-q', '-m', 'Fixture with a planted defect']]) {
      const out = git(dir, args);
      if (out.status !== 0) throw new InstrumentError(`could not create the fixture project: git ${args[0]} said ${excerpt(out.stderr)}`);
    }
    const project = { dir, before: null };
    this.#projects.push(project);
    return project;
  }

  #tree(project) {
    const status = git(project.dir, ['status', '--porcelain', '--untracked-files=all', '--ignored']).stdout;
    const files = walkFiles(project.dir, (rel) => rel === '.git' || rel.startsWith(`.git/`)).filter((line) => !line.endsWith('/'));
    return { status, files };
  }

  async delegate(request) {
    this.#requireRuntime();
    const { project, leg } = request;
    const args = [leg];
    if (request.background) args.push('--background');
    if (request.foreground) args.push('--wait');
    if (request.fresh) args.push('--fresh');
    if (request.resume) {
      if (!request.resume.id) throw new InstrumentError('the scenario resumes a job that has no id');
      args.push('--resume', request.resume.id);
    }
    if (request.settings) args.push('--model', request.settings.model, '--effort', request.settings.effort);
    args.push('--json');
    if (request.text !== undefined) args.push('--', request.text);
    project.before = this.#tree(project);
    const env = this.#engineEnv();
    const job = { id: null, project, request, env, readers: [], firstTerminal: null, lastCancel: null };
    job.window = this.#openWindow('job', job);
    const run = await this.#run(args, {
      env,
      cwd: project.dir,
      deadline: request.background ? DEADLINE.background : this.#engine.mode === 'installed' ? DEADLINE.delegation : DEADLINE.standInDelegation,
      onExit: () => ({ engineAlive: this.#engineAlive(job), at: Date.now() }),
    });
    job.delegation = run;
    const report = this.#report(run, `the ${leg} delegation`);
    if (!report?.id) throw new Error(`the ${leg} delegation reported no job id: ${excerpt(run.stdout)}`);
    job.id = report.id;
    job.delegationReport = report;
    this.#observeTerminal(job, report, run.observed.at, run.observed.engineAlive);
    return job;
  }

  async #read(job, kind) {
    const run = await this.#run([kind, job.id, '--json'], {
      env: job.env,
      cwd: job.project.dir,
      deadline: DEADLINE.reader,
      onExit: () => ({ engineAlive: this.#engineAlive(job), at: Date.now() }),
    });
    job.readers.push({ kind, exitedByItself: !run.timedOut, code: run.code, pid: run.pid });
    const report = this.#report(run, `the ${kind} read of job ${job.id}`);
    this.#observeTerminal(job, report, run.observed.at, run.observed.engineAlive);
    return report;
  }

  async #readTerminal(job, kind, deadline = DEADLINE.jobEnd) {
    const until = Date.now() + deadline;
    let report = await this.#read(job, kind);
    while (!TERMINAL.has(report.state)) {
      if (Date.now() > until) throw new Error(`job ${job.id} still reads ${report.state} after ${Math.round(deadline / 1000)}s`);
      await sleep(POLL_MS * 2);
      report = await this.#read(job, kind);
    }
    return report;
  }

  async releaseEngine(job) {
    const engines = this.#engines(job);
    if (engines.length === 0) throw new Error(`no Antigravity process was started for job ${job.id}, so there is nothing to release`);
    for (const engine of engines) {
      if (engine.kind !== 'stand-in') throw new InstrumentError('only a stand-in engine can be told to finish its work');
      writeFileSync(join(this.#observations, `release-${engine.pid}`), '');
    }
  }

  async awaitEngineReportedSuccess(job) {
    const deadline = Date.now() + DEADLINE.successReport;
    while (Date.now() < deadline) {
      const [engine] = this.#engines(job);
      if (engine) {
        const success = engine.events.some((event) => event.event === 'result' && event.result?.status === 'SUCCESS');
        const live = [engine.pid, engine.realPid].filter(Boolean).some(alive);
        if (success && live) return;
        if (success) throw new Error(`Antigravity reported success for job ${job.id} but had already exited when the report was read`);
        if (!live) throw new Error(`Antigravity exited without reporting success for job ${job.id}`);
      }
      await sleep(POLL_MS / 2);
    }
    throw new Error(`Antigravity did not report success for job ${job.id} within ${DEADLINE.successReport / 1000}s`);
  }

  async awaitJobEnd(job) {
    await this.#readTerminal(job, 'status');
  }

  async cancel(job) {
    const run = await this.#run(['cancel', job.id, '--json'], {
      env: job.env,
      cwd: job.project.dir,
      deadline: DEADLINE.cancel,
      onExit: () => ({ engineAlive: this.#engineAlive(job), at: Date.now() }),
    });
    job.lastCancel = this.#report(run, `the cancel of job ${job.id}`);
    this.#observeTerminal(job, job.lastCancel, run.observed.at, run.observed.engineAlive);
  }

  async readStatus(job) {
    await this.#read(job, 'status').catch(() => {});
  }

  async readResult(job) {
    await this.#read(job, 'result').catch(() => {});
  }

  async readRecord(job) {
    return { status: await this.#read(job, 'status'), result: await this.#read(job, 'result') };
  }

  #documentedDefaults() {
    const path = join(this.#repoRoot, DEFAULTS_DOC);
    if (!existsSync(path)) throw new Error(`the plugin documents no default engine settings: ${DEFAULTS_DOC} does not exist`);
    const text = readFileSync(path, 'utf8');
    const model = /Default model:\s*`([^`]+)`/.exec(text)?.[1];
    const effort = /Default effort:\s*`([^`]+)`/.exec(text)?.[1];
    if (!model || !effort) throw new Error(`${DEFAULTS_DOC} does not state the default model and effort as "Default model: \`...\`" and "Default effort: \`...\`"`);
    return { model, effort };
  }

  #expected(settings) {
    return settings ?? this.#documentedDefaults();
  }

  #engineInit(engine) {
    return engine.events.find((event) => event.event === 'init');
  }

  #engineResult(engine) {
    return engine.events.filter((event) => event.event === 'result').at(-1)?.result;
  }

  async #terminalResult(job) {
    return this.#readTerminal(job, 'result');
  }

  async confirmStatusReads(job, state) {
    const report = TERMINAL.has(state) ? await this.#readTerminal(job, 'status') : await this.#read(job, 'status');
    if (report.state !== state) throw new Error(`job ${job.id}'s status reads ${report.state}, not ${state}`);
  }

  async confirmResultReads(job, state) {
    const report = TERMINAL.has(state) ? await this.#readTerminal(job, 'result') : await this.#read(job, 'result');
    if (report.state !== state) throw new Error(`job ${job.id}'s result reads ${report.state}, not ${state}`);
  }

  #confirmEnding(job, report, kind, state, reason) {
    if (report.state !== state || report.reason?.code !== reason) {
      throw new Error(`job ${job.id}'s ${kind} reads ${report.state} because ${report.reason?.code ?? 'no reason'}${report.reason?.message ? ` ("${report.reason.message}")` : ''}, not ${state} because ${reason}`);
    }
  }

  async confirmStatusEndedBecause(job, state, reason) {
    this.#confirmEnding(job, await this.#readTerminal(job, 'status'), 'status', state, reason);
  }

  async confirmResultEndedBecause(job, state, reason) {
    this.#confirmEnding(job, await this.#readTerminal(job, 'result'), 'result', state, reason);
  }

  async confirmRecordMatches(job, before) {
    const now = await this.readRecord(job);
    const changed = [];
    for (const kind of ['status', 'result']) {
      for (const field of RECORD_FIELDS) {
        if (canonical(before[kind]?.[field]) !== canonical(now[kind]?.[field])) changed.push(`${kind} ${field}: ${canonical(before[kind]?.[field])} became ${canonical(now[kind]?.[field])}`);
      }
    }
    if (changed.length > 0) throw new Error(`job ${job.id} reads differently after the cancel:\n       ${changed.join('\n       ')}`);
  }

  async confirmVerified(job) {
    const report = await this.#terminalResult(job);
    if (report.state !== 'succeeded' || report.proof?.verification !== 'verified') {
      throw new Error(`job ${job.id} reads ${report.state} with proof ${canonical(report.proof)}, not succeeded and verified`);
    }
  }

  async confirmUnverifiedBecause(job, reason) {
    const report = await this.#terminalResult(job);
    if (report.proof?.verification !== 'unverified' || report.proof?.unverifiedReason !== reason) {
      throw new Error(`job ${job.id}'s proof reads ${canonical(report.proof)}, not unverified because ${reason}`);
    }
  }

  async confirmFailureNamesBothModels(job) {
    const report = await this.#terminalResult(job);
    const engine = await this.#requireEngine(job);
    const reported = this.#engineInit(engine)?.init?.model;
    if (!reported) throw new Error(`Antigravity never reported a model for job ${job.id}`);
    const requested = this.#expected(job.request.settings ?? null).model;
    const message = report.reason?.message ?? '';
    const missing = [requested, reported].filter((model) => !message.includes(model));
    if (missing.length > 0) throw new Error(`job ${job.id}'s failure reason "${message}" does not name ${missing.join(' or ')}`);
  }

  async confirmPromptCarriesJobMarker(job) {
    const engine = await this.#requireEngine(job);
    const prompt = optionValue(engine.argv, 'print') ?? '';
    if (!prompt.includes(job.id)) throw new Error(`the prompt Antigravity received for job ${job.id} does not carry the job's id: ${excerpt(prompt, 300)}`);
  }

  #observedBefore(engine, conversationId) {
    if (engine.conversationBefore?.id === conversationId) return engine.conversationBefore.steps;
    return engine.storeBefore?.includes(`${conversationId}.db`) ? null : 0;
  }

  async confirmProofMatchesConversation(job) {
    const report = await this.#terminalResult(job);
    const engine = await this.#requireEngine(job);
    const id = report.conversation?.id;
    if (!id) throw new Error(`job ${job.id}'s result names no conversation`);
    const expectedFile = join(conversationStore(job.env.HOME), `${id}.db`);
    if (!report.conversation.file || !sameFile(report.conversation.file, expectedFile)) {
      throw new Error(`job ${job.id} names the conversation file ${report.conversation.file}, not ${expectedFile}`);
    }
    if (!existsSync(expectedFile)) throw new Error(`the conversation file ${expectedFile} that job ${job.id} names does not exist`);
    const steps = readSteps(expectedFile);
    const proof = report.proof ?? {};
    const step = steps.find((candidate) => candidate.idx === proof.markedStepIdx);
    if (!step) throw new Error(`job ${job.id} names step ${proof.markedStepIdx}, which ${expectedFile} does not hold`);
    if (step.step_type !== USER_INPUT_STEP) throw new Error(`step ${step.idx} that job ${job.id} names is of type ${step.step_type}, not a user-input step`);
    if (!Buffer.from(step.step_payload ?? []).includes(job.id)) throw new Error(`step ${step.idx} that job ${job.id} names does not carry the job's id`);
    const before = this.#observedBefore(engine, id);
    if (proof.stepsBefore !== before) throw new Error(`job ${job.id} reports ${proof.stepsBefore} steps before its turn, but the conversation held ${before ?? 'an unobserved number of'} steps`);
    if (proof.stepsAfter !== steps.length) throw new Error(`job ${job.id} reports ${proof.stepsAfter} steps after its turn, but the conversation holds ${steps.length}`);
  }

  async confirmConversationStartedEmpty(job) {
    const report = await this.#terminalResult(job);
    const engine = await this.#requireEngine(job);
    const id = report.conversation?.id;
    if (!id) throw new Error(`job ${job.id}'s result names no conversation`);
    if (engine.storeBefore?.includes(`${id}.db`)) throw new Error(`the conversation ${id} that job ${job.id} names existed before the run`);
    if (report.proof?.stepsBefore !== 0) throw new Error(`job ${job.id} reports ${report.proof?.stepsBefore} steps before its turn in a new conversation, not 0`);
  }

  async confirmConversationGrewInStore(job) {
    const report = await this.#terminalResult(job);
    const engine = await this.#requireEngine(job);
    const file = report.conversation?.file;
    const store = conversationStore(job.env.HOME);
    if (!file || !sameFile(dirname(file), store)) throw new Error(`job ${job.id} names the conversation file ${file}, which is not in Antigravity's conversation store ${store}`);
    const before = this.#observedBefore(engine, report.conversation.id);
    const after = stepCount(file);
    if (before === null || !(after > before)) throw new Error(`the conversation file ${file} held ${before ?? 'an unobserved number of'} steps before the run and ${after} after it`);
  }

  async confirmFindingsAreEngineOutput(job) {
    const report = await this.#terminalResult(job);
    const engine = await this.#requireEngine(job);
    const output = this.#engineResult(engine)?.structured_output;
    if (output === undefined) throw new Error(`Antigravity returned no structured output for job ${job.id}`);
    if (canonical(report.findings) !== canonical(output)) throw new Error(`job ${job.id}'s findings ${excerpt(canonical(report.findings), 300)} are not Antigravity's structured output ${excerpt(canonical(output), 300)}`);
    if (report.response !== null && report.response !== undefined) throw new Error(`job ${job.id}'s result shows the engine's prose: ${excerpt(report.response, 200)}`);
  }

  #shippedSchema() {
    const path = join(this.#repoRoot, FINDINGS_SCHEMA);
    if (!existsSync(path)) throw new Error(`the plugin ships no findings schema: ${FINDINGS_SCHEMA} does not exist`);
    return JSON.parse(readFileSync(path, 'utf8'));
  }

  #findings(report, job) {
    const findings = report.findings?.findings;
    if (!Array.isArray(findings)) throw new Error(`job ${job.id}'s result carries no list of findings: ${excerpt(canonical(report.findings), 300)}`);
    return findings;
  }

  async confirmFindingsSatisfySchema(job) {
    const report = await this.#terminalResult(job);
    const errors = validate(this.#shippedSchema(), report.findings);
    if (errors.length > 0) throw new Error(`job ${job.id}'s findings break the shipped schema:\n       ${errors.join('\n       ')}`);
  }

  async confirmFirstFindingAt(job, location) {
    const report = await this.#terminalResult(job);
    const [first] = this.#findings(report, job);
    if (!first) throw new Error(`job ${job.id} returned no findings`);
    const file = isAbsolute(String(first.file)) ? first.file : join(job.project.dir, String(first.file));
    if (!sameFile(file, join(job.project.dir, location.file)) || first.line !== location.line) {
      throw new Error(`job ${job.id}'s first finding points at ${first.file}:${first.line}, not ${location.file}:${location.line}`);
    }
  }

  async confirmEveryFindingComplete(job) {
    const report = await this.#terminalResult(job);
    const incomplete = this.#findings(report, job).flatMap((finding, i) => {
      const lacks = ['file', 'claim', 'evidence', 'verdict'].filter((field) => typeof finding?.[field] !== 'string' || finding[field].trim() === '');
      if (!Number.isInteger(finding?.line)) lacks.push('line');
      return lacks.length ? [`finding ${i + 1} lacks ${lacks.join(', ')}`] : [];
    });
    if (incomplete.length > 0) throw new Error(`job ${job.id} returned incomplete findings: ${incomplete.join('; ')}`);
  }

  async confirmProjectUnchanged(project) {
    if (!project.before) throw new InstrumentError('the scenario checks the project before delegating anything');
    const now = this.#tree(project);
    if (now.status !== project.before.status) throw new Error(`the project's git status changed:\n${excerpt(project.before.status)}\n       became\n${excerpt(now.status)}`);
    if (canonical(now.files) !== canonical(project.before.files)) {
      const added = now.files.filter((line) => !project.before.files.includes(line));
      const removed = project.before.files.filter((line) => !now.files.includes(line));
      throw new Error(`the project's files changed: now ${added.join(', ') || 'nothing new'}; no longer ${removed.join(', ') || 'nothing'}`);
    }
  }

  async confirmDefectFixed(project) {
    const out = spawnSync(process.execPath, ['--input-type=module', '-e', FIXED_DEFECT_ORACLE], { cwd: project.dir, encoding: 'utf8' });
    if (out.status !== 0) throw new Error(`the planted defect is not fixed: add(2, 3) does not return 5 (exit ${out.status}) ${excerpt(out.stderr, 200)}`);
  }

  async confirmTextNowhereInProject(project, text) {
    const holders = walkFiles(project.dir, (rel) => rel === '.git' || rel.startsWith('.git/'))
      .filter((line) => !line.endsWith('/'))
      .map((line) => line.slice(0, line.lastIndexOf(' ')))
      .filter((rel) => readFileSync(join(project.dir, rel)).includes(text));
    const history = git(project.dir, ['log', '--all', '-p', '--format=%H%n%B']).stdout;
    if (history.includes(text)) holders.push('the git history');
    if (holders.length > 0) throw new Error(`"${text}" appears in ${holders.join(', ')}`);
  }

  async confirmCarriesEngineResponse(job) {
    const report = await this.#terminalResult(job);
    const engine = await this.#requireEngine(job);
    const response = this.#engineResult(engine)?.response;
    if (typeof response !== 'string') throw new Error(`Antigravity gave no final response for job ${job.id}`);
    if (report.response !== response) throw new Error(`job ${job.id}'s response ${excerpt(JSON.stringify(report.response), 300)} is not Antigravity's final response ${excerpt(JSON.stringify(response), 300)}`);
  }

  async confirmNamesConversation(job) {
    const report = await this.#terminalResult(job);
    const engine = await this.#requireEngine(job);
    const observed = this.#engineResult(engine)?.conversation_id ?? this.#engineInit(engine)?.conversation_id;
    if (!report.conversation?.id) throw new Error(`job ${job.id}'s result names no conversation`);
    if (observed && report.conversation.id !== observed) throw new Error(`job ${job.id} names the conversation ${report.conversation.id}, but Antigravity ran in ${observed}`);
  }

  async confirmBodyAbsent(job) {
    const report = await this.#read(job, 'result');
    const body = ['response', 'findings'].filter((field) => report[field] !== null && report[field] !== undefined);
    if (body.length > 0) throw new Error(`job ${job.id}'s result reads ${report.state} and still shows a ${body.join(' and ')} body`);
  }

  async #answer(job) {
    const report = await this.#terminalResult(job);
    if (report.state !== 'succeeded') throw new Error(`job ${job.id} reads ${report.state}${report.reason ? ` because ${report.reason.code}` : ''}, so it gave no answer`);
    return report.response ?? '';
  }

  async confirmAnswerContains(job, text) {
    const answer = await this.#answer(job);
    if (!answer.includes(text)) throw new Error(`job ${job.id}'s answer does not contain "${text}": ${excerpt(answer, 300)}`);
  }

  async confirmAnswerLacks(job, text) {
    const answer = await this.#answer(job);
    if (answer.includes(text)) throw new Error(`job ${job.id}'s answer contains "${text}": ${excerpt(answer, 300)}`);
  }

  async #conversationOf(job) {
    const report = await this.#terminalResult(job);
    if (!report.conversation?.id) throw new Error(`job ${job.id}'s result names no conversation`);
    return report.conversation.id;
  }

  async confirmSameConversation(job, earlier) {
    const [mine, theirs] = [await this.#conversationOf(job), await this.#conversationOf(earlier)];
    if (mine !== theirs) throw new Error(`job ${job.id} ran in conversation ${mine}, not the earlier job's ${theirs}`);
  }

  async confirmDifferentConversation(job, earlier) {
    const [mine, theirs] = [await this.#conversationOf(job), await this.#conversationOf(earlier)];
    if (mine === theirs) throw new Error(`job ${job.id} ran in the earlier job's conversation ${theirs}`);
  }

  async confirmEngineAskedToContinue(job, earlier) {
    const engine = await this.#requireEngine(job);
    const theirs = await this.#conversationOf(earlier);
    const asked = optionValue(engine.argv, 'conversation');
    if (asked !== theirs) throw new Error(`Antigravity was asked to continue ${asked ?? 'no conversation'}, not the earlier job's ${theirs}`);
  }

  async confirmEngineAskedToContinueNothing(job) {
    const engine = await this.#requireEngine(job);
    if (hasOption(engine.argv, 'conversation')) throw new Error(`Antigravity was asked to continue conversation ${optionValue(engine.argv, 'conversation')}`);
  }

  async confirmResultCarriesSettings(job, settings) {
    const expected = this.#expected(settings);
    const report = await this.#read(job, 'result');
    if (report.settings?.model !== expected.model || report.settings?.effort !== expected.effort) {
      throw new Error(`job ${job.id}'s result carries the settings ${canonical(report.settings)}, not model ${expected.model} and effort ${expected.effort}`);
    }
  }

  async confirmNoConfirmationArrived(job) {
    const report = await this.#terminalResult(job);
    if (report.engine?.modelConfirmation !== 'none' || (report.engine?.model ?? null) !== null) {
      throw new Error(`job ${job.id}'s result does not say that no model confirmation arrived: ${canonical(report.engine)}`);
    }
  }

  async confirmNamesEngineModel(job) {
    const report = await this.#terminalResult(job);
    const engine = await this.#requireEngine(job);
    const reported = this.#engineInit(engine)?.init?.model;
    if (!reported) throw new Error(`Antigravity never reported a model for job ${job.id}`);
    if (report.engine?.model !== reported) throw new Error(`job ${job.id}'s result names the engine model ${report.engine?.model ?? 'nothing'}, but Antigravity reported ${reported}`);
  }

  async confirmEffortMarkedUnconfirmed(job) {
    const report = await this.#terminalResult(job);
    if (report.engine?.effortConfirmation !== 'unconfirmed') throw new Error(`job ${job.id}'s result does not say the engine does not confirm the effort: ${canonical(report.engine)}`);
  }

  async confirmEngineAskedFor(job, settings) {
    const expected = this.#expected(settings);
    const engine = await this.#requireEngine(job);
    const asked = { model: optionValue(engine.argv, 'model'), effort: optionValue(engine.argv, 'effort') };
    if (asked.model !== expected.model || asked.effort !== expected.effort) {
      throw new Error(`Antigravity was asked for model ${asked.model ?? 'none'} and effort ${asked.effort ?? 'none'}, not ${expected.model} and ${expected.effort}`);
    }
  }

  async confirmEngineAskedForDocumentedDefaults(job) {
    await this.confirmEngineAskedFor(job, null);
  }

  async confirmEngineStreamsEvents(job) {
    const engine = await this.#requireEngine(job);
    const format = optionValue(engine.argv, 'output-format');
    if (format !== 'stream-json') throw new Error(`Antigravity was asked for output format ${format ?? 'none'}, not stream-json`);
  }

  async confirmOnlyDelegationOptions(job, allowed) {
    const engine = await this.#requireEngine(job);
    const extra = engineOptions(engine.argv).filter((name) => !allowed.includes(name));
    if (extra.length > 0) throw new Error(`Antigravity was given options beyond the delegation's own: ${[...new Set(extra)].join(', ')}`);
  }

  async confirmReadOnlyWithSchema(job) {
    const engine = await this.#requireEngine(job);
    const mode = optionValue(engine.argv, 'mode');
    if (mode !== 'plan') throw new Error(`Antigravity ran a review in mode ${mode ?? 'default'}, not plan`);
    const given = optionValue(engine.argv, 'json-schema');
    if (!given) throw new Error('Antigravity ran a review without a findings schema');
    let schema;
    try {
      schema = JSON.parse(given);
    } catch {
      const path = isAbsolute(given) ? given : join(engine.cwd, given);
      if (!existsSync(path)) throw new Error(`Antigravity was given the schema ${given}, which does not exist`);
      schema = JSON.parse(readFileSync(path, 'utf8'));
    }
    if (canonical(schema) !== canonical(this.#shippedSchema())) throw new Error(`Antigravity was given a schema other than the shipped findings schema: ${given}`);
  }

  async confirmDefaultModeUnsandboxed(job) {
    const engine = await this.#requireEngine(job);
    if (optionValue(engine.argv, 'mode') === 'plan') throw new Error('Antigravity ran a task in plan mode');
    if (hasOption(engine.argv, 'sandbox')) throw new Error('Antigravity ran a task in its sandbox');
  }

  async confirmReturnedWhileEngineWorking(job) {
    if (!job.delegation?.observed?.engineAlive) throw new Error(`the delegation of job ${job.id} returned when no Antigravity process for it was running`);
  }

  async confirmEngineStopped(job) {
    if (this.#engines(job).length === 0) throw new Error(`no Antigravity process was started for job ${job.id}`);
    const live = this.#enginePids(job).filter(alive);
    if (live.length > 0) throw new Error(`Antigravity is still running for job ${job.id} (pid ${live.join(', ')})`);
  }

  async confirmEngineRunning(job) {
    if (this.#engines(job).length === 0) throw new Error(`no Antigravity process was started for job ${job.id}`);
    if (!this.#engineAlive(job)) throw new Error(`Antigravity is no longer running for job ${job.id}`);
  }

  async confirmReadersExited(job) {
    if (job.readers.length === 0) throw new InstrumentError('the scenario checks the readers before reading the job');
    const stuck = job.readers.filter((reader) => !reader.exitedByItself);
    if (stuck.length > 0) throw new Error(`${stuck.map((reader) => reader.kind).join(' and ')} of job ${job.id} did not finish on its own`);
  }

  async confirmCancelReported(job, state) {
    if (!job.lastCancel) throw new InstrumentError('the scenario checks a cancel report before cancelling');
    if (job.lastCancel.state !== state) throw new Error(`the cancel reported job ${job.id} as ${job.lastCancel.state}, not ${state}`);
  }

  async confirmNoEngineStarted(job) {
    const engines = this.#engines(job);
    if (engines.length > 0) throw new Error(`Antigravity was started ${engines.length} time(s) for job ${job.id}`);
  }

  async confirmAtMostOneEngine(job) {
    const engines = this.#engines(job);
    if (engines.length > 1) throw new Error(`Antigravity was started ${engines.length} times for job ${job.id}`);
  }

  async confirmEngineGoneAtFinish(job) {
    if (!job.firstTerminal) await this.#readTerminal(job, 'status');
    if (job.firstTerminal.engineAlive) throw new Error(`job ${job.id} first read ${job.firstTerminal.state} while its Antigravity process was still running`);
  }

  async confirmNothingLeftRunning(job, afterSeconds) {
    if (afterSeconds * 1000 !== LINGER_WINDOW_MS) throw new InstrumentError(`the driver observes the process table ${LINGER_WINDOW_MS / 1000}s after a job first reads finished, not ${afterSeconds}s`);
    if (!job.firstTerminal) await this.#readTerminal(job, 'status');
    const { table } = await job.lingerSnapshot;
    const engines = this.#engines(job);
    const known = new Set([job.delegation?.pid, ...engines.flatMap((engine) => [engine.pid, engine.realPid, engine.ppid])].filter((pid) => pid && pid !== process.pid && pid !== 1));
    const leaders = new Set(engines.flatMap((engine) => [engine.pid, engine.realPid, engine.ppid]).filter((pid) => pid && pid !== process.pid && pid !== 1));
    const byPid = new Map(table.map((row) => [row.pid, row]));
    const descends = (row) => {
      for (let hop = byPid.get(row.ppid), guard = 0; hop && guard < 64; hop = byPid.get(hop.ppid), guard += 1) if (known.has(hop.pid)) return true;
      return false;
    };
    const lingering = table.filter((row) => !row.stat.startsWith('Z') && row.pid !== process.pid && (known.has(row.pid) || leaders.has(row.pgid) || descends(row)));
    if (lingering.length > 0) {
      throw new Error(`${afterSeconds}s after job ${job.id} first read finished, processes the plugin started for it are still running:\n       ${lingering.map((row) => `${row.pid} ${excerpt(row.command, 120)}`).join('\n       ')}`);
    }
  }

  async runSetup() {
    this.#requireRuntime();
    const cwd = mkdtempSync(join(this.#work, 'setup-cwd-'));
    const env = this.#engineEnv();
    const watched = [this.#data, env.HOME === process.env.HOME ? null : env.HOME, cwd].filter(Boolean);
    const before = watched.map((dir) => walkFiles(dir));
    const window = this.#openWindow('setup', null);
    const run = await this.#run(['setup', '--json'], { env, cwd, deadline: DEADLINE.setup });
    window.until = Date.now();
    this.#setup = { run, window, watched, before, after: watched.map((dir) => walkFiles(dir)) };
  }

  #setupReport() {
    if (!this.#setup) throw new InstrumentError('the scenario checks setup before running it');
    return this.#report(this.#setup.run, 'setup');
  }

  async confirmSetupReportsEngineMissing() {
    const report = this.#setupReport();
    if (report.engine?.installed !== false) throw new Error(`setup does not report Antigravity as missing: ${excerpt(canonical(report.engine))}`);
  }

  async confirmSetupEndedUnsuccessfully() {
    if (!this.#setup) throw new InstrumentError('the scenario checks setup before running it');
    if (this.#setup.run.code === 0) throw new Error('setup ended successfully on a machine without Antigravity');
  }

  async confirmSetupWroteNothing() {
    if (!this.#setup) throw new InstrumentError('the scenario checks setup before running it');
    const changed = this.#setup.watched.filter((dir, i) => canonical(this.#setup.before[i]) !== canonical(this.#setup.after[i]));
    if (changed.length > 0) throw new Error(`setup wrote into ${changed.join(', ')}`);
  }

  #setupEngines() {
    return this.#enginesIn(this.#setup.window);
  }

  #setupAnswer(question) {
    return this.#setupEngines().find((engine) => engine.argv.join(' ') === question);
  }

  async confirmSetupReportsEngine() {
    const report = this.#setupReport();
    const problems = [];
    const version = this.#setupAnswer('--version');
    const models = this.#setupAnswer('models');
    const plugins = this.#setupAnswer('plugin list');
    const mcp = this.#setupAnswer('mcp list');
    if (!version || !models || !plugins || !mcp) throw new Error(`setup did not ask Antigravity for each of ${SETUP_QUESTIONS.join(', ')}`);
    const text = (engine) => engine.lines.join('\n').trim();
    if (report.engine?.version !== text(version)) problems.push(`version ${report.engine?.version} is not Antigravity's ${text(version)}`);
    if (report.account?.state !== 'usable') problems.push(`account reads ${report.account?.state}, not usable`);
    const listed = models.lines.filter((line) => line.includes('\t')).map((line) => line.split('\t')[0]);
    const missing = listed.filter((model) => !(report.models ?? []).includes(model));
    if (listed.length === 0 || missing.length > 0) problems.push(`models ${canonical(report.models)} do not list ${missing.join(', ') || 'what Antigravity listed'}`);
    if ((report.plugins ?? '').trim() !== text(plugins)) problems.push(`plugins read ${excerpt(report.plugins, 200)}, not Antigravity's ${excerpt(text(plugins), 200)}`);
    if ((report.mcpServers ?? '').trim() !== text(mcp)) problems.push(`MCP servers read ${excerpt(report.mcpServers, 200)}, not Antigravity's ${excerpt(text(mcp), 200)}`);
    if (problems.length > 0) throw new Error(`setup misreports Antigravity:\n       ${problems.join('\n       ')}`);
  }

  async confirmSetupAskedOnlyAboutItself() {
    if (!this.#setup) throw new InstrumentError('the scenario checks setup before running it');
    const asked = this.#setupEngines().map((engine) => engine.argv.join(' '));
    const other = asked.filter((question) => !SETUP_QUESTIONS.includes(question));
    if (asked.length === 0) throw new Error('setup asked Antigravity nothing');
    if (other.length > 0) throw new Error(`setup also ran agy ${other.join('; agy ')}`);
  }

  async confirmSetupReportsAccountUnavailable() {
    const report = this.#setupReport();
    if (report.account?.state !== 'unavailable' || !String(report.account?.message ?? '').includes(ACCOUNT_UNAVAILABLE_MESSAGE)) {
      throw new Error(`setup reports the account as ${canonical(report.account)}, not unavailable with Antigravity's message "${ACCOUNT_UNAVAILABLE_MESSAGE}"`);
    }
  }

  #subagentName() {
    const dir = join(this.#repoRoot, AGENTS_DIR);
    const files = existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith('.md')) : [];
    if (files.length === 0) throw new Error(`the plugin ships no subagent to ask: ${AGENTS_DIR} holds no agent definition`);
    const header = /^---\n([\s\S]*?)\n---/.exec(readFileSync(join(dir, files[0]), 'utf8'))?.[1] ?? '';
    const agent = /^name:\s*(.+)$/m.exec(header)?.[1]?.trim() ?? files[0].replace(/\.md$/, '');
    const plugin = JSON.parse(readFileSync(join(this.#repoRoot, PLUGIN_MANIFEST), 'utf8')).name;
    return `${plugin}:${agent}`;
  }

  async askSubagent(project, request) {
    this.#requireRuntime();
    const agent = this.#subagentName();
    const claude = findExecutable('claude', process.env.PATH ?? '');
    if (!claude) throw new InstrumentError('Claude Code (claude) is not installed, so the subagent cannot be asked');
    const engineEnv = this.#engineEnv();
    const runtimeObservations = join(this.#observations, 'runtime');
    const env = {
      ...process.env,
      PATH: [engineEnv.PATH.split(delimiter)[0], process.env.PATH].join(delimiter),
      [PLUGIN_DATA_ENV]: this.#data,
      NODE_OPTIONS: `--import=${pathToFileURL(join(dirname(new URL(import.meta.url).pathname), 'fr001-runtime-recorder.mjs')).href}`,
      FR001_RUNTIME_ENTRY: this.#runtime,
      FR001_RUNTIME_OBSERVATIONS: this.#observations,
    };
    const window = this.#openWindow('subagent', null);
    const run = await this.#run(
      ['-p', '--plugin-dir', join(this.#repoRoot, PLUGIN_ROOT), '--agent', agent, '--output-format', 'stream-json', '--verbose', '--allowedTools', 'Bash', '--setting-sources', 'project', '--strict-mcp-config'],
      { env, cwd: project.dir, deadline: DEADLINE.subagent, input: request, executable: claude, prefix: [] },
    );
    window.until = Date.now();
    const events = run.stdout.split('\n').filter(Boolean).flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
    const toolUses = events.filter((event) => event.type === 'assistant').flatMap((event) => (event.message?.content ?? []).filter((block) => block.type === 'tool_use'));
    const reply = events.find((event) => event.type === 'result');
    const calls = existsSync(runtimeObservations)
      ? readdirSync(runtimeObservations).filter((name) => name.endsWith('.json')).map((name) => JSON.parse(readFileSync(join(runtimeObservations, name), 'utf8')))
        .filter((call) => call.startedAt >= window.from && call.startedAt <= window.until)
      : [];
    const pids = new Set(calls.map((call) => call.pid));
    this.#subagent = { run, toolUses, reply, calls: calls.filter((call) => !pids.has(call.ppid)) };
  }

  #subagentCall() {
    if (!this.#subagent) throw new InstrumentError('the scenario checks the subagent before asking it');
    const { calls, run } = this.#subagent;
    if (calls.length !== 1) throw new Error(`the subagent called the plugin runtime ${calls.length} times, not once${run.timedOut ? ' (it did not finish)' : ''}: ${excerpt(run.stderr, 300)}`);
    return calls[0];
  }

  async confirmSubagentMadeOneRuntimeCall() {
    if (!this.#subagent) throw new InstrumentError('the scenario checks the subagent before asking it');
    const { toolUses } = this.#subagent;
    if (toolUses.length !== 1 || toolUses[0].name !== 'Bash') throw new Error(`the subagent made ${toolUses.length} tool calls (${toolUses.map((use) => use.name).join(', ') || 'none'}), not one shell call`);
    this.#subagentCall();
  }

  async confirmRuntimeReceivedRouting(routing) {
    const call = this.#subagentCall();
    const [subcommand, ...rest] = call.argv;
    if (subcommand !== 'task') throw new Error(`the subagent called the runtime's ${subcommand} command, not task`);
    const decoded = decodeRouting(rest).routing;
    if (canonical(decoded) !== canonical(routing)) throw new Error(`the runtime received the routing ${canonical(decoded)}, not ${canonical(routing)} (argv ${JSON.stringify(call.argv)})`);
  }

  async confirmRuntimeReceivedTaskText(text) {
    const call = this.#subagentCall();
    const received = decodeRouting(call.argv.slice(1)).text;
    if (received !== text) throw new Error(`the runtime received the task text ${JSON.stringify(received)}, not ${JSON.stringify(text)}`);
  }

  async confirmSubagentReplyIsRuntimeOutput() {
    const call = this.#subagentCall();
    const reply = this.#subagent.reply?.result;
    if (typeof reply !== 'string') throw new Error('the subagent gave no reply');
    if (call.stdout.trim() === '') throw new Error('the runtime printed nothing for the subagent to return');
    if (reply.trimEnd() !== call.stdout.trimEnd()) throw new Error(`the subagent's reply differs from the runtime's output:\n       reply:   ${JSON.stringify(excerpt(reply, 300))}\n       runtime: ${JSON.stringify(excerpt(call.stdout, 300))}`);
  }

  async close() {
    const engines = readEngineRecords(this.#observations);
    for (const engine of engines) if (engine.kind === 'stand-in') writeFileSync(join(this.#observations, `release-${engine.pid}`), '');
    const pids = engines.flatMap((engine) => [engine.pid, engine.realPid]).filter(Boolean);
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

export async function createDelegationDriver({ repoRoot }) {
  return new FR001DelegationDriver(repoRoot);
}
