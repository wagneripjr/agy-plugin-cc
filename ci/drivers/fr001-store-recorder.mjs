import childProcess from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { basename, delimiter, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = import.meta.url;
const config = new URL(SELF).searchParams;
const observations = config.get('observations');
const store = config.get('store');
const pluginRoot = config.get('plugin');
const NODE_NAME = /^node(js)?(\.exe)?$/;
if (!observations || !store) throw new Error(`the job-store recorder was loaded without its observation settings: ${SELF}`);

const original = {
  appendFileSync: fs.appendFileSync,
  mkdirSync: fs.mkdirSync,
  readFileSync: fs.readFileSync,
  readdirSync: fs.readdirSync,
  statSync: fs.statSync,
};

const log = join(observations, 'store-writes', `${process.pid}.ndjson`);

function emit(entry) {
  original.appendFileSync(log, `${JSON.stringify({ at: Date.now(), ...entry })}\n`);
}

function absolute(path) {
  if (path instanceof URL) return fileURLToPath(path);
  if (Buffer.isBuffer(path)) return resolve(path.toString('utf8'));
  return typeof path === 'string' ? resolve(path) : null;
}

function inStore(path) {
  return path !== null && (path === store || path.startsWith(`${store}${sep}`));
}

function text(data) {
  if (typeof data === 'string') return data;
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
  return null;
}

function snapshot(path) {
  try {
    const stat = original.statSync(path);
    if (stat.isDirectory()) return { kind: 'directory', files: original.readdirSync(path, { recursive: true }).map((name) => join(path, String(name))) };
    return { kind: 'file', after: original.readFileSync(path).toString('utf8') };
  } catch {
    return { kind: 'absent' };
  }
}

function record(op, paths, data) {
  const named = paths.map(absolute);
  if (!named.some(inStore)) return;
  const [path, to] = named;
  const target = to ?? path;
  const seen = snapshot(target);
  if (seen.kind === 'directory') {
    emit({ type: 'write', op, path, to, directory: true });
    for (const file of seen.files) {
      const inner = snapshot(file);
      if (inner.kind === 'file') emit({ type: 'write', op, path: file, after: inner.after });
    }
    return;
  }
  emit({ type: 'write', op, path, to, data: text(data), after: seen.kind === 'file' ? seen.after : null });
}

const descriptors = new Map();
const WRITE_FLAGS = /[wa+]/;

function writable(flags) {
  if (flags === undefined || flags === null) return false;
  if (typeof flags === 'number') return (flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND)) !== 0;
  return WRITE_FLAGS.test(String(flags));
}

function opened(path, flags, fd) {
  if (typeof fd !== 'number' || !writable(flags)) return;
  const full = absolute(path);
  if (!inStore(full)) return;
  descriptors.set(fd, full);
  record('open', [full]);
}

function pathOf(target) {
  return typeof target === 'number' ? descriptors.get(target) ?? null : target;
}

function keepPromisify(from, to) {
  for (const symbol of Object.getOwnPropertySymbols(from)) to[symbol] = from[symbol];
  return to;
}

const PATH_OPS = {
  writeFileSync: (args) => [[pathOf(args[0])], args[1]],
  appendFileSync: (args) => [[pathOf(args[0])], args[1]],
  truncateSync: (args) => [[args[0]]],
  copyFileSync: (args) => [[args[0], args[1]]],
  cpSync: (args) => [[args[0], args[1]]],
  renameSync: (args) => [[args[0], args[1]]],
  linkSync: (args) => [[args[0], args[1]]],
  symlinkSync: (args) => [[args[1]]],
  unlinkSync: (args) => [[args[0]]],
  rmSync: (args) => [[args[0]]],
  rmdirSync: (args) => [[args[0]]],
  mkdirSync: (args) => [[args[0]]],
  writeSync: (args) => [[descriptors.get(args[0]) ?? null], args[1]],
  writevSync: (args) => [[descriptors.get(args[0]) ?? null], Buffer.concat(args[1] ?? [])],
  ftruncateSync: (args) => [[descriptors.get(args[0]) ?? null]],
};

for (const [name, describe] of Object.entries(PATH_OPS)) {
  const wrapped = fs[name];
  fs[name] = function (...args) {
    const out = wrapped.apply(this, args);
    const [paths, data] = describe(args);
    if (paths.every((path) => path !== null)) record(name, paths, data);
    return out;
  };
  const callback = name.replace(/Sync$/, '');
  const async = fs[callback];
  if (typeof async === 'function') {
    fs[callback] = keepPromisify(async, function (...args) {
      const done = typeof args.at(-1) === 'function' ? args.pop() : null;
      const [paths, data] = describe(args);
      return async.call(this, ...args, (error, ...rest) => {
        if (!error && paths.every((path) => path !== null)) record(callback, paths, data);
        done?.(error, ...rest);
      });
    });
  }
}

const openSync = fs.openSync;
fs.openSync = function (path, flags, ...rest) {
  const fd = openSync.call(this, path, flags, ...rest);
  opened(path, flags, fd);
  return fd;
};

const openAsync = fs.open;
fs.open = function (path, flags, ...rest) {
  const done = typeof rest.at(-1) === 'function' ? rest.pop() : typeof flags === 'function' ? flags : null;
  const given = typeof flags === 'function' ? undefined : flags;
  return openAsync.call(this, path, given ?? 'r', ...rest, (error, fd) => {
    if (!error) opened(path, given, fd);
    done?.(error, fd);
  });
};

const closeSync = fs.closeSync;
fs.closeSync = function (fd) {
  const path = descriptors.get(fd);
  closeSync.call(this, fd);
  if (path) {
    descriptors.delete(fd);
    record('close', [path]);
  }
};

const closeAsync = fs.close;
fs.close = function (fd, done) {
  const path = descriptors.get(fd);
  return closeAsync.call(this, fd, (error) => {
    if (path) {
      descriptors.delete(fd);
      record('close', [path]);
    }
    done?.(error);
  });
};

const promises = fs.promises;
const PROMISE_OPS = {
  writeFile: (args) => [[args[0]], args[1]],
  appendFile: (args) => [[args[0]], args[1]],
  truncate: (args) => [[args[0]]],
  copyFile: (args) => [[args[0], args[1]]],
  cp: (args) => [[args[0], args[1]]],
  rename: (args) => [[args[0], args[1]]],
  link: (args) => [[args[0], args[1]]],
  symlink: (args) => [[args[1]]],
  unlink: (args) => [[args[0]]],
  rm: (args) => [[args[0]]],
  rmdir: (args) => [[args[0]]],
  mkdir: (args) => [[args[0]]],
};

function watchHandle(handle, path) {
  for (const method of ['write', 'writev', 'writeFile', 'appendFile', 'truncate']) {
    const inner = handle[method];
    handle[method] = async function (...args) {
      const out = await inner.apply(this, args);
      record(`handle.${method}`, [path], method === 'writev' ? null : args[0]);
      return out;
    };
  }
  const close = handle.close;
  handle.close = async function () {
    await close.call(this);
    record('handle.close', [path]);
  };
  return handle;
}

for (const [name, describe] of Object.entries(PROMISE_OPS)) {
  const wrapped = promises[name];
  promises[name] = async function (...args) {
    const out = await wrapped.apply(this, args);
    const [paths, data] = describe(args);
    record(`promises.${name}`, paths, data);
    return out;
  };
}

const openPromise = promises.open;
promises.open = async function (path, flags, ...rest) {
  const handle = await openPromise.call(this, path, flags, ...rest);
  const full = absolute(path);
  if (!writable(flags) || !inStore(full)) return handle;
  record('promises.open', [full]);
  return watchHandle(handle, full);
};

const NODE_BINARY = realpath(process.execPath);

function realpath(path) {
  try {
    return fs.realpathSync(path);
  } catch {
    return null;
  }
}

function located(file) {
  if (file.includes(sep)) return realpath(file);
  for (const dir of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    const found = realpath(join(dir, file));
    if (found) return found;
  }
  return null;
}

function isNode(file) {
  if (typeof file !== 'string') return false;
  return file === process.execPath || NODE_NAME.test(basename(file)) || located(file) === NODE_BINARY;
}

function isRuntimeScript(file) {
  if (!pluginRoot || typeof file !== 'string') return false;
  const full = resolve(file);
  return full.startsWith(`${pluginRoot}${sep}`);
}

function carryObservation(options) {
  const node = isNode(options.file);
  const flag = `--import=${SELF}`;
  if (node && Array.isArray(options.args) && !options.args.includes(flag)) options.args = [options.args[0], flag, ...options.args.slice(1)];
  return { file: options.file, node, script: !node && isRuntimeScript(options.file) };
}

function spawned(started, pid) {
  emit({ type: 'spawn', ...started, pid: pid ?? null });
}

const spawnChild = childProcess.ChildProcess.prototype.spawn;
childProcess.ChildProcess.prototype.spawn = function (options) {
  const started = carryObservation(options);
  const out = spawnChild.call(this, options);
  spawned(started, this.pid);
  return out;
};

let syncSpawns = null;
try {
  syncSpawns = process.binding('spawn_sync');
} catch {}
if (syncSpawns && typeof syncSpawns.spawn === 'function') {
  const spawnSync = syncSpawns.spawn;
  syncSpawns.spawn = function (options) {
    const started = carryObservation(options);
    const out = spawnSync.call(this, options);
    spawned(started, out?.pid);
    return out;
  };
}

original.mkdirSync(join(observations, 'store-writes'), { recursive: true });
emit({ type: 'process', pid: process.pid, ppid: process.ppid, argv: process.argv.slice(1) });
if (!syncSpawns) emit({ type: 'gap', what: 'synchronous process starts' });
syncBuiltinESMExports();
