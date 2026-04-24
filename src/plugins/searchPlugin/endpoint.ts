import type { Endpoint } from 'payload'
import { backfillAll, reindexAll } from './hooks'
import { getUserRole } from '@payload-admin/access/roles'

/**
 * Admin-only endpoint that rebuilds the search_index for every non-system
 * collection. Triggered from the admin UI (or devtools) while logged in:
 *
 *   fetch('/api/reindex-search', { method: 'POST' }).then(r => r.json())
 *
 * Runs synchronously — returns counts per collection once finished.
 */
export const reindexSearchEndpoint: Endpoint = {
  path: '/reindex-search',
  method: 'post',
  handler: async (req) => {
    if (!req.user || getUserRole(req.user) !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
    const counts = await reindexAll(req.payload)
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    return Response.json({ success: true, total, byCollection: counts })
  },
}

/**
 * Admin-only endpoint that re-saves every doc in every non-system
 * collection, so beforeChange hooks re-run. Triggers afterChange too, so
 * the search index is repopulated as a side effect.
 *
 * One-off migration tool: run once after adopting a new derived field
 * (e.g. `localizedPaths` for search URL resolution) on a project where
 * existing docs predate the hook.
 *
 *   fetch('/api/backfill-search-urls', { method: 'POST' }).then(r => r.json())
 */
export const backfillSearchUrlsEndpoint: Endpoint = {
  path: '/backfill-search-urls',
  method: 'post',
  handler: async (req) => {
    if (!req.user || getUserRole(req.user) !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
    const counts = await backfillAll(req.payload)
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    return Response.json({ success: true, total, byCollection: counts })
  },
}
