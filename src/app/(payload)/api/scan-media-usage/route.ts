import { getPayload } from 'payload'
import config from '@payload-config'
import { payloadConfigBase } from '@payload-config/payload-base.config'
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { getUserRole } from '@payload-admin/access/roles'

type UsageEntry = {
  collection: string
  docId: number
  docTitle: string
  path: string
  count: number
}

/**
 * Recursively count all occurrences of populated media documents.
 * A populated media doc is identified by having both `id` (number) and `filename` (string).
 * Uses a Map so the same media item used N times on one page counts N times.
 */
function countMediaOccurrences(value: unknown, counts: Map<number, number>): void {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const item of value) countMediaOccurrences(item, counts)
    return
  }
  const obj = value as Record<string, unknown>
  if (typeof obj.id === 'number' && typeof obj.filename === 'string') {
    counts.set(obj.id, (counts.get(obj.id) ?? 0) + 1)
    return // no need to recurse further into the media doc itself
  }
  for (const v of Object.values(obj)) countMediaOccurrences(v, counts)
}

/**
 * Extract a readable title from a document, handling localized fields
 * (with locale:'all', localized text fields come back as { en: "...", sv: "..." }).
 */
function extractTitle(doc: Record<string, unknown>, titleField: string): string {
  const raw = doc[titleField] ?? doc.name ?? doc.id
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    const localized = raw as Record<string, unknown>
    return String(localized.en ?? Object.values(localized)[0] ?? doc.id)
  }
  return String(raw ?? doc.id)
}

async function scanCollection(
  payload: Awaited<ReturnType<typeof getPayload>>,
  slug: string,
  getTitle: (doc: Record<string, unknown>) => string,
  getPath: (doc: Record<string, unknown>) => string,
  usageMap: Map<number, UsageEntry[]>,
) {
  let page = 1
  while (true) {
    const batch = await payload.find({
      collection: slug as 'pages',
      depth: 3,
      limit: 50,
      page,
      locale: 'all' as 'en',
      draft: true,
    })
    for (const doc of batch.docs) {
      const occurrences = new Map<number, number>()
      countMediaOccurrences(doc, occurrences)
      for (const [mediaId, count] of occurrences) {
        if (!usageMap.has(mediaId)) usageMap.set(mediaId, [])
        usageMap.get(mediaId)!.push({
          collection: slug,
          docId: doc.id as number,
          docTitle: getTitle(doc as Record<string, unknown>),
          path: getPath(doc as Record<string, unknown>),
          count,
        })
      }
    }
    if (!batch.hasNextPage) break
    page++
  }
}

export async function POST() {
  try {
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: await headers() })
    if (!user || getUserRole(user) !== 'admin') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 })
    }
    const usageMap = new Map<number, UsageEntry[]>()

    // Scan all collections from the shared config (skip media itself)
    const collectionsToScan = (payloadConfigBase.collections ?? []).filter(
      (c) => c.slug !== 'media',
    )

    for (const collectionConfig of collectionsToScan) {
      const titleField = collectionConfig.admin?.useAsTitle ?? 'name'
      await scanCollection(
        payload,
        collectionConfig.slug,
        (doc) => extractTitle(doc, titleField),
        (doc) => {
          const paths = doc.localizedPaths as Record<string, string> | undefined
          return paths?.en ?? `/${collectionConfig.slug}`
        },
        usageMap,
      )
    }

    // Scan all globals from the shared config
    for (const globalConfig of payloadConfigBase.globals ?? []) {
      try {
        const globalDoc = await payload.findGlobal({ slug: globalConfig.slug as 'navbar', depth: 3 })
        const occurrences = new Map<number, number>()
        countMediaOccurrences(globalDoc, occurrences)
        for (const [mediaId, count] of occurrences) {
          if (!usageMap.has(mediaId)) usageMap.set(mediaId, [])
          usageMap.get(mediaId)!.push({
            collection: 'globals',
            docId: 0,
            docTitle: globalConfig.slug,
            path: `global:${globalConfig.slug}`,
            count,
          })
        }
      } catch {
        // Skip globals that haven't been saved yet
      }
    }

    // Update every media document with its usage data
    let page = 1
    let updated = 0
    while (true) {
      const batch = await payload.find({ collection: 'media', depth: 0, limit: 100, page })
      for (const media of batch.docs) {
        const mediaId = media.id as number
        const usages = usageMap.get(mediaId) ?? []
        const totalCount = usages.reduce((sum, e) => sum + e.count, 0)
        await payload.update({
          collection: 'media',
          id: mediaId,
          data: {
            usageCount: totalCount,
            usedIn: usages,
          } as any,
          overrideAccess: true,
          context: { bypassHooks: true },
        })
        updated++
      }
      if (!batch.hasNextPage) break
      page++
    }

    const totalUsages = [...usageMap.values()].reduce(
      (sum, entries) => sum + entries.reduce((s, e) => s + e.count, 0),
      0,
    )

    return NextResponse.json({ success: true, updated, totalUsages })
  } catch (err) {
    console.error('[scan-media-usage]', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
