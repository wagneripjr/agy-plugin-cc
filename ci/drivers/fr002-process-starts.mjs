import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, join } from 'node:path';

export const GIT_TRACE_FILE = 'git-trace2.ndjson';

function realpath(path) {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

function records(path, problems, what) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      problems.push(`${what} holds an unreadable entry`);
      return [];
    }
  });
}

function sessionPid(sid) {
  const pid = /-P([0-9a-f]+)$/.exec(String(sid).split('/').at(-1))?.[1];
  return pid ? Number.parseInt(pid, 16) : null;
}

function gitTrace(observations, problems) {
  const events = records(join(observations, GIT_TRACE_FILE), problems, 'the git trace');
  const sessions = new Map();
  for (const event of events) {
    const pid = sessionPid(event.sid);
    if (pid !== null && !sessions.has(pid)) sessions.set(pid, event.sid);
  }
  return { events, sessions };
}

function runtimeCommand(argv, runtime) {
  const [script, subcommand] = argv ?? [];
  if (!script || realpath(script) !== realpath(runtime)) return null;
  return subcommand ?? '(no subcommand)';
}

export function processStarts({ observations, pid, runtime }) {
  const problems = [];
  const dir = join(observations, 'store-writes');
  const entries = [];
  for (const name of existsSync(dir) ? readdirSync(dir) : []) {
    const source = Number.parseInt(name, 10);
    for (const entry of records(join(dir, name), problems, `the start record of process ${source}`)) entries.push({ source, ...entry });
  }
  const processes = new Map(entries.filter((entry) => entry.type === 'process').map((entry) => [entry.pid, entry]));
  for (const entry of entries.filter((candidate) => candidate.type === 'gap')) problems.push(`process ${entry.source} could not observe its ${entry.what}`);
  if (!processes.has(pid)) problems.push(`its own process ${pid} left no record of the processes it started`);
  const trace = gitTrace(observations, problems);
  const starts = [];

  const visitGit = (gitPid) => {
    const sid = trace.sessions.get(gitPid);
    if (!sid) {
      problems.push(`git process ${gitPid} left no trace of the processes it started`);
      return;
    }
    const own = trace.events.filter((event) => event.sid === sid);
    for (const child of own.filter((event) => event.event === 'child_start')) {
      const name = child.use_shell ? 'sh' : basename(String(child.argv?.[0] ?? '(unnamed)'));
      const childPid = own.find((event) => (event.event === 'child_exit' || event.event === 'child_ready') && event.child_id === child.child_id && event.pid)?.pid ?? null;
      starts.push({ name, pid: childPid });
      if (name !== 'git') continue;
      if (childPid === null) problems.push(`git process ${gitPid} started git without naming its process`);
      else visitGit(childPid);
    }
  };

  const visit = (parent) => {
    for (const entry of entries.filter((candidate) => candidate.type === 'spawn' && candidate.source === parent)) {
      if (entry.node) {
        const child = entry.pid ? processes.get(entry.pid) : null;
        if (!child) {
          starts.push({ name: 'node', pid: entry.pid });
          if (entry.pid) problems.push(`node process ${entry.pid} left no record of the processes it started`);
          continue;
        }
        starts.push({ name: runtimeCommand(child.argv, runtime) ?? 'node', pid: entry.pid });
        visit(entry.pid);
        continue;
      }
      const name = basename(String(entry.file));
      starts.push({ name, pid: entry.pid });
      if (entry.script) problems.push(`process ${parent} started ${entry.file} directly, so what it started could not be observed`);
      if (name === 'git' && entry.pid) visitGit(entry.pid);
    }
  };

  visit(pid);
  return { starts, problems };
}
