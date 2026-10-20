import { readFileSync } from 'node:fs';

import { renderSetup, setup } from './lib/setup.mjs';

const USAGE = 'usage: agy-companion.mjs --version | setup [--json]\n';

const [command, ...rest] = process.argv.slice(2);

if (command === '--version') {
  const manifest = JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8'));
  process.stdout.write(`${manifest.version}\n`);
} else if (command === 'setup' && rest.every((arg) => arg === '--json')) {
  const report = await setup();
  process.stdout.write(rest.length > 0 ? `${JSON.stringify(report, null, 2)}\n` : renderSetup(report));
  if (!report.engine.installed) process.exitCode = 1;
} else {
  process.stderr.write(USAGE);
  process.exitCode = 2;
}
