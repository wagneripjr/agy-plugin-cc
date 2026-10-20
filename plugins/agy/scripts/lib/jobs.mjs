import { randomBytes } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

const JOB_ID = /^agy-[0-9a-z]+-[0-9a-f]{6}$/;

export function isJobId(id) {
  return JOB_ID.test(id ?? '');
}

export function jobsDir(cwd = process.cwd()) {
  const base = process.env.CLAUDE_PLUGIN_DATA || join(homedir(), '.local', 'state', 'agy-plugin-cc');
  const dir = resolve(base, 'jobs');
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

export function claimTerminal(id) {
  try {
    closeSync(openSync(join(jobsDir(), `${id}.terminal`), 'wx'));
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
}
