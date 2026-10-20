import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { failJob } from './engine.mjs';
import { claimRunner, isSpawning, readJob } from './jobs.mjs';
import { killGroup } from './process.mjs';

const COMPANION = fileURLToPath(new URL('../agy-companion.mjs', import.meta.url));
const POLL_MS = 50;
const READINESS_MS = 30_000;
const GROUP_EXIT_MS = 8_000;
const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}

async function groupExited(pid) {
  if (!alive(-pid)) return true;
  killGroup(pid);
  const deadline = Date.now() + GROUP_EXIT_MS;
  while (alive(-pid)) {
    if (Date.now() >= deadline) return false;
    await sleep(POLL_MS);
  }
  return true;
}

function settled(record) {
  return { record, settled: true };
}

function unsettled(id) {
  return { record: readJob(id), settled: false };
}

async function takeover(id, worker, workerExit, workerExited) {
  if (claimRunner(id)) {
    if (!workerExited) {
      worker.kill('SIGKILL');
      await workerExit;
    }
    return settled(failJob(readJob(id), 'engine-could-not-start', "the job's worker ended before it started agy"));
  }
  if (!workerExited) return unsettled(id);
  const record = readJob(id);
  if (TERMINAL.has(record.state)) return settled(record);
  if (record.pid) {
    if (!(await groupExited(record.pid))) return unsettled(id);
    return settled(failJob(readJob(id), 'exited-without-result', "the job's worker ended before agy's result was read"));
  }
  if (isSpawning(id)) return unsettled(id);
  return settled(failJob(record, 'engine-could-not-start', "the job's worker ended before it started agy"));
}

export async function startInBackground(job) {
  const worker = spawn(process.execPath, [COMPANION, 'run-job', job.id], { detached: true, stdio: 'ignore' });
  let workerExited = false;
  const workerExit = new Promise((done) => {
    worker.once('exit', done);
    worker.once('error', done);
  }).then(() => { workerExited = true; });
  worker.unref();
  const deadline = Date.now() + READINESS_MS;
  for (;;) {
    const exitedBeforeRead = workerExited;
    const record = readJob(job.id);
    if (TERMINAL.has(record.state)) return settled(record);
    if (record.pid && record.engine.modelConfirmation !== 'none' && alive(record.pid)) return settled(record);
    if (exitedBeforeRead || Date.now() >= deadline) return takeover(job.id, worker, workerExit, exitedBeforeRead);
    await sleep(POLL_MS);
  }
}
