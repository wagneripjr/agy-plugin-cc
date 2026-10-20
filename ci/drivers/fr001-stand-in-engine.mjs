import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { EngineRecord, hasOption, optionValue } from './fr001-engine-record.mjs';

export const STAND_IN_VERSION = '0.0.0-fr001-stand-in';
export const STAND_IN_MODELS = 'stand-in-model-a\tStand-in Model A\nstand-in-model-b\tStand-in Model B\n';
export const STAND_IN_PLUGINS = 'Installed plugins:\n- stand-in-plugin (enabled, 0.0.1)\n';
export const STAND_IN_MCP = 'No MCP servers configured.\n';
export const ACCOUNT_UNAVAILABLE_MESSAGE = 'Stand-in account is signed out: sign in to Antigravity to list models.';
export const OTHER_MODEL = 'stand-in-other-model';
export const STAND_IN_RESPONSE = 'Stand-in engine finished the delegated work.';

const VALID_FINDINGS = Object.freeze({
  findings: [{ file: 'math.mjs', line: 2, claim: 'add subtracts instead of adding', evidence: 'line 2 returns a - b', verdict: 'defect' }],
});
const BROKEN_FINDINGS = Object.freeze({ findings: [{ file: 'math.mjs', line: 'two' }] });

const PLAN = Object.freeze({
  'completes-normally': { init: 'requested', result: 'SUCCESS', exit: 0 },
  'works-until-released': { init: 'requested', hold: 'before-result', result: 'SUCCESS', exit: 0 },
  'reports-success-and-works-until-released': { init: 'requested', result: 'SUCCESS', hold: 'after-result', exit: 0 },
  'exits-before-confirming-model': { exit: 1 },
  'exits-before-result': { init: 'requested', exit: 1 },
  'reports-unsuccessful-result': { init: 'requested', result: 'ERROR', exit: 0 },
  'reports-unsuccessful-result-then-exits-with-error': { init: 'requested', result: 'ERROR', exit: 1 },
  'returns-schema-breaking-findings': { init: 'requested', result: 'SUCCESS', findings: 'broken', exit: 0 },
  'returns-schema-breaking-findings-then-exits-with-error': { init: 'requested', result: 'SUCCESS', findings: 'broken', exit: 1 },
  'exits-with-error-after-success': { init: 'requested', result: 'SUCCESS', exit: 1 },
  'runs-another-model': { init: 'other', pause: 1500, result: 'SUCCESS', exit: 0 },
  'runs-another-model-and-keeps-working': { init: 'other', hold: 'before-result', result: 'SUCCESS', exit: 0 },
  'account-unavailable': { init: 'requested', result: 'SUCCESS', exit: 0 },
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function finish(record, code) {
  record.update({ exitedAt: Date.now(), exitCode: code });
  process.stdout.write('', () => process.exit(code));
}

function say(record, text) {
  for (const line of text.split('\n').filter(Boolean)) record.event(line);
  process.stdout.write(text);
}

function answerSubcommand(record, behaviour, argv) {
  const [first, second] = argv;
  if (first === '--version') {
    say(record, `${STAND_IN_VERSION}\n`);
    return finish(record, 0);
  }
  if (first === 'models') {
    if (behaviour === 'account-unavailable') {
      process.stderr.write(`${ACCOUNT_UNAVAILABLE_MESSAGE}\n`);
      return finish(record, 1);
    }
    say(record, STAND_IN_MODELS);
    return finish(record, 0);
  }
  if (first === 'plugin' && second === 'list') {
    say(record, STAND_IN_PLUGINS);
    return finish(record, 0);
  }
  if (first === 'mcp' && second === 'list') {
    say(record, STAND_IN_MCP);
    return finish(record, 0);
  }
  process.stderr.write(`stand-in engine does not implement: ${argv.join(' ')}\n`);
  return finish(record, 2);
}

async function holdUntilReleased(observations) {
  const release = join(observations, `release-${process.pid}`);
  while (!existsSync(release)) await sleep(50);
}

export async function standIn({ behaviour, observations }) {
  const argv = process.argv.slice(2);
  const record = new EngineRecord(observations, { kind: 'stand-in', behaviour });
  process.on('SIGTERM', () => {
    record.update({ exitedAt: Date.now(), terminatedBy: 'SIGTERM' });
    process.exit(143);
  });
  if (!hasOption(argv, 'print') && !argv.includes('-p')) return answerSubcommand(record, behaviour, argv);

  const plan = PLAN[behaviour];
  if (!plan) {
    process.stderr.write(`unknown stand-in behaviour ${behaviour}\n`);
    return finish(record, 2);
  }
  const emit = (event) => {
    const line = JSON.stringify(event);
    record.event(line);
    process.stdout.write(`${line}\n`);
  };
  const conversationId = optionValue(argv, 'conversation') ?? randomUUID();
  const requested = optionValue(argv, 'model');
  const review = hasOption(argv, 'json-schema');

  if (plan.init) {
    const model = plan.init === 'other' ? OTHER_MODEL : requested;
    emit({ event: 'init', conversation_id: conversationId, init: { model, cwd: process.cwd(), tools: [], permission_mode: review ? 'plan' : 'request-review' } });
    emit({ event: 'step_update', step_update: { conversation_id: conversationId, step_index: 0, state: 'DONE', step_type: 'user_input' } });
  }
  if (plan.pause) await sleep(plan.pause);
  if (plan.hold === 'before-result') await holdUntilReleased(observations);
  if (plan.result) {
    const result = { conversation_id: conversationId, status: plan.result, response: STAND_IN_RESPONSE, duration_seconds: 0.1, num_turns: 1 };
    if (review) result.structured_output = plan.findings === 'broken' ? BROKEN_FINDINGS : VALID_FINDINGS;
    emit({ event: 'result', result });
  }
  if (plan.hold === 'after-result') await holdUntilReleased(observations);
  return finish(record, plan.exit);
}
