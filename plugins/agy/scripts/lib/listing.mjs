import { realpathSync } from 'node:fs';

import { allRecords } from './jobs.mjs';
import { workspaceRoot } from './workspace.mjs';

const LIMIT = 10;

export function directoryOf(record) {
  try {
    return realpathSync(record.cwd);
  } catch {
    return record.cwd;
  }
}

export function inWorkspace(dir, root) {
  return root === '/' || dir === root || dir.startsWith(`${root}/`);
}

export function newestFirst(a, b) {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return Buffer.compare(Buffer.from(b.id), Buffer.from(a.id));
}

export async function listJobs({ all, cwd }) {
  const records = allRecords().map((record) => ({ record, directory: directoryOf(record) }));
  const root = all ? null : await workspaceRoot(cwd);
  return records
    .filter(({ directory }) => all || inWorkspace(directory, root))
    .sort((a, b) => newestFirst(a.record, b.record))
    .slice(0, LIMIT);
}
