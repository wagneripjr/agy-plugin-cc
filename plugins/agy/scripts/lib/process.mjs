import { spawn } from 'node:child_process';

const ENGINE_KEPT = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG'];
const ENGINE_REQUIRED = ['PATH', 'HOME'];
const SESSION_SETTING = /^(CLAUDE|CODEX)_/;
const SESSION_VALUE_MIN = 8;

export function engineEnvironment(source = process.env) {
  const protectedValues = Object.entries(source)
    .filter(([name, value]) => SESSION_SETTING.test(name) && value.length >= SESSION_VALUE_MIN)
    .map(([, value]) => value);
  const carries = (value) => protectedValues.some((protectedValue) => value.includes(protectedValue));
  const refused = ENGINE_REQUIRED.find((name) => source[name] !== undefined && carries(source[name]));
  if (refused) return { env: null, refused };
  const env = {};
  for (const [name, value] of Object.entries(source)) {
    if ((ENGINE_KEPT.includes(name) || name.startsWith('LC_')) && !carries(value)) env[name] = value;
  }
  return { env, refused: null };
}

export function runCommand(executable, argv, env) {
  return new Promise((resolve) => {
    const child = spawn(executable, argv, { env, stdio: ['ignore', 'pipe', 'pipe'] });
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
