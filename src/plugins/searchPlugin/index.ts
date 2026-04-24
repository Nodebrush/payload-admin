import type { Config, Plugin } from 'payload'
import {
  createAfterChangeHook,
  createAfterDeleteHook,
  SYSTEM_COLLECTIONS,
} from './hooks'
import { backfillSearchUrlsEndpoint, reindexSearchEndpoint } from './endpoint'

/**
 * Payload plugin that owns the full-text search index:
 *  - Attaches afterChange + afterDelete hooks to every non-system collection
 *    so writes propagate into search.search_index.
 *  - Registers POST /api/reindex-search for full rebuilds.
 *  - Registers POST /api/backfill-search-urls for the one-off "re-save
 *    every doc so beforeChange hooks re-run" migration (used after
 *    adopting a new derived field like localizedPaths).
 *
 * The schema is created lazily on first write (ensureSearchSchema), so a
 * fresh project gets the table as soon as any content is saved. Frontends
 * read the table directly and assume it exists — if it doesn't, the project
 * was set up wrong (admin never ran).
 *
 * Disable per-project by passing { search: false } to payloadAdminPlugin().
 */
export const searchPlugin = (): Plugin => (incomingConfig: Config): Config => {
  const collections = incomingConfig.collections?.map((coll) => {
    if (SYSTEM_COLLECTIONS.has(coll.slug)) return coll
    return {
      ...coll,
      hooks: {
        ...coll.hooks,
        afterChange: [
          ...(coll.hooks?.afterChange ?? []),
          createAfterChangeHook(coll.slug),
        ],
        afterDelete: [
          ...(coll.hooks?.afterDelete ?? []),
          createAfterDeleteHook(coll.slug),
        ],
      },
    }
  })

  return {
    ...incomingConfig,
    collections,
    endpoints: [
      ...(incomingConfig.endpoints ?? []),
      reindexSearchEndpoint,
      backfillSearchUrlsEndpoint,
    ],
  }
}
