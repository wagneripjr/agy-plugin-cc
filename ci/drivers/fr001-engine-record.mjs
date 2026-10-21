import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function engineDir(observations) {
  const dir = join(observations, 'engines');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export class EngineRecord {
  #path;
  #eventsPath;
  #data;

  constructor(observations, data) {
    const dir = engineDir(observations);
    this.#path = join(dir, `${process.pid}.json`);
    this.#eventsPath = join(dir, `${process.pid}.events.ndjson`);
    this.#data = { pid: process.pid, ppid: process.ppid, startedAt: Date.now(), argv: process.argv.slice(2), cwd: process.cwd(), env: { ...process.env }, ...data };
    this.#flush();
  }

  update(fields) {
    Object.assign(this.#data, fields);
    this.#flush();
  }

  event(line) {
    appendFileSync(this.#eventsPath, `${line}\n`);
  }

  #flush() {
    const temporary = `${this.#path}.${Date.now()}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.#data));
    renameSync(temporary, this.#path);
  }
}

export function readEngineRecords(observations) {
  const dir = join(observations, 'engines');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /^\d+\.json$/.test(name))
    .map((name) => {
      const record = JSON.parse(readFileSync(join(dir, name), 'utf8'));
      const eventsPath = join(dir, `${record.pid}.events.ndjson`);
      const lines = existsSync(eventsPath) ? readFileSync(eventsPath, 'utf8').split('\n').filter(Boolean) : [];
      record.lines = lines;
      record.events = lines.map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { unparsed: line };
        }
      });
      return record;
    })
    .sort((a, b) => a.startedAt - b.startedAt || a.pid - b.pid);
}

export function optionValue(argv, name) {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === `--${name}`) return argv[i + 1];
    if (argv[i].startsWith(`--${name}=`)) return argv[i].slice(name.length + 3);
  }
  return undefined;
}

export function hasOption(argv, name) {
  return argv.some((token) => token === `--${name}` || token.startsWith(`--${name}=`));
}

export function readSteps(dbPath) {
  const db = new DatabaseSync(`file:${dbPath}?immutable=1`, { readOnly: true });
  try {
    return db.prepare('SELECT idx, step_type, step_payload FROM steps ORDER BY idx').all();
  } finally {
    db.close();
  }
}

export function stepCount(dbPath) {
  return existsSync(dbPath) ? readSteps(dbPath).length : 0;
}

export function keepOnlyStep(dbPath, idx) {
  const db = new DatabaseSync(dbPath);
  try {
    db.prepare('DELETE FROM steps WHERE idx != ?').run(idx);
  } finally {
    db.close();
  }
}
