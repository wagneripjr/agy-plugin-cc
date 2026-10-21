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

function findingLines({ findings, summary }) {
  const lines = findings.length === 0 ? ['', 'No findings.'] : findings.flatMap((finding, i) => [
    '',
    `${i + 1}. ${finding.file}:${finding.line} [${finding.severity ? `${finding.verdict}, ${finding.severity}` : finding.verdict}] ${finding.claim}`,
    `   Evidence: ${finding.evidence}`,
  ]);
  return summary ? [...lines, '', `Summary: ${summary}`] : lines;
}

function listingEntry({ record, directory }, all) {
  const entry = {
    id: record.id,
    leg: record.kind,
    state: record.state,
    model: record.settings.model,
    createdAt: record.createdAt,
    verification: record.state === 'succeeded' ? record.proof?.verification ?? 'unverified' : null,
  };
  return all ? { ...entry, directory } : entry;
}

export function renderListing(listed, { json = false, all = false } = {}) {
  const entries = listed.map((item) => listingEntry(item, all));
  if (json) return `${JSON.stringify(entries, null, 2)}\n`;
  if (entries.length === 0) return `No agy jobs${all ? '' : ' in this workspace'}.\n`;
  const lines = entries.map((entry) => [entry.id, entry.leg, entry.state, entry.model, entry.createdAt, entry.verification, entry.directory]
    .filter((value) => value !== null && value !== undefined)
    .join('  '));
  return `${lines.join('\n')}\n`;
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
  if (body && shown.findings) lines.push(...findingLines(shown.findings));
  return `${lines.join('\n')}\n`;
}
