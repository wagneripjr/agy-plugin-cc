import { isTerminal, readJob, requestCancel } from './jobs.mjs';
import { killGroup } from './process.mjs';

const POLL_MS = 50;
const WAIT_MS = 15_000;

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

export async function cancelJob(id) {
  let record = readJob(id);
  if (!record || isTerminal(record)) return { record, settled: true };
  requestCancel(id);
  let signalled = false;
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    if (isTerminal(record)) return { record, settled: true };
    if (!signalled && record.pid) {
      killGroup(record.pid);
      signalled = true;
    }
    if (Date.now() >= deadline) return { record, settled: false };
    await sleep(POLL_MS);
    record = readJob(id);
  }
}
