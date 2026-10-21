//status: Draft
// sdlc-proves: FR-001
// sdlc-proves: BUG-001
import { join } from 'node:path';

import { runFeature } from './lib/feature-runner.mjs';
import { DelegationDsl, PluginSourceDsl, REPO_ROOT, closeSharedRuns } from './lib/fr001-dsl.mjs';
import { delegationSteps, pluginSourceSteps } from './lib/fr001-steps.mjs';

const CONCURRENCY = Number(process.env.FR001_SCENARIO_CONCURRENCY ?? 8);

try {
  const counts = await runFeature({
    featurePath: join(REPO_ROOT, 'ci', 'features', 'FR-001-agy-delegation.feature'),
    bindings: [...delegationSteps, ...pluginSourceSteps],
    createWorld: (scenario) => (scenario.tags.includes('@static')
      ? PluginSourceDsl.create()
      : DelegationDsl.create({ sharesRuns: scenario.tags.includes('@shared-run') })),
    concurrency: CONCURRENCY,
  });
  process.exitCode = counts.failed + counts.errored === 0 ? 0 : 1;
} finally {
  await closeSharedRuns();
}
