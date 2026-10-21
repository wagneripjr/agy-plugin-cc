import { realpathSync } from 'node:fs';

import { runCommand } from './process.mjs';

export async function workspaceRoot(cwd) {
  const { code, stdout } = await runCommand('git', ['-C', cwd, 'rev-parse', '--show-toplevel']);
  return realpathSync(code === 0 ? stdout.replace(/\n$/, '') : cwd);
}
