import { randomBytes } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

const JOB_ID = /^agy-[0-9a-z]+-[0-9a-f]{6}$/;

export function isJobId(id) {
  return JOB_ID.test(id ?? '');
}

export function storeDir() {
  const base = process.env.CLAUDE_PLUGIN_DATA || join(homedir(), '.local', 'state', 'agy-plugin-cc');
  return resolve(base, 'jobs');
}

export function allRecords() {
  let names;
  try {
    names = readdirSync(storeDir());
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  return names
    .filter((name) => name.endsWith('.json') && isJobId(name.slice(0, -'.json'.length)))
    .map((name) => JSON.parse(readFileSync(join(storeDir(), name), 'utf8')));
}

export function jobsDir(cwd = process.cwd()) {
  const dir = storeDir();
  const inside = relative(resolve(cwd), dir);
  if (inside === '' || (inside !== '..' && !inside.startsWith(`..${sep}`) && !isAbsolute(inside))) {
    throw new Error(`refusing to keep job records inside the working tree: ${dir}`);
  }
  return dir;
}

function recordPath(id) {
  return join(jobsDir(), `${id}.json`);
}

export function writeRecord(job) {
  const path = recordPath(job.id);
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(job, null, 2)}\n`);
  renameSync(temp, path);
}

export function createJob({ kind, settings, cwd }) {
  mkdirSync(jobsDir(), { recursive: true });
  const job = {
    id: `agy-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`,
    kind,
    state: 'running',
    reason: null,
    settings,
    engine: { model: null, modelConfirmation: 'none', effortConfirmation: 'unconfirmed' },
    conversation: null,
    proof: null,
    response: null,
    findings: null,
    argv: null,
    pid: null,
    cwd,
    createdAt: new Date().toISOString(),
    endedAt: null,
  };
  writeRecord(job);
  return job;
}

export function readJob(id) {
  if (!isJobId(id)) return null;
  try {
    return JSON.parse(readFileSync(recordPath(id), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export function conversationToContinue(id) {
  return readJob(id)?.conversation?.id ?? null;
}

function claim(id, suffix) {
  try {
    closeSync(openSync(join(jobsDir(), `${id}.${suffix}`), 'wx'));
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
}

export function claimTerminal(id) {
  return claim(id, 'terminal');
}

export function claimRunner(id) {
  return claim(id, 'runner');
}

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);

export function isTerminal(job) {
  return TERMINAL.has(job.state);
}

export function requestCancel(id) {
  claim(id, 'cancel');
}

export function cancelRequested(id) {
  return existsSync(join(jobsDir(), `${id}.cancel`));
}

export function markSpawning(id) {
  writeFileSync(join(jobsDir(), `${id}.spawning`), '');
}

export function isSpawning(id) {
  return existsSync(join(jobsDir(), `${id}.spawning`));
}
