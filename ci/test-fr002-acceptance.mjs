//status: Draft
// sdlc-proves: FR-002
import { join } from 'node:path';

import { runFeature } from './lib/feature-runner.mjs';
import { ListingDsl, REPO_ROOT } from './lib/fr002-dsl.mjs';
import { listingSteps } from './lib/fr002-steps.mjs';

const CONCURRENCY = Number(process.env.FR002_SCENARIO_CONCURRENCY ?? 8);
const ONLY_TAG = process.env.FR002_ONLY_TAG;

const counts = await runFeature({
  featurePath: join(REPO_ROOT, 'ci', 'features', 'FR-002-list-and-latest-jobs.feature'),
  bindings: listingSteps,
  createWorld: () => ListingDsl.create(),
  select: (scenario) => !ONLY_TAG || scenario.tags.includes(ONLY_TAG),
  concurrency: CONCURRENCY,
});
process.exitCode = counts.failed + counts.errored === 0 ? 0 : 1;
