export function report(job) {
  const succeeded = job.state === 'succeeded';
  return {
    ...job,
    response: succeeded && job.kind === 'task' ? job.response : null,
    findings: succeeded ? job.findings : null,
    proof: succeeded ? job.proof : null,
  };
}

function proofLine({ verification, unverifiedReason, markedStepIdx, stepsBefore, stepsAfter }) {
  const steps = `marked step ${markedStepIdx ?? 'none'}; steps ${stepsBefore} before, ${stepsAfter ?? 'unreadable'} after`;
  return verification === 'verified' ? `Proof: verified; ${steps}` : `Proof: unverified (${unverifiedReason}); ${steps}`;
}

export function renderJob(job, { json = false, body = true } = {}) {
  const shown = report(job);
  if (json) return `${JSON.stringify(shown, null, 2)}\n`;
  const lines = [`Antigravity ${shown.kind} ${shown.id}: ${shown.state}`];
  if (shown.reason) lines.push(`Reason: ${shown.reason.message}`);
  lines.push(`Requested: model ${shown.settings.model}, effort ${shown.settings.effort}`);
  const engineModel = shown.engine.model ? `${shown.engine.model} (${shown.engine.modelConfirmation})` : 'no confirmation arrived';
  lines.push(`Engine model: ${engineModel}; effort ${shown.engine.effortConfirmation}`);
  if (shown.conversation) lines.push(`Conversation: ${shown.conversation.id} (${shown.conversation.file})`);
  if (shown.proof?.verification) lines.push(proofLine(shown.proof));
  if (body && shown.response !== null) lines.push('', shown.response);
  return `${lines.join('\n')}\n`;
}
