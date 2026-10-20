import { execFile } from 'node:child_process';
import { renameSync, writeFileSync } from 'node:fs';

const [deadlineArg, out] = process.argv.slice(2);
const deadline = Number(deadlineArg);

function record(fields) {
  writeFileSync(`${out}.partial`, JSON.stringify({ deadline, ...fields }));
  renameSync(`${out}.partial`, out);
}

function capture() {
  const observedAt = Date.now();
  execFile('ps', ['-A', '-o', 'pid=,ppid=,pgid=,stat=,command='], { encoding: 'utf8', maxBuffer: 64 << 20 }, (error, table) => {
    const capturedAt = Date.now();
    record(error ? { observedAt, capturedAt, error: error.message } : { observedAt, capturedAt, table });
  });
}

function waitForDeadline() {
  const left = deadline - Date.now();
  if (left > 0) setTimeout(waitForDeadline, left);
  else capture();
}

waitForDeadline();
