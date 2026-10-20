import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { EngineRecord, keepOnlyStep, optionValue, readSteps, stepCount } from './fr001-engine-record.mjs';

const FORWARDED_SIGNALS = ['SIGTERM', 'SIGINT', 'SIGHUP'];
const USER_INPUT_STEP = 14;

function conversationFiles(store, id) {
  return ['', '-wal', '-shm'].map((suffix) => join(store, `${id}.db${suffix}`));
}

function applyTamper(tamper, store, id, snapshot, stepsBefore) {
  const [db] = conversationFiles(store, id);
  if (tamper === 'remove-conversation-file') {
    for (const file of conversationFiles(store, id)) rmSync(file, { force: true });
    return { tamper, applied: true };
  }
  if (tamper === 'restore-conversation-from-before-the-turn') {
    if (!snapshot) return { tamper, applied: false, why: 'no conversation existed before the turn' };
    for (const file of conversationFiles(store, id)) rmSync(file, { force: true });
    copyFileSync(snapshot, db);
    return { tamper, applied: true };
  }
  if (tamper === 'keep-only-the-marked-step') {
    if (!existsSync(db)) return { tamper, applied: false, why: 'no conversation file after the turn' };
    const marked = readSteps(db).find((step) => step.idx >= stepsBefore && step.step_type === USER_INPUT_STEP);
    if (!marked) return { tamper, applied: false, why: 'the turn wrote no user-input step' };
    keepOnlyStep(db, marked.idx);
    return { tamper, applied: true, kept: marked.idx };
  }
  return { tamper, applied: false, why: `unknown tamper ${tamper}` };
}

export function passThrough({ realEngine, observations, store, tamper = null }) {
  const argv = process.argv.slice(2);
  const resumed = optionValue(argv, 'conversation');
  const before = {
    storeBefore: existsSync(store) ? readdirSync(store) : [],
    conversationBefore: resumed ? { id: resumed, steps: stepCount(join(store, `${resumed}.db`)) } : null,
  };
  let snapshot = null;
  if (resumed && tamper === 'restore-conversation-from-before-the-turn' && existsSync(join(store, `${resumed}.db`))) {
    snapshot = join(observations, `snapshot-${process.pid}.db`);
    copyFileSync(join(store, `${resumed}.db`), snapshot);
  }
  const record = new EngineRecord(observations, { kind: 'pass-through', realEngine, tamper, ...before });
  const engine = spawn(realEngine, argv, { stdio: ['inherit', 'pipe', 'inherit'] });
  record.update({ realPid: engine.pid });
  for (const signal of FORWARDED_SIGNALS) process.on(signal, () => engine.kill(signal));

  let pending = '';
  let conversationId = resumed ?? null;
  engine.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
    pending += chunk.toString('utf8');
    const lines = pending.split('\n');
    pending = lines.pop();
    for (const line of lines) {
      if (!line) continue;
      record.event(line);
      try {
        conversationId ??= JSON.parse(line).conversation_id ?? null;
      } catch {}
    }
  });

  engine.on('error', (error) => {
    record.update({ realError: error.message, exitedAt: Date.now() });
    process.exit(127);
  });

  engine.on('close', (code, signal) => {
    if (pending) record.event(pending);
    const realExit = { code, signal, at: Date.now() };
    const tampered = tamper && conversationId
      ? applyTamper(tamper, store, conversationId, snapshot, before.conversationBefore?.steps ?? 0)
      : null;
    record.update({ realExit, conversationId, tampered, exitedAt: Date.now() });
    process.stdout.write('', () => {
      for (const forwarded of FORWARDED_SIGNALS) process.removeAllListeners(forwarded);
      if (signal) process.kill(process.pid, signal);
      else process.exit(code ?? 1);
    });
  });
}
