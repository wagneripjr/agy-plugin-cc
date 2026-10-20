//status: Draft
// sdlc-proves: FR-001
import { join } from 'node:path';

import { runFeature } from './lib/feature-runner.mjs';
import { DelegationDsl, PluginSourceDsl, REPO_ROOT } from './lib/fr001-dsl.mjs';
import { delegationSteps, pluginSourceSteps } from './lib/fr001-steps.mjs';

const counts = await runFeature({
  featurePath: join(REPO_ROOT, 'ci', 'features', 'FR-001-agy-delegation.feature'),
  bindings: [...delegationSteps, ...pluginSourceSteps],
  createWorld: (scenario) => (scenario.tags.includes('@static') ? PluginSourceDsl.create() : DelegationDsl.create()),
});
process.exitCode = counts.failed + counts.errored === 0 ? 0 : 1;
