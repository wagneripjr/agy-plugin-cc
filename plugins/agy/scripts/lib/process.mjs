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
