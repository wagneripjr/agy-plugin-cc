import { readFileSync } from 'node:fs';

import { parseDelegation } from './lib/args.mjs';
import { startInBackground } from './lib/background.mjs';
import { cancelJob } from './lib/cancel.mjs';
import { DEFAULT_SETTINGS, failJob, prepareRun, runEngine } from './lib/engine.mjs';
import { claimRunner, conversationToContinue, createJob, isJobId, readJob } from './lib/jobs.mjs';
import { listJobs } from './lib/listing.mjs';
import { renderJob, renderListing } from './lib/render.mjs';
import { reviewPrompt } from './lib/review.mjs';
import { renderSetup, setup } from './lib/setup.mjs';

const USAGE = [
  'usage: agy-companion.mjs --version',
  '       agy-companion.mjs setup [--json]',
  '       agy-companion.mjs review [--background|--wait] [--fresh|--resume <job-id>] [--model <model>] [--effort <effort>] [--json] [--] [focus]',
  '       agy-companion.mjs task [--background|--wait] [--fresh|--resume <job-id>] [--model <model>] [--effort <effort>] [--json] [--] <task text>',
  '       agy-companion.mjs status [--all] [--json]',
  '       agy-companion.mjs status|result|cancel <job-id> [--json]',
  '',
].join('\n');

function usage() {
  process.stderr.write(USAGE);
  process.exitCode = 2;
}

async function delegate(kind, argv) {
  const parsed = parseDelegation(argv);
  if (!parsed || (kind === 'task' && parsed.text.trim() === '')) return usage();
  if ((parsed.options.fresh && parsed.options.resume !== undefined) || (parsed.options.background && parsed.options.wait)) return usage();
  const settings = { model: parsed.options.model ?? DEFAULT_SETTINGS.model, effort: parsed.options.effort ?? DEFAULT_SETTINGS.effort };
  const prompt = kind === 'review' ? await reviewPrompt(process.cwd(), parsed.text.trim()) : parsed.text;
  const job = createJob({ kind, settings, cwd: process.cwd() });
  const resumed = parsed.options.resume;
  const conversationId = resumed === undefined ? null : conversationToContinue(resumed);
  const finished = resumed !== undefined && !conversationId
    ? failJob(job, 'no-conversation-to-continue', `job ${resumed} has no recorded conversation to continue`)
    : await start(job, prompt, conversationId, parsed.options.background === true);
  process.stdout.write(renderJob(finished, { json: parsed.options.json === true }));
}

async function start(job, prompt, conversationId, background) {
  const enginePrompt = prepareRun(job, prompt, conversationId);
  if (!background) return runEngine(job, enginePrompt);
  const { record, settled } = await startInBackground(job, enginePrompt);
  if (!settled) process.exitCode = 1;
  return record;
}

async function promptFromStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function runJob([id, ...extra]) {
  if (!isJobId(id) || extra.length > 0) return usage();
  const prompt = await promptFromStdin();
  if (!claimRunner(id)) return;
  await runEngine(readJob(id), prompt);
}

async function read(command, [id, ...flags]) {
  if (!id || !flags.every((flag) => flag === '--json')) return usage();
  const { record: job, settled } = command === 'cancel' ? await cancelJob(id) : { record: readJob(id), settled: true };
  if (!job) {
    process.stderr.write(`no Antigravity job ${id}\n`);
    process.exitCode = 1;
    return;
  }
  if (!settled) process.exitCode = 1;
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
  } else if (command === 'review' || command === 'task') {
    await delegate(command, rest);
  } else if (command === 'run-job') {
    await runJob(rest);
  } else if (command === 'status' && rest.every((arg) => arg === '--all' || arg === '--json')) {
    const all = rest.includes('--all');
    process.stdout.write(renderListing(await listJobs({ all, cwd: process.cwd() }), { json: rest.includes('--json'), all }));
  } else if (command === 'status' || command === 'result' || command === 'cancel') {
    await read(command, rest);
  } else {
    usage();
  }
} catch (error) {
  process.stderr.write(`agy-companion: ${error.message}\n`);
  process.exitCode = 1;
}
