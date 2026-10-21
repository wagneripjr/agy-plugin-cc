import { sessionValueMessage } from './engine.mjs';
import { engineEnvironment, runCommand } from './process.mjs';

const ENGINE = 'agy';

function said(result) {
  return (result.code === 0 ? result.stdout : result.stderr || result.stdout).trim();
}

function modelIds(stdout) {
  return stdout.split('\n').filter((line) => line.includes('\t')).map((line) => line.split('\t')[0].trim());
}

export async function setup() {
  const { env, refused } = engineEnvironment();
  if (refused) throw new Error(sessionValueMessage(refused));
  const version = await runCommand(ENGINE, ['--version'], env);
  if (version.error) {
    return {
      engine: { installed: false, version: null, message: `${ENGINE} is not on the path (${version.error.code ?? version.error.message})` },
      account: null,
      models: [],
      plugins: null,
      mcpServers: null,
    };
  }
  const [models, plugins, mcp] = await Promise.all([
    runCommand(ENGINE, ['models'], env),
    runCommand(ENGINE, ['plugin', 'list'], env),
    runCommand(ENGINE, ['mcp', 'list'], env),
  ]);
  const listed = models.code === 0 ? modelIds(models.stdout) : [];
  const usable = listed.length > 0;
  return {
    engine: { installed: true, version: said(version) || null, message: null },
    account: { state: usable ? 'usable' : 'unavailable', message: usable ? null : said(models) || models.error?.message || null },
    models: listed,
    plugins: said(plugins),
    mcpServers: said(mcp),
  };
}

export function renderSetup(report) {
  if (!report.engine.installed) return `Antigravity: not installed. ${report.engine.message}\n`;
  const account = report.account.state === 'usable' ? 'usable' : `unavailable: ${report.account.message}`;
  return [
    `Antigravity: ${report.engine.version}`,
    `Account: ${account}`,
    `Models: ${report.models.join(', ') || 'none listed'}`,
    'Plugins:',
    report.plugins,
    'MCP servers:',
    report.mcpServers,
    '',
  ].join('\n');
}
