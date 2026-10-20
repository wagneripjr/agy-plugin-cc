import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';

import { AGENTS_DIR, PLUGIN_MANIFEST, PLUGIN_ROOT, RUNTIME_ENTRY } from './fr001-plugin-layout.mjs';
import { callArguments, lineOf, tokenize } from './fr001-source-scan.mjs';

const CODE_EXTENSIONS = new Set(['.mjs', '.js', '.cjs', '.ts', '.mts', '.cts', '.jsx', '.tsx', '.sh', '.bash', '.zsh', '.fish', '.py', '.rb', '.pl', '.php', '.ps1', '.bat', '.cmd', '.go', '.rs']);
const PROCESS_STARTERS = new Set(['spawn', 'spawnSync', 'execFile', 'execFileSync', 'fork']);
const SHELL_COMMANDS = new Set(['exec', 'execSync']);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'fish', 'dash', 'ksh', 'csh', 'tcsh', 'cmd', 'cmd.exe', 'powershell', 'powershell.exe', 'pwsh', 'pwsh.exe']);
const SHELL_REACHERS = new Set(['env']);
const CHILD_PROCESS_MODULES = new Set(['child_process', 'node:child_process']);
const DEPENDENCY_KEYS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies', 'bundledDependencies', 'bundleDependencies'];
const EXTENSION_CHANGES = [
  { subject: new Set(['mcp']), verbs: new Set(['add', 'remove', 'enable', 'disable']) },
  { subject: new Set(['plugin', 'plugins']), verbs: new Set(['install', 'uninstall', 'enable', 'disable', 'import']) },
];

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.isFile() ? [path] : [];
  });
}

function isRuntimeFile(path) {
  if (CODE_EXTENSIONS.has(extname(path))) return true;
  if ((statSync(path).mode & 0o111) !== 0) return true;
  return readFileSync(path, 'utf8').startsWith('#!');
}

function failure(message, problems) {
  return new Error(`${message}:\n       ${problems.join('\n       ')}`);
}

function frontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!match) return null;
  const fields = {};
  let listKey = null;
  for (const line of match[1].split('\n')) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && listKey) {
      fields[listKey].push(item[1].trim());
      continue;
    }
    const pair = /^([\w-]+):\s*(.*)$/.exec(line);
    if (!pair) continue;
    const value = pair[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    listKey = value === '' ? pair[1] : null;
    fields[pair[1]] = value === '' ? [] : value;
  }
  return fields;
}

function listOf(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  return value.replace(/^\[(.*)\]$/, '$1').split(',').map((item) => item.trim().replace(/^(['"])(.*)\1$/, '$2')).filter(Boolean);
}

export async function createPluginSourceDriver({ repoRoot }) {
  const root = join(repoRoot, PLUGIN_ROOT);
  const where = (path) => relative(repoRoot, path);

  const requireRuntime = () => {
    if (!existsSync(join(repoRoot, RUNTIME_ENTRY))) throw new Error(`the plugin ships no runtime: ${RUNTIME_ENTRY} does not exist`);
  };

  const runtimeFiles = () => {
    requireRuntime();
    return walk(root).filter(isRuntimeFile);
  };

  const scanned = () => runtimeFiles()
    .filter((path) => extname(path) === '.mjs')
    .map((path) => {
      const source = readFileSync(path, 'utf8');
      return { path, source, tokens: tokenize(source) };
    });

  const subagents = () => {
    const files = walk(join(repoRoot, AGENTS_DIR)).filter((path) => extname(path) === '.md');
    const manifestPath = join(repoRoot, PLUGIN_MANIFEST);
    if (existsSync(manifestPath)) {
      const declared = JSON.parse(readFileSync(manifestPath, 'utf8')).agents;
      for (const entry of listOf(declared)) {
        const path = join(root, entry);
        if (!files.includes(path)) files.push(path);
      }
    }
    return files;
  };

  const theSubagent = () => {
    const files = subagents();
    if (files.length !== 1) throw new Error(`the plugin ships ${files.length} subagents, not exactly one${files.length ? `: ${files.map(where).join(', ')}` : ''}`);
    const fields = frontmatter(readFileSync(files[0], 'utf8'));
    if (!fields) throw new Error(`the subagent ${where(files[0])} carries no definition header`);
    return { path: files[0], fields };
  };

  function processStarts() {
    const problems = [];
    for (const { path, source, tokens } of scanned()) {
      const namespaces = new Set();
      const starters = new Set(PROCESS_STARTERS);
      tokens.forEach((token, i) => {
        if (token.type !== 'string' || !CHILD_PROCESS_MODULES.has(token.value) || tokens[i - 1]?.value !== 'from') return;
        let j = i - 2;
        while (j >= 0 && tokens[j].value !== 'import') j -= 1;
        const clause = tokens.slice(j + 1, i - 1);
        clause.forEach((part, k) => {
          if (part.type === 'word' && SHELL_COMMANDS.has(part.value)) problems.push(`${where(path)}:${lineOf(source, part.at)} imports ${part.value} from child_process`);
          if (part.value !== 'as' || clause[k + 1]?.type !== 'word') return;
          if (clause[k - 1]?.value === '*') namespaces.add(clause[k + 1].value);
          if (PROCESS_STARTERS.has(clause[k - 1]?.value)) starters.add(clause[k + 1].value);
        });
        if (clause.length === 1 && clause[0].type === 'word') namespaces.add(clause[0].value);
      });
      tokens.forEach((token, i) => {
        if (token.type !== 'word') return;
        const next = tokens[i + 1];
        const before = tokens[i - 1];
        const object = before?.value === '.' ? tokens[i - 2] : null;
        const called = next?.type === 'punct' && next.value === '(';
        if (SHELL_COMMANDS.has(token.value) && called && (!object || namespaces.has(object.value) || token.value === 'execSync')) {
          problems.push(`${where(path)}:${lineOf(source, token.at)} starts a process through ${token.value}, which runs a shell`);
        }
        if (token.value === 'shell' && next?.value === ':' && tokens[i + 2]?.value !== 'false') {
          problems.push(`${where(path)}:${lineOf(source, token.at)} sets the shell option`);
        }
        if (token.value === 'shell' && before?.value === '.' && next?.value === '=') {
          problems.push(`${where(path)}:${lineOf(source, token.at)} assigns the shell option`);
        }
        if (!starters.has(token.value) || !called) return;
        if (object && object.type === 'word' && !namespaces.has(object.value)) return;
        const args = callArguments(tokens, i + 1);
        const at = `${where(path)}:${lineOf(source, token.at)}`;
        const executable = args[0];
        if (!executable) {
          problems.push(`${at} ${token.value} names no executable`);
          return;
        }
        if (executable.length === 1 && ['string', 'template'].includes(executable[0].type) && /\s/.test(executable[0].value.trim())) {
          problems.push(`${at} ${token.value} is given a single command string`);
        }
        const list = args[1];
        const listOpens = list?.[0];
        if (!list || listOpens.type === 'string' || listOpens.type === 'template' || (listOpens.type === 'punct' && listOpens.value === '{')) {
          problems.push(`${at} ${token.value} is not given an argument list`);
        }
      });
    }
    return problems;
  }

  function shellNames() {
    const problems = [];
    for (const { path, source, tokens } of scanned()) {
      tokens.forEach((token, i) => {
        if (token.type !== 'string' && !(token.type === 'template' && !token.expressions)) return;
        const name = basename(token.value.trim());
        if (SHELLS.has(name)) problems.push(`${where(path)}:${lineOf(source, token.at)} names the shell ${token.value}`);
        if (SHELL_REACHERS.has(name) && tokens[i + 1]?.value === ',') {
          const call = tokens[i - 2];
          if (call?.type === 'word' && PROCESS_STARTERS.has(call.value)) problems.push(`${where(path)}:${lineOf(source, token.at)} starts ${token.value}, which reaches a shell`);
        }
      });
    }
    return problems;
  }

  return {
    async confirmRuntimeShipped() {
      requireRuntime();
    },

    async confirmRuntimeFilesAreNodeModules() {
      const strays = runtimeFiles().filter((path) => extname(path) !== '.mjs');
      if (strays.length > 0) throw failure('runtime files that are not Node modules ship with the plugin', strays.map(where));
    },

    async confirmNoPackageDependency() {
      requireRuntime();
      const problems = [];
      for (const path of walk(root)) {
        if (path.split('/').includes('node_modules')) problems.push(`${where(path)} is a bundled package`);
        if (basename(path) !== 'package.json') continue;
        const manifest = JSON.parse(readFileSync(path, 'utf8'));
        for (const key of DEPENDENCY_KEYS) {
          const declared = manifest[key];
          if (declared && Object.keys(declared).length > 0) problems.push(`${where(path)} declares ${key}: ${Object.keys(declared).join(', ')}`);
        }
      }
      if (problems.length > 0) throw failure('the plugin declares package dependencies', [...new Set(problems)]);
    },

    async confirmProcessesStartedWithArgumentLists() {
      const problems = processStarts();
      if (problems.length > 0) throw failure('the runtime starts processes other than as an executable with an argument list', problems);
    },

    async confirmNoShellNamedNorCommandString() {
      const problems = [...shellNames(), ...processStarts().filter((problem) => problem.includes('single command string') || problem.includes('runs a shell'))];
      if (problems.length > 0) throw failure('the runtime names a shell or passes a command string', problems);
    },

    async confirmEngineExtensionsNeverChanged() {
      const problems = [];
      for (const { path, source, tokens } of scanned()) {
        const strings = tokens.map((token, i) => ({ token, i })).filter(({ token }) => token.type === 'string' || token.type === 'template');
        for (const { token, i } of strings) {
          for (const change of EXTENSION_CHANGES) {
            const words = token.value.trim().split(/\s+/);
            const inline = words.some((word, k) => change.subject.has(word) && change.verbs.has(words[k + 1]));
            const following = tokens[i + 1]?.value === ',' && ['string', 'template'].includes(tokens[i + 2]?.type) ? tokens[i + 2].value.trim() : null;
            const listed = change.subject.has(token.value.trim()) && following !== null && change.verbs.has(following);
            if (inline || listed) problems.push(`${where(path)}:${lineOf(source, token.at)} runs agy ${token.value.trim()}${listed ? ` ${following}` : ''}`);
          }
        }
      }
      if (problems.length > 0) throw failure("the runtime changes Antigravity's MCP servers or plugins", problems);
    },

    async confirmExactlyOneSubagent() {
      theSubagent();
    },

    async confirmSubagentToolsShellOnly() {
      const { path, fields } = theSubagent();
      const tools = listOf(fields.tools);
      if (tools.length !== 1 || tools[0] !== 'Bash') throw new Error(`the subagent ${where(path)} has the tools [${tools.join(', ')}], not the shell alone`);
    },

    async confirmSubagentNamesAntigravity() {
      const { path, fields } = theSubagent();
      if (!/Antigravity/.test(fields.description ?? '')) throw new Error(`the subagent ${where(path)} does not name Antigravity in its description: "${fields.description ?? ''}"`);
    },

    async confirmSubagentOmitsCodex() {
      const { path, fields } = theSubagent();
      if (/codex/i.test(fields.description ?? '')) throw new Error(`the subagent ${where(path)} names Codex in its description: "${fields.description}"`);
    },
  };
}
