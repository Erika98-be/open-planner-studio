// Testcontract voor de optionele MPP-corpora; geen pad- of scopekeuze in de productlezer.
import { join } from 'node:path';

const DEFAULT_CRAWL_ROOT = '/home/nozzit/open-aec/voor claude/testdata-crawl';

/** OPS_MPP_CRAWL is de brede root; de rooktestset is apart instelbaar.
 *  Geen detectie op mapnaam of bestaan: een override kiest altijd precies die scope.
 *  Migratie van oude crawl-mpp-overrides: zie tests/planning/README.md. */
export function resolveMppCrawlScopes(env: Readonly<Record<string, string | undefined>>): {
  root: string;
  smoke: string;
} {
  const root = env.OPS_MPP_CRAWL ?? DEFAULT_CRAWL_ROOT;
  return { root, smoke: env.OPS_MPP_CRAWL_SMOKE ?? join(root, 'crawl-mpp') };
}
