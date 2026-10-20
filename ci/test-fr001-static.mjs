//status: Draft
// sdlc-proves: FR-001
import { join } from 'node:path';

import { runFeature } from './lib/feature-runner.mjs';
import { PluginSourceDsl, REPO_ROOT } from './lib/fr001-dsl.mjs';
import { pluginSourceSteps } from './lib/fr001-steps.mjs';

const counts = await runFeature({
  featurePath: join(REPO_ROOT, 'ci', 'features', 'FR-001-agy-delegation.feature'),
  bindings: pluginSourceSteps,
  createWorld: () => PluginSourceDsl.create(),
  select: (scenario) => scenario.tags.includes('@static'),
});
process.exitCode = counts.failed + counts.errored === 0 ? 0 : 1;
