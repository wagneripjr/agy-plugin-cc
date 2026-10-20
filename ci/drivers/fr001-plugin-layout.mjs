import { homedir } from 'node:os';
import { join } from 'node:path';

export const PLUGIN_ROOT = 'plugins/agy';
export const PLUGIN_MANIFEST = `${PLUGIN_ROOT}/.claude-plugin/plugin.json`;
export const RUNTIME_ENTRY = `${PLUGIN_ROOT}/scripts/agy-companion.mjs`;
export const RUNTIME_DIR = `${PLUGIN_ROOT}/scripts`;
export const AGENTS_DIR = `${PLUGIN_ROOT}/agents`;
export const FINDINGS_SCHEMA = `${PLUGIN_ROOT}/schemas/review-findings.schema.json`;
export const DEFAULTS_DOC = `${PLUGIN_ROOT}/README.md`;
export const PLUGIN_DATA_ENV = 'CLAUDE_PLUGIN_DATA';

export function conversationStore(home = homedir()) {
  return join(home, '.gemini', 'antigravity-cli', 'conversations');
}
