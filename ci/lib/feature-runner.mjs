//status: Draft
import { readFileSync } from 'node:fs';

export class InstrumentError extends Error {}

const UNSOUND = [InstrumentError, TypeError, ReferenceError, SyntaxError, RangeError];

const SCENARIO_KEYWORDS = /^(Scenario Outline|Scenario Template|Scenario|Example):\s*(.*)$/;
const STEP_KEYWORDS = /^(Given|When|Then|And|But|\*)\s+(.*)$/;

function tagsOf(line) {
  return line.split(/\s+/).filter((token) => token.startsWith('@'));
}

function cellsOf(line) {
  return line.slice(1, line.lastIndexOf('|')).split('|').map((cell) => cell.trim());
}

function parseError(path, number, message) {
  return new InstrumentError(`${path}:${number}: ${message}`);
}

export function parseFeature(path) {
  const lines = readFileSync(path, 'utf8').split('\n');
  const feature = { name: '', tags: [], scenarios: [] };
  let pendingTags = [];
  let ruleTags = [];
  let rule = '';
  let current = null;
  let examples = null;
  let inDescription = false;

  lines.forEach((raw, index) => {
    const number = index + 1;
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;
    if (line.startsWith('@')) {
      pendingTags.push(...tagsOf(line));
      inDescription = false;
      return;
    }
    if (line.startsWith('Feature:')) {
      feature.name = line.slice('Feature:'.length).trim();
      feature.tags = pendingTags;
      pendingTags = [];
      inDescription = true;
      return;
    }
    if (line.startsWith('Rule:')) {
      rule = line.slice('Rule:'.length).trim();
      ruleTags = pendingTags;
      pendingTags = [];
      current = null;
      examples = null;
      inDescription = true;
      return;
    }
    const scenario = line.match(SCENARIO_KEYWORDS);
    if (scenario) {
      current = {
        name: scenario[2],
        outline: scenario[1] === 'Scenario Outline' || scenario[1] === 'Scenario Template',
        tags: [...feature.tags, ...ruleTags, ...pendingTags],
        rule,
        line: number,
        steps: [],
        examples: [],
      };
      feature.scenarios.push(current);
      pendingTags = [];
      examples = null;
      inDescription = false;
      return;
    }
    if (line.startsWith('Examples:') || line.startsWith('Scenarios:')) {
      if (!current || !current.outline) throw parseError(path, number, 'Examples outside a Scenario Outline');
      examples = { header: null, rows: [] };
      current.examples.push(examples);
      pendingTags = [];
      return;
    }
    if (line.startsWith('|')) {
      if (!examples) throw parseError(path, number, 'a table is only supported under Examples');
      if (examples.header === null) examples.header = cellsOf(line);
      else examples.rows.push({ cells: cellsOf(line), line: number });
      return;
    }
    const step = line.match(STEP_KEYWORDS);
    if (step) {
      if (!current) throw parseError(path, number, 'a step outside a scenario');
      if (examples) throw parseError(path, number, 'a step after Examples');
      const previous = current.steps.at(-1);
      const keyword = step[1] === 'And' || step[1] === 'But' || step[1] === '*' ? previous?.keyword : step[1];
      if (!keyword) throw parseError(path, number, `"${step[1]}" cannot open a scenario`);
      current.steps.push({ keyword, text: step[2], line: number });
      return;
    }
    if (inDescription) return;
    throw parseError(path, number, `unrecognised line: ${line}`);
  });
  return feature;
}

function substitute(text, header, cells) {
  return header.reduce((out, column, i) => out.split(`<${column}>`).join(cells[i]), text);
}

export function expandScenarios(feature, path) {
  const expanded = [];
  for (const scenario of feature.scenarios) {
    if (scenario.steps.length === 0) throw new InstrumentError(`${path}:${scenario.line}: scenario "${scenario.name}" has no steps`);
    if (!scenario.outline) {
      expanded.push({ ...scenario });
      continue;
    }
    const rows = scenario.examples.flatMap((table) => table.rows.map((row) => ({ ...row, header: table.header })));
    if (rows.length === 0) throw new InstrumentError(`${path}:${scenario.line}: outline "${scenario.name}" has no example rows`);
    for (const row of rows) {
      if (row.cells.length !== row.header.length) throw new InstrumentError(`${path}:${row.line}: example row width differs from its header`);
      expanded.push({
        ...scenario,
        name: `${scenario.name} [${row.cells.join(' | ')}]`,
        line: row.line,
        steps: scenario.steps.map((step) => ({ ...step, text: substitute(step.text, row.header, row.cells) })),
      });
    }
  }
  return expanded;
}

function resolveStep(bindings, step) {
  const matches = [];
  for (const binding of bindings) {
    if (binding.keyword !== step.keyword) continue;
    const found = step.text.match(binding.pattern);
    if (found) matches.push({ binding, args: found.slice(1) });
  }
  return matches;
}

export function unboundSteps(scenarios, bindings) {
  const problems = [];
  for (const scenario of scenarios) {
    for (const step of scenario.steps) {
      const matches = resolveStep(bindings, step);
      if (matches.length === 0) problems.push(`line ${step.line}: no binding for "${step.keyword} ${step.text}"`);
      if (matches.length > 1) problems.push(`line ${step.line}: ${matches.length} bindings match "${step.keyword} ${step.text}"`);
    }
  }
  return problems;
}

function classify(error) {
  return UNSOUND.some((kind) => error instanceof kind) ? 'errored' : 'failed';
}

function describe(error) {
  return error instanceof Error ? error.message : String(error);
}

async function runScenario(scenario, bindings, createWorld) {
  let world;
  try {
    world = await createWorld(scenario);
  } catch (error) {
    return { outcome: 'errored', step: '(creating the scenario world)', message: describe(error) };
  }
  let verdict = { outcome: 'passed' };
  try {
    for (const step of scenario.steps) {
      const matches = resolveStep(bindings, step);
      if (matches.length !== 1) {
        verdict = { outcome: 'errored', step: `${step.keyword} ${step.text}`, message: `${matches.length} bindings match this step` };
        break;
      }
      try {
        await matches[0].binding.run(world, ...matches[0].args);
      } catch (error) {
        verdict = { outcome: classify(error), step: `${step.keyword} ${step.text}`, message: describe(error) };
        break;
      }
    }
  } finally {
    try {
      await world.close?.();
    } catch (error) {
      if (verdict.outcome === 'passed') verdict = { outcome: 'errored', step: '(closing the scenario world)', message: describe(error) };
    }
  }
  return verdict;
}

export async function runFeature({ featurePath, bindings, createWorld, select = () => true, out = process.stdout, concurrency = 1 }) {
  const counts = { passed: 0, failed: 0, errored: 0 };
  let scenarios;
  try {
    scenarios = expandScenarios(parseFeature(featurePath), featurePath).filter(select);
  } catch (error) {
    out.write(`ERROR the specification could not be read: ${describe(error)}\n`);
    counts.errored = 1;
    scenarios = [];
  }
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new InstrumentError(`concurrency must be a positive integer, not ${concurrency}`);
  const verdicts = new Array(scenarios.length);
  let printed = 0;
  const printInFeatureOrder = () => {
    for (; printed < scenarios.length && verdicts[printed]; printed += 1) {
      const scenario = scenarios[printed];
      const verdict = verdicts[printed];
      counts[verdict.outcome] += 1;
      const label = { passed: 'PASS', failed: 'FAIL', errored: 'ERROR' }[verdict.outcome];
      out.write(`${label} ${scenario.rule ? `${scenario.rule} > ` : ''}${scenario.name}\n`);
      if (verdict.outcome !== 'passed') out.write(`     at: ${verdict.step}\n     ${verdict.message}\n`);
    }
  };
  let next = 0;
  const worker = async () => {
    while (next < scenarios.length) {
      const index = next;
      next += 1;
      verdicts[index] = await runScenario(scenarios[index], bindings, createWorld);
      printInFeatureOrder();
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, scenarios.length) }, worker));
  out.write(`=== RESULTS: ${counts.passed} passed, ${counts.failed} failed, ${counts.errored} errored ===\n`);
  return counts;
}

export function Given(pattern, run) {
  return { keyword: 'Given', pattern, run };
}

export function When(pattern, run) {
  return { keyword: 'When', pattern, run };
}

export function Then(pattern, run) {
  return { keyword: 'Then', pattern, run };
}
