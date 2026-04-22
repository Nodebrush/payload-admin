import type { Endpoint } from 'payload'
import { reindexAll } from './hooks'
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
