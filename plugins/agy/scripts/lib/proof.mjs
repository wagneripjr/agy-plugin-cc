import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

const USER_INPUT_STEP = 14;

export function marker(jobId) {
  return `[agy-plugin job ${jobId}]`;
}

function readSteps(file) {
  if (!file || !existsSync(file)) return null;
  try {
    const db = new DatabaseSync(`${pathToFileURL(file).href}?immutable=1`, { readOnly: true });
    try {
      return db.prepare('SELECT idx, step_type, step_payload FROM steps ORDER BY idx').all();
    } finally {
      db.close();
    }
  } catch {
    return existsSync(file) ? [] : null;
  }
}

export function stepCount(file) {
  return readSteps(file)?.length ?? 0;
}

export function unproven(stepsBefore) {
  return { markedStepIdx: null, stepsBefore, stepsAfter: null, verification: null, unverifiedReason: null };
}

export function verify(job) {
  const steps = readSteps(job.conversation?.file);
  const stepsBefore = job.proof?.stepsBefore ?? 0;
  const tag = Buffer.from(marker(job.id));
  const marked = steps?.find((step) => step.step_type === USER_INPUT_STEP && Buffer.from(step.step_payload ?? []).includes(tag));
  const stepsAfter = steps?.length ?? null;
  let unverifiedReason = null;
  if (!steps) unverifiedReason = 'conversation-file-missing';
  else if (!marked) unverifiedReason = 'marked-step-absent';
  else if (stepsAfter <= stepsBefore) unverifiedReason = 'step-count-not-grown';
  return {
    markedStepIdx: marked?.idx ?? null,
    stepsBefore,
    stepsAfter,
    verification: unverifiedReason ? 'unverified' : 'verified',
    unverifiedReason,
  };
}
