import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { claimTerminal, readJob, writeRecord } from './jobs.mjs';
import { killGroup } from './process.mjs';
import { marker, stepCount, unproven, verify } from './proof.mjs';
import { FINDINGS_SCHEMA, findingsViolations } from './schema.mjs';

const ENGINE = 'agy';
const STDERR_KEPT = 2000;

export const DEFAULT_SETTINGS = Object.freeze({ model: 'gemini-4-argon', effort: 'medium' });

export function engineArgv(prompt, { kind, settings }, conversationId = null) {
  const leg = kind === 'review' ? ['--mode', 'plan', '--json-schema', FINDINGS_SCHEMA] : [];
  const resume = conversationId ? ['--conversation', conversationId] : [];
  return ['--print', prompt, '--output-format', 'stream-json', '--model', settings.model, '--effort', settings.effort, ...leg, ...resume];
}

function conversation(id) {
  return { id, file: join(homedir(), '.gemini', 'antigravity-cli', 'conversations', `${id}.db`) };
}

function ending(code, message) {
  return { code, message };
}

function exitDescription({ code, signal }) {
  return signal ? `was ended by ${signal}` : `exited with code ${code}`;
}

function withStderr(message, stderr) {
  const said = stderr.trim();
  return said ? `${message}: ${said}` : message;
}

function observe(job, run, line) {
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    return;
  }
  const id = event.conversation_id ?? event.result?.conversation_id;
  if (id && !job.conversation) job.conversation = conversation(id);
  if (event.event === 'init') {
    const model = event.init?.model ?? null;
    const matched = model === job.settings.model;
    job.engine = { ...job.engine, model, modelConfirmation: matched ? 'confirmed' : 'mismatched' };
    if (!matched) {
      run.reason ??= ending('model-mismatch', `agy ran model ${model ?? 'none'}, not the requested model ${job.settings.model}`);
      killGroup(job.pid);
    }
  }
  if (event.event === 'result') {
    run.result = event.result ?? {};
    if (run.result.status !== 'SUCCESS') {
      run.reason ??= ending('result-not-success', `agy reported a result with status ${run.result.status ?? 'none'}, not SUCCESS`);
    } else if (job.kind === 'review') {
      const broken = findingsViolations(run.result.structured_output);
      if (broken.length > 0) run.reason ??= ending('schema-violated', `agy's findings broke the shipped schema: ${broken.join('; ')}`);
    }
  }
  writeRecord(job);
}

export function finalize(job, run, exit) {
  let reason = run.reason;
  if (!reason && !run.result) reason = ending('exited-without-result', withStderr(`agy ${exitDescription(exit)} without reporting a result`, run.stderr));
  if (!reason && exit.code !== 0) reason = ending('nonzero-exit-after-success', withStderr(`agy ${exitDescription(exit)} after reporting success`, run.stderr));
  job.state = reason ? 'failed' : 'succeeded';
  job.reason = reason ?? null;
  job.response = reason || job.kind !== 'task' ? null : run.result.response ?? null;
  job.findings = reason || job.kind !== 'review' ? null : run.result.structured_output;
  if (!reason) job.proof = verify(job);
  job.endedAt = new Date().toISOString();
  if (!claimTerminal(job.id)) return readJob(job.id);
  writeRecord(job);
  return job;
}

export function failBeforeSpawn(job, code, message) {
  return finalize(job, { result: null, reason: ending(code, message), stderr: '' }, { code: null, signal: null });
}

export function runEngine(job, prompt, conversationId = null) {
  return new Promise((done) => {
    const run = { result: null, reason: null, stderr: '' };
    job.argv = engineArgv(`${prompt}\n\n${marker(job.id)}`, job, conversationId);
    job.proof = unproven(conversationId ? stepCount(conversation(conversationId).file) : 0);
    writeRecord(job);
    const child = spawn(ENGINE, job.argv, { cwd: job.cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let ended = false;
    const end = (exit) => {
      if (ended) return;
      ended = true;
      done(finalize(job, run, exit));
    };
    if (child.pid) {
      job.pid = child.pid;
      writeRecord(job);
    }
    let pending = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines) observe(job, run, line);
    });
    child.stdout.on('end', () => {
      if (pending) observe(job, run, pending);
      pending = '';
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      run.stderr = (run.stderr + chunk).slice(-STDERR_KEPT);
    });
    child.on('error', (error) => {
      if (child.pid) return;
      run.reason ??= ending('engine-could-not-start', `agy could not be started (${error.code ?? error.message})`);
      end({ code: null, signal: null });
    });
    child.on('close', (code, signal) => {
      if (child.pid) end({ code, signal });
    });
  });
}
