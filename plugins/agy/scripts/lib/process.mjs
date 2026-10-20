import { spawn } from 'node:child_process';

export function runCommand(executable, argv) {
  return new Promise((resolve) => {
    const child = spawn(executable, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => resolve({ code: null, stdout, stderr, error }));
    child.on('close', (code) => resolve({ code, stdout, stderr, error: null }));
  });
}

const GRACE_MS = 3000;
const POLL_MS = 100;

function signalGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

export function killGroup(pid) {
  if (!signalGroup(pid, 'SIGTERM')) return;
  const deadline = Date.now() + GRACE_MS;
  const watch = setInterval(() => {
    const alive = signalGroup(pid, 0);
    if (alive && Date.now() < deadline) return;
    clearInterval(watch);
    if (alive) signalGroup(pid, 'SIGKILL');
  }, POLL_MS);
}
