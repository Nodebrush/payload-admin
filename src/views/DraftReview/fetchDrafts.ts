import 'server-only'
import type { Payload } from 'payload'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FieldDiff {
  path: string
  old: string
  new: string
  locale?: string // 'EN' | 'SV' — present only when the change is locale-specific
}

export interface ItemDiff {
  status: 'added' | 'removed' | 'changed'
  itemId: string
  arrayKey: string
  label: string
  blockType?: string
  fieldDiffs: FieldDiff[]
}

export interface DocumentDiff {
  fieldDiffs: FieldDiff[]
  itemDiffs: ItemDiff[]
  hasChanges: boolean
  changedFieldsSummary: string
}

export interface PendingDraft {
  type: 'collection' | 'global'
  collection?: string
  collectionLabel?: string
  globalSlug?: string
  globalLabel?: string
  parentId?: string
  documentTitle: string
  versionId: string
  updatedAt: string
  editUrl: string
  compareUrl: string
  isNew: boolean // true = document has never been published
  diff: DocumentDiff
}

// ─── Constants ───────────────────────────────────────────────────────────────

const COLLECTIONS = ['pages', 'blog', 'projects', 'menus'] as const

const GLOBALS = ['navbar', 'footer', 'company-info', 'blog-settings', 'contact-form'] as const

const COLLECTION_LABELS: Record<string, string> = {
  pages: 'Pages',
  blog: 'Blog',
  projects: 'Projects',
  menus: 'Menus',
}

const GLOBAL_LABELS: Record<string, string> = {
  navbar: 'Navbar',
  footer: 'Footer',
  'company-info': 'Company Info',
  'blog-settings': 'Blog Settings',
  'contact-form': 'Contact Form',
}

// Fields that carry no meaningful content for diffing
const SKIP_FIELDS = new Set([
  'id',
  '_status',
  'updatedAt',
  'createdAt',
  'localizedPaths',
  'sizes',
  'filename',
  'mimeType',
  'filesize',
  'width',
  'height',
  'focalX',
  'focalY',
  'author',
  'publishedAt',
  'populatedAuthors',
  'hash',
  'salt',
])

const LOCALES = ['en', 'sv'] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isLexical(val: unknown): val is { root: unknown } {
  return typeof val === 'object' && val !== null && !Array.isArray(val) && 'root' in val
}

function lexicalToText(json: unknown): string {
  if (!isLexical(json)) return ''
  const extract = (node: Record<string, unknown>): string => {
    if (node.type === 'text') return String(node.text ?? '')
    const children = node.children as Record<string, unknown>[] | undefined
    return children?.map(extract).join(' ') ?? ''
  }
  return extract(json.root as Record<string, unknown>)
    .replace(/\s+/g, ' ')
    .trim()
}

function valueToString(val: unknown): string {
  if (val === null || val === undefined) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  if (isLexical(val)) return lexicalToText(val)
  return ''
}

/** Resolves a value that might be a locale object { en, sv } or a plain string. */
function resolveString(val: unknown): string {
  if (typeof val === 'string') return val
  if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
    const obj = val as Record<string, unknown>
    // Locale object: { en: '...', sv: '...' }
    if ('en' in obj || 'sv' in obj) return String(obj.en ?? obj.sv ?? '')
  }
  return ''
}

function getItemLabel(item: Record<string, unknown>): string {
  return (
    resolveString(item.sectionHeading) ||
    resolveString(item.heading) ||
    resolveString(item.label) ||
    resolveString(item.name) ||
    resolveString(item.text) ||
    resolveString(item.title) ||
    String(item.blockType ?? 'Item')
  )
}

function getDocumentTitle(collection: string, doc: Record<string, unknown>): string {
  if (collection === 'menus') return resolveString(doc?.name) || 'Unnamed menu'
  return (
    resolveString(doc?.title) ||
    resolveString(doc?.name) ||
    resolveString(doc?.metaTitle) ||
    'Untitled'
  )
}

function buildSummary(fieldDiffs: FieldDiff[], itemDiffs: ItemDiff[]): string {
  const parts: string[] = []
  if (fieldDiffs.length > 0) parts.push(...[...new Set(fieldDiffs.map((d) => d.path.split('.')[0]))])
  if (itemDiffs.length > 0) parts.push(...[...new Set(itemDiffs.map((d) => d.arrayKey))])
  return [...new Set(parts)].join(', ')
}

// ─── Per-locale diff computation ──────────────────────────────────────────────

/**
 * Recursively compares scalar and nested fields between two objects.
 * Does NOT handle locale objects — call once per locale with plain data.
 */
function compareScalarFields(
  pub: Record<string, unknown>,
  draft: Record<string, unknown>,
  prefix: string,
): FieldDiff[] {
  const diffs: FieldDiff[] = []
  const allKeys = new Set([...Object.keys(pub), ...Object.keys(draft)])

  for (const key of allKeys) {
    if (SKIP_FIELDS.has(key)) continue
    const fieldPath = prefix ? `${prefix}.${key}` : key
    const pubVal = pub[key]
    const draftVal = draft[key]

    if (Array.isArray(pubVal) || Array.isArray(draftVal)) continue

    if (isLexical(pubVal) || isLexical(draftVal)) {
      const oldStr = lexicalToText(pubVal)
      const newStr = lexicalToText(draftVal)
      if (oldStr !== newStr) diffs.push({ path: fieldPath, old: oldStr, new: newStr })
      continue
    }

    if (typeof draftVal === 'object' && draftVal !== null) {
      diffs.push(...compareScalarFields((pubVal as Record<string, unknown>) ?? {}, draftVal as Record<string, unknown>, fieldPath))
      continue
    }
    if (typeof pubVal === 'object' && pubVal !== null) {
      diffs.push(...compareScalarFields(pubVal as Record<string, unknown>, (draftVal as Record<string, unknown>) ?? {}, fieldPath))
      continue
    }

    const oldStr = valueToString(pubVal)
    const newStr = valueToString(draftVal)
    if (oldStr !== newStr && (oldStr || newStr)) diffs.push({ path: fieldPath, old: oldStr, new: newStr })
  }

  return diffs
}

function compareIdArrays(
  pubArr: Record<string, unknown>[],
  draftArr: Record<string, unknown>[],
  arrayKey: string,
): ItemDiff[] {
  const diffs: ItemDiff[] = []
  const toObj = (i: unknown): i is Record<string, unknown> => typeof i === 'object' && i !== null
  const pubObjs = pubArr.filter(toObj)
  const draftObjs = draftArr.filter(toObj)
  const pubById = new Map(pubObjs.map((item) => [String(item.id), item]))
  const draftById = new Map(draftObjs.map((item) => [String(item.id), item]))

  for (const [id, item] of pubById) {
    if (!draftById.has(id)) {
      diffs.push({ status: 'removed', itemId: id, arrayKey, label: getItemLabel(item), blockType: item.blockType as string | undefined, fieldDiffs: [] })
    }
  }
  for (const [id, draftItem] of draftById) {
    const pubItem = pubById.get(id)
    if (!pubItem) {
      diffs.push({ status: 'added', itemId: id, arrayKey, label: getItemLabel(draftItem), blockType: draftItem.blockType as string | undefined, fieldDiffs: [] })
    } else {
      const fieldDiffs = compareScalarFields(pubItem, draftItem, '')
      if (fieldDiffs.length > 0) {
        diffs.push({ status: 'changed', itemId: id, arrayKey, label: getItemLabel(draftItem), blockType: draftItem.blockType as string | undefined, fieldDiffs })
      }
    }
  }

  return diffs
}

/** Computes a diff for a single locale's data. */
export function computeDiff(
  published: Record<string, unknown>,
  draft: Record<string, unknown>,
): DocumentDiff {
  const fieldDiffs: FieldDiff[] = []
  const itemDiffs: ItemDiff[] = []
  const allKeys = new Set([...Object.keys(published), ...Object.keys(draft)])

  for (const key of allKeys) {
    if (SKIP_FIELDS.has(key)) continue
    const pubVal = published[key]
    const draftVal = draft[key]

    if (Array.isArray(pubVal) || Array.isArray(draftVal)) {
      const pubArr = Array.isArray(pubVal) ? (pubVal as Record<string, unknown>[]) : []
      const draftArr = Array.isArray(draftVal) ? (draftVal as Record<string, unknown>[]) : []
      const toObj = (i: unknown): i is Record<string, unknown> => typeof i === 'object' && i !== null
      const hasIds = pubArr.some((i) => toObj(i) && 'id' in i) || draftArr.some((i) => toObj(i) && 'id' in i)
      if (hasIds) itemDiffs.push(...compareIdArrays(pubArr, draftArr, key))
      // Primitive arrays (tag IDs etc.) — skip, not text content
      continue
    }

    if (isLexical(pubVal) || isLexical(draftVal)) {
      const oldStr = lexicalToText(pubVal)
      const newStr = lexicalToText(draftVal)
      if (oldStr !== newStr) fieldDiffs.push({ path: key, old: oldStr, new: newStr })
      continue
    }

    if (typeof draftVal === 'object' && draftVal !== null) {
      fieldDiffs.push(...compareScalarFields((pubVal as Record<string, unknown>) ?? {}, draftVal as Record<string, unknown>, key))
      continue
    }
    if (typeof pubVal === 'object' && pubVal !== null) {
      fieldDiffs.push(...compareScalarFields(pubVal as Record<string, unknown>, (draftVal as Record<string, unknown>) ?? {}, key))
      continue
    }

    const oldStr = valueToString(pubVal)
    const newStr = valueToString(draftVal)
    if (oldStr !== newStr && (oldStr || newStr)) fieldDiffs.push({ path: key, old: oldStr, new: newStr })
  }

  const hasChanges = fieldDiffs.length > 0 || itemDiffs.length > 0
  return { fieldDiffs, itemDiffs, hasChanges, changedFieldsSummary: buildSummary(fieldDiffs, itemDiffs) }
}

// ─── Merge diffs from two locales ────────────────────────────────────────────

/**
 * Merges EN and SV diffs into one DocumentDiff.
 * Fields changed identically in both locales → shown once (no locale tag, non-localized field).
 * Fields changed differently per locale → shown with EN / SV badge.
 * Sections added/removed → deduplicated (structural, not locale-specific).
 * Sections changed → field diffs merged with locale tags.
 */
function mergeDiffs(enDiff: DocumentDiff, svDiff: DocumentDiff): DocumentDiff {
  // ── Top-level field diffs ────────────────────────────────────────────────
  const fieldDiffs: FieldDiff[] = []
  const enFieldsByPath = new Map(enDiff.fieldDiffs.map((d) => [d.path, d]))
  const svFieldsByPath = new Map(svDiff.fieldDiffs.map((d) => [d.path, d]))
  const allFieldPaths = new Set([...enFieldsByPath.keys(), ...svFieldsByPath.keys()])

  for (const path of allFieldPaths) {
    const enF = enFieldsByPath.get(path)
    const svF = svFieldsByPath.get(path)
    if (enF && svF && enF.old === svF.old && enF.new === svF.new) {
      // Identical change in both locales → non-localized field, no tag
      fieldDiffs.push(enF)
    } else {
      if (enF) fieldDiffs.push({ ...enF, locale: 'EN' })
      if (svF) fieldDiffs.push({ ...svF, locale: 'SV' })
    }
  }

  // ── Item diffs (sections, menu items, etc.) ──────────────────────────────
  const itemDiffs: ItemDiff[] = []
  const enItemsById = new Map(enDiff.itemDiffs.map((d) => [d.itemId, d]))
  const svItemsById = new Map(svDiff.itemDiffs.map((d) => [d.itemId, d]))
  const allItemIds = new Set([...enItemsById.keys(), ...svItemsById.keys()])

  for (const id of allItemIds) {
    const enItem = enItemsById.get(id)
    const svItem = svItemsById.get(id)

    // Added / removed: structural change, same in both locales → deduplicate
    if (enItem?.status !== 'changed' || svItem?.status !== 'changed') {
      if (enItem && svItem && enItem.status === svItem.status) {
        // Both agree (both added or both removed) — show once
        itemDiffs.push(enItem)
      } else {
        // Only in one locale (unusual), or mixed statuses — show both
        if (enItem) itemDiffs.push(enItem)
        if (svItem && svItem !== enItem) itemDiffs.push(svItem)
      }
      continue
    }

    // Both changed → merge their field diffs with locale tags
    const mergedFieldDiffs: FieldDiff[] = []
    const enFByPath = new Map(enItem.fieldDiffs.map((d) => [d.path, d]))
    const svFByPath = new Map(svItem.fieldDiffs.map((d) => [d.path, d]))
    const allPaths = new Set([...enFByPath.keys(), ...svFByPath.keys()])

    for (const path of allPaths) {
      const enF = enFByPath.get(path)
      const svF = svFByPath.get(path)
      if (enF && svF && enF.old === svF.old && enF.new === svF.new) {
        mergedFieldDiffs.push(enF) // Same in both → no locale tag
      } else {
        if (enF) mergedFieldDiffs.push({ ...enF, locale: 'EN' })
        if (svF) mergedFieldDiffs.push({ ...svF, locale: 'SV' })
      }
    }

    if (mergedFieldDiffs.length > 0) {
      itemDiffs.push({ ...enItem, fieldDiffs: mergedFieldDiffs })
    }
  }

  const hasChanges = fieldDiffs.length > 0 || itemDiffs.length > 0
  return { fieldDiffs, itemDiffs, hasChanges, changedFieldsSummary: buildSummary(fieldDiffs, itemDiffs) }
}

// ─── Per-document fetch helpers ───────────────────────────────────────────────

async function fetchDocumentDiff(
  payload: Payload,
  collection: string,
  parentId: string,
): Promise<{ diff: DocumentDiff; isNew: boolean }> {
  // Fetch both locales for draft AND published in parallel — 4 calls, all at once.
  // findByID(draft:true) returns the CURRENT accumulated draft state (all saves merged),
  // not just the last version snapshot. This ensures all changes from all sessions appear.
  const [draftEnR, draftSvR, pubEnR, pubSvR] = await Promise.allSettled([
    (payload.findByID as any)({ collection, id: parentId, draft: true,  locale: 'en', depth: 0, overrideAccess: true }),
    (payload.findByID as any)({ collection, id: parentId, draft: true,  locale: 'sv', depth: 0, overrideAccess: true }),
    (payload.findByID as any)({ collection, id: parentId, draft: false, locale: 'en', depth: 0, overrideAccess: true }),
    (payload.findByID as any)({ collection, id: parentId, draft: false, locale: 'sv', depth: 0, overrideAccess: true }),
  ])

  const draftEn  = draftEnR.status === 'fulfilled' ? draftEnR.value as Record<string, unknown> : {}
  const draftSv  = draftSvR.status === 'fulfilled' ? draftSvR.value as Record<string, unknown> : {}
  const pubEnRaw = pubEnR.status   === 'fulfilled' ? pubEnR.value   as Record<string, unknown> : {}
  const pubSvRaw = pubSvR.status   === 'fulfilled' ? pubSvR.value   as Record<string, unknown> : {}

  // A document is "new" if Payload never published it. In that case, findByID(draft:false)
  // either throws (rejected) or returns the document with _status:'draft' as a fallback.
  // Use {} as the published baseline so all content shows as new rather than unchanged.
  const isNew =
    pubEnR.status === 'rejected' ||
    (pubEnRaw._status !== undefined && pubEnRaw._status !== 'published')

  const pubEn = isNew ? {} : pubEnRaw
  const pubSv = isNew ? {} : pubSvRaw

  const diff = mergeDiffs(computeDiff(pubEn, draftEn), computeDiff(pubSv, draftSv))
  return { diff, isNew }
}

async function fetchGlobalDiff(
  payload: Payload,
  slug: string,
): Promise<{ diff: DocumentDiff; isNew: boolean }> {
  const [draftEnR, draftSvR, pubEnR, pubSvR] = await Promise.allSettled([
    (payload.findGlobal as any)({ slug, draft: true,  locale: 'en', depth: 0, overrideAccess: true }),
    (payload.findGlobal as any)({ slug, draft: true,  locale: 'sv', depth: 0, overrideAccess: true }),
    (payload.findGlobal as any)({ slug, draft: false, locale: 'en', depth: 0, overrideAccess: true }),
    (payload.findGlobal as any)({ slug, draft: false, locale: 'sv', depth: 0, overrideAccess: true }),
  ])

  const draftEn  = draftEnR.status === 'fulfilled' ? draftEnR.value as Record<string, unknown> : {}
  const draftSv  = draftSvR.status === 'fulfilled' ? draftSvR.value as Record<string, unknown> : {}
  const pubEnRaw = pubEnR.status   === 'fulfilled' ? pubEnR.value   as Record<string, unknown> : {}
  const pubSvRaw = pubSvR.status   === 'fulfilled' ? pubSvR.value   as Record<string, unknown> : {}

  const isNew =
    pubEnR.status === 'rejected' ||
    (pubEnRaw._status !== undefined && pubEnRaw._status !== 'published')

  const pubEn = isNew ? {} : pubEnRaw
  const pubSv = isNew ? {} : pubSvRaw

  const diff = mergeDiffs(computeDiff(pubEn, draftEn), computeDiff(pubSv, draftSv))
  return { diff, isNew }
}

// ─── Main fetch function ──────────────────────────────────────────────────────

export async function fetchAllPendingDrafts(payload: Payload): Promise<PendingDraft[]> {
  const pending: PendingDraft[] = []

  // ── Collections ──────────────────────────────────────────────────────────

  for (const collection of COLLECTIONS) {
    try {
      // Get all recent versions to find the true latest per document.
      // No status filter — we check _status ourselves after deduplication.
      const versions = await payload.findVersions({
        collection,
        sort: '-updatedAt',
        limit: 500,
        depth: 0,
        overrideAccess: true,
      })

      // Collect pending parent IDs (latest version per doc must be a draft)
      const pendingParents: Array<{ parentId: string; versionId: string; updatedAt: string }> = []
      const seenParents = new Set<string>()

      for (const v of versions.docs) {
        const parentId = String(v.parent)
        if (seenParents.has(parentId)) continue
        seenParents.add(parentId)
        const latestData = v.version as Record<string, unknown>
        if (latestData._status !== 'draft') continue
        pendingParents.push({ parentId, versionId: String(v.id), updatedAt: String(v.updatedAt) })
      }

      // Fetch diffs for all pending documents in parallel
      const results = await Promise.allSettled(
        pendingParents.map(async ({ parentId, versionId, updatedAt }) => {
          const { diff, isNew } = await fetchDocumentDiff(payload, collection, parentId)
          if (!diff.hasChanges) return null

          // Fetch title in EN for display
          let title = 'Untitled'
          try {
            const doc = await (payload.findByID as any)({ collection, id: parentId, draft: true, locale: 'en', depth: 0, overrideAccess: true })
            title = getDocumentTitle(collection, doc as Record<string, unknown>)
          } catch { /* use default */ }

          return {
            type: 'collection' as const,
            collection,
            collectionLabel: COLLECTION_LABELS[collection] ?? collection,
            parentId,
            documentTitle: title,
            versionId,
            updatedAt,
            editUrl: `/admin/collections/${collection}/${parentId}`,
            compareUrl: `/admin/collections/${collection}/${parentId}/versions`,
            isNew,
            diff,
          } satisfies PendingDraft
        }),
      )

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) pending.push(r.value)
      }
    } catch (err) {
      console.error(`[DraftReview] Failed to fetch drafts for collection "${collection}":`, err)
    }
  }

  // ── Globals ───────────────────────────────────────────────────────────────

  await Promise.allSettled(
    GLOBALS.map(async (slug) => {
      try {
        const versions = await payload.findGlobalVersions({
          slug,
          sort: '-updatedAt',
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })

        if (versions.docs.length === 0) return
        const v = versions.docs[0]
        const latestData = v.version as Record<string, unknown>
        if (latestData._status !== 'draft') return

        const { diff, isNew } = await fetchGlobalDiff(payload, slug)
        if (!diff.hasChanges) return

        pending.push({
          type: 'global',
          globalSlug: slug,
          globalLabel: GLOBAL_LABELS[slug] ?? slug,
          documentTitle: GLOBAL_LABELS[slug] ?? slug,
          versionId: String(v.id),
          updatedAt: String(v.updatedAt),
          editUrl: `/admin/globals/${slug}`,
          compareUrl: `/admin/globals/${slug}/versions`,
          isNew,
          diff,
        })
      } catch (err) {
        console.error(`[DraftReview] Failed to fetch drafts for global "${slug}":`, err)
      }
    }),
  )

  return pending
}
