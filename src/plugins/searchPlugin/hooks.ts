import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  Payload,
} from 'payload'
import { extractText, resolveUrl } from './extract'
import { ensureSearchSchema } from './setup'

/**
 * Collections that should never be indexed — authentication, system state,
 * uploads, and app-internal data.
 */
export const SYSTEM_COLLECTIONS = new Set([
  'users',
  'media',
  'payload-preferences',
  'payload-migrations',
  'content-review-notes',
  'messages',
])

function getLocaleCodes(payload: Payload): string[] {
  const loc = payload.config.localization
  if (loc && loc.locales.length > 0) {
    return loc.locales.map((l) => l.code)
  }
  return ['en']
}

function isLocalizedProject(payload: Payload): boolean {
  const loc = payload.config.localization
  return !!loc && Array.isArray(loc.locales) && loc.locales.length > 0
}

async function writeIndexRows(
  payload: Payload,
  collection: string,
  docId: string | number,
): Promise<void> {
  await ensureSearchSchema(payload)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pool = (payload.db as any).pool

  const localeCodes = getLocaleCodes(payload)
  const prefixLocale = isLocalizedProject(payload)

  // Re-fetch with locale:'all' so we see the full locale map for localized fields.
  let fullDoc: Record<string, unknown> | null = null
  try {
    fullDoc = (await (payload.findByID as unknown as (args: unknown) => Promise<unknown>)({
      collection,
      id: docId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      locale: 'all' as any,
      depth: 0,
      draft: false,
      overrideAccess: true,
    })) as Record<string, unknown>
  } catch {
    // Not published yet (or deleted between hook and fetch) — remove any
    // stale rows and exit.
    await pool.query(
      `DELETE FROM search.search_index WHERE collection = $1 AND doc_id = $2`,
      [collection, String(docId)],
    )
    return
  }

  if (!fullDoc) return

  const { perLocale, title } = extractText(fullDoc, localeCodes)

  const upsert = `
    INSERT INTO search.search_index (collection, doc_id, locale, title, url, raw_text, tsv, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, to_tsvector('simple', $6), NOW())
    ON CONFLICT (collection, doc_id, locale) DO UPDATE SET
      title = EXCLUDED.title,
      url = EXCLUDED.url,
      raw_text = EXCLUDED.raw_text,
      tsv = EXCLUDED.tsv,
      updated_at = NOW()
  `

  for (const locale of localeCodes) {
    const rawText = perLocale[locale] ?? ''
    const url = resolveUrl(collection, fullDoc, locale, { prefixLocale })
    // Skip any doc that can't be navigated to — no URL, no place for the
    // user to land. This cleanly excludes tags, menus, and any other
    // non-routable collections without hardcoding slugs.
    if (!rawText || !url) {
      await pool.query(
        `DELETE FROM search.search_index WHERE collection = $1 AND doc_id = $2 AND locale = $3`,
        [collection, String(docId), locale],
      )
      continue
    }
    await pool.query(upsert, [
      collection,
      String(docId),
      locale,
      title[locale] || null,
      url,
      rawText,
    ])
  }
}

async function removeIndexRows(
  payload: Payload,
  collection: string,
  docId: string | number,
): Promise<void> {
  await ensureSearchSchema(payload)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pool = (payload.db as any).pool
  await pool.query(
    `DELETE FROM search.search_index WHERE collection = $1 AND doc_id = $2`,
    [collection, String(docId)],
  )
}

export const createAfterChangeHook =
  (collection: string): CollectionAfterChangeHook =>
  async ({ doc, req }) => {
    try {
      const id = (doc as { id?: string | number }).id
      if (id === undefined || id === null) return doc
      // Don't block the write — run async but catch errors.
      void writeIndexRows(req.payload, collection, id).catch((err) => {
        req.payload.logger.error(`[search] index update failed for ${collection}/${id}: ${String(err)}`)
      })
    } catch (err) {
      req.payload.logger.error(`[search] afterChange hook error: ${String(err)}`)
    }
    return doc
  }

export const createAfterDeleteHook =
  (collection: string): CollectionAfterDeleteHook =>
  async ({ doc, req }) => {
    try {
      const id = (doc as { id?: string | number } | null | undefined)?.id
      if (id === undefined || id === null) return doc
      void removeIndexRows(req.payload, collection, id).catch((err) => {
        req.payload.logger.error(`[search] index delete failed for ${collection}/${id}: ${String(err)}`)
      })
    } catch (err) {
      req.payload.logger.error(`[search] afterDelete hook error: ${String(err)}`)
    }
    return doc
  }

/**
 * Re-saves every doc in every non-system collection so beforeChange hooks
 * re-run against the current schema. Useful after a project adopts new
 * beforeChange-derived fields (e.g. `localizedPaths` for search URL
 * resolution) and existing docs predate the hook.
 *
 * The update payload carries back the doc's existing fields — including
 * `_status` — so published rows stay published and drafts stay drafts.
 * Relationships stay as IDs because we fetch with depth:0.
 *
 * Triggers afterChange hooks too, so the search index is repopulated as a
 * side effect. Returns count per collection.
 */
export async function backfillAll(payload: Payload): Promise<Record<string, number>> {
  await ensureSearchSchema(payload)

  const counts: Record<string, number> = {}
  const collections = payload.config.collections.filter(
    (c) => !SYSTEM_COLLECTIONS.has(c.slug),
  )

  for (const coll of collections) {
    let page = 1
    let count = 0
    while (true) {
      const batch = await payload.find({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        collection: coll.slug as any,
        depth: 0,
        limit: 100,
        page,
        overrideAccess: true,
      })
      for (const d of batch.docs) {
        const id = (d as { id?: string | number }).id
        if (id === undefined || id === null) continue
        try {
          const data = { ...(d as Record<string, unknown>) }
          delete data.id
          delete data.createdAt
          delete data.updatedAt
          await payload.update({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            collection: coll.slug as any,
            id,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: data as any,
            overrideAccess: true,
          })
          count++
        } catch (err) {
          payload.logger.error(
            `[search] backfill failed for ${coll.slug}/${id}: ${String(err)}`,
          )
        }
      }
      if (!batch.hasNextPage) break
      page++
    }
    counts[coll.slug] = count
  }

  return counts
}

/**
 * Full rebuild: wipes and re-indexes every non-system collection.
 * Returns count per collection.
 */
export async function reindexAll(payload: Payload): Promise<Record<string, number>> {
  await ensureSearchSchema(payload)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pool = (payload.db as any).pool
  await pool.query(`TRUNCATE search.search_index RESTART IDENTITY`)

  const counts: Record<string, number> = {}
  const collections = payload.config.collections.filter(
    (c) => !SYSTEM_COLLECTIONS.has(c.slug),
  )

  for (const coll of collections) {
    let page = 1
    let count = 0
    while (true) {
      const batch = await payload.find({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        collection: coll.slug as any,
        depth: 0,
        limit: 100,
        page,
        overrideAccess: true,
      })
      for (const d of batch.docs) {
        const id = (d as { id?: string | number }).id
        if (id === undefined || id === null) continue
        try {
          await writeIndexRows(payload, coll.slug, id)
          count++
        } catch (err) {
          payload.logger.error(
            `[search] reindex failed for ${coll.slug}/${id}: ${String(err)}`,
          )
        }
      }
      if (!batch.hasNextPage) break
      page++
    }
    counts[coll.slug] = count
  }

  return counts
}
