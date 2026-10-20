import { mkdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const target = process.env.FR001_RUNTIME_ENTRY;
const observations = process.env.FR001_RUNTIME_OBSERVATIONS;

function resolved(path) {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

if (target && observations && process.argv[1] && resolved(process.argv[1]) === resolved(target)) {
  const dir = join(observations, 'runtime');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${process.pid}.json`);
  const record = { pid: process.pid, ppid: process.ppid, startedAt: Date.now(), argv: process.argv.slice(2), stdout: '' };
  const flush = () => {
    const temporary = `${path}.tmp`;
    writeFileSync(temporary, JSON.stringify(record));
    renameSync(temporary, path);
  };
  flush();
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, ...rest) => {
    record.stdout += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    flush();
    return write(chunk, ...rest);
  };
  process.on('exit', (code) => {
    record.exitedAt = Date.now();
    record.exitCode = code;
    flush();
  });
}
