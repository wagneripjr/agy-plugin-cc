import { readFileSync } from 'node:fs';

import { parseDelegation } from './lib/args.mjs';
import { DEFAULT_SETTINGS, runEngine } from './lib/engine.mjs';
import { createJob, readJob } from './lib/jobs.mjs';
import { renderJob } from './lib/render.mjs';
import { renderSetup, setup } from './lib/setup.mjs';

const USAGE = [
  'usage: agy-companion.mjs --version',
  '       agy-companion.mjs setup [--json]',
  '       agy-companion.mjs task [--wait] [--model <model>] [--effort <effort>] [--json] [--] <task text>',
  '       agy-companion.mjs status|result <job-id> [--json]',
  '',
].join('\n');

function usage() {
  process.stderr.write(USAGE);
  process.exitCode = 2;
}

async function task(argv) {
  const parsed = parseDelegation(argv);
  if (!parsed || parsed.text.trim() === '') return usage();
  const settings = { model: parsed.options.model ?? DEFAULT_SETTINGS.model, effort: parsed.options.effort ?? DEFAULT_SETTINGS.effort };
  const job = createJob({ kind: 'task', settings, cwd: process.cwd() });
  const finished = await runEngine(job, parsed.text);
  process.stdout.write(renderJob(finished, { json: parsed.options.json === true }));
}

function read(command, [id, ...flags]) {
  if (!id || !flags.every((flag) => flag === '--json')) return usage();
  const job = readJob(id);
  if (!job) {
    process.stderr.write(`no Antigravity job ${id}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(renderJob(job, { json: flags.length > 0, body: command === 'result' }));
}

const [command, ...rest] = process.argv.slice(2);

try {
  if (command === '--version') {
    const manifest = JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8'));
    process.stdout.write(`${manifest.version}\n`);
  } else if (command === 'setup' && rest.every((arg) => arg === '--json')) {
    const report = await setup();
    process.stdout.write(rest.length > 0 ? `${JSON.stringify(report, null, 2)}\n` : renderSetup(report));
    if (!report.engine.installed) process.exitCode = 1;
  } else if (command === 'task') {
    await task(rest);
  } else if (command === 'status' || command === 'result') {
    read(command, rest);
  } else {
    usage();
  }
} catch (error) {
  process.stderr.write(`agy-companion: ${error.message}\n`);
  process.exitCode = 1;
}
