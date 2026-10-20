import { readFileSync } from 'node:fs';

const [command] = process.argv.slice(2);

if (command === '--version') {
  const manifest = JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8'));
  process.stdout.write(`${manifest.version}\n`);
} else {
  process.stderr.write('usage: agy-companion.mjs --version\n');
  process.exitCode = 2;
}
