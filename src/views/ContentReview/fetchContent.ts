import 'server-only'
import type { Payload } from 'payload'
import { lexicalToMarkdown } from './lexicalMarkdown'

export interface ContentField {
  path: string
  values: Record<string, string> // locale code -> extracted text (plain, for display)
  isMissing: boolean  // red: translation gap or required+empty
  isWarning: boolean  // yellow: equal content across locales, or missing meta image
  warningNote?: string // short explanation for yellow rows
  singleValue?: string // for non-localized JSON fields like localizedPaths — render as single cell
  isLocalized: boolean // true only when extracted from a { en: ..., sv: ... } locale object
  fieldType: 'text' | 'richText'
  editValues?: Record<string, string> // markdown representation for richText fields
}

export interface ContentDocument {
  type: 'collection' | 'global'
  collection?: string
  collectionLabel?: string
  globalSlug?: string
  globalLabel?: string
  documentId?: string | number
  documentTitle: string
  editUrl: string
  fields: ContentField[]
  /** Stable key used for review notes: "collection:id" or "global:slug" */
  docKey: string
  /** ISO string — the doc's updatedAt at fetch time */
  docUpdatedAt: string
}

export interface ReviewNote {
  key: string
  /** ISO string — the doc's updatedAt when it was last marked reviewed */
  docUpdatedAt: string
}

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
  // 'url' intentionally NOT here — cta.url and nav urls are real content fields.
  // Media collection is excluded via SYSTEM_SLUGS; depth:0 prevents media object expansion.
  'thumbnailURL',
  'usageCount',
  'usedIn',
  'blockType',
])

const SYSTEM_SLUGS = new Set(['users', 'media', 'payload-preferences', 'payload-migrations'])

// Fields where identical content across locales is expected and not worth warning about
const EQUAL_CONTENT_OK = new Set([
  'slug',
  'sectionId',
  'publishDate',
  'path',
])

function isLexical(val: unknown): val is { root: unknown } {
  return typeof val === 'object' && val !== null && !Array.isArray(val) && 'root' in val
}

function lexicalToText(json: unknown): string {
  if (!isLexical(json)) return ''

  function extractInline(node: Record<string, unknown>): string {
    if (node.type === 'text') return String(node.text ?? '')
    const children = node.children as Record<string, unknown>[] | undefined
    return children?.map(extractInline).join('') ?? ''
  }

  function extractBlock(node: Record<string, unknown>): string {
    if (node.type === 'text') return String(node.text ?? '')
    const children = node.children as Record<string, unknown>[] | undefined
    if (!children) return ''
    const type = node.type as string
    if (type === 'root') {
      return children
        .map(extractBlock)
        .filter((s) => s.trim())
        .join('\n\n')
    }
    if (type === 'list') {
      return children
        .map(extractBlock)
        .filter((s) => s.trim())
        .join('\n')
    }
    return children.map(extractInline).join('')
  }

  return extractBlock(json.root as Record<string, unknown>)
    .replace(/[ \t]+/g, ' ')
    .replace(/ \n/g, '\n')
    .replace(/\n /g, '\n')
    .trim()
}

function isLocaleObject(val: unknown, localeCodes: string[]): val is Record<string, unknown> {
  if (typeof val !== 'object' || val === null || Array.isArray(val)) return false
  if (isLexical(val)) return false
  const keys = Object.keys(val as object)
  if (keys.length === 0) return false
  return keys.every((k) => localeCodes.includes(k))
}

function isMediaRef(val: unknown): boolean {
  if (typeof val !== 'object' || val === null || Array.isArray(val)) return false
  const obj = val as Record<string, unknown>
  return typeof obj.id === 'number' && typeof obj.filename === 'string'
}

/** Returns the leaf key of a dot-path, e.g. "sections[0].cta.url" → "url" */
function leafKey(path: string): string {
  const dot = path.lastIndexOf('.')
  const bracket = path.lastIndexOf('[')
  const cut = Math.max(dot, bracket)
  return cut === -1 ? path : path.slice(cut + 1).replace(/]$/, '')
}

function extractFields(
  value: unknown,
  key: string,
  path: string,
  localeCodes: string[],
  fields: ContentField[],
): void {
  if (SKIP_FIELDS.has(key)) return
  if (value === null || value === undefined) return

  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      extractFields(item, String(i), `${path}[${i}]`, localeCodes, fields)
    })
    return
  }

  if (typeof value === 'object') {
    if (isMediaRef(value)) return

    if (isLocaleObject(value, localeCodes)) {
      const obj = value as Record<string, unknown>
      const values: Record<string, string> = {}
      const editValues: Record<string, string> = {}
      let hasContent = false
      let hasRichText = false
      for (const code of localeCodes) {
        const localeVal = obj[code]
        if (typeof localeVal === 'number') continue
        if (isLexical(localeVal)) {
          values[code] = lexicalToText(localeVal)
          editValues[code] = lexicalToMarkdown(localeVal)
          hasRichText = true
        } else {
          const str = typeof localeVal === 'string' ? localeVal : ''
          values[code] = str
          editValues[code] = str
        }
        if (values[code]) hasContent = true
      }
      if (hasContent) fields.push({
        path, values, isMissing: false, isWarning: false, isLocalized: true,
        fieldType: hasRichText ? 'richText' : 'text',
        editValues: hasRichText ? editValues : undefined,
      })
      return
    }

    if (isLexical(value)) {
      const str = lexicalToText(value)
      if (str) {
        const values: Record<string, string> = {}
        for (const code of localeCodes) values[code] = str
        fields.push({ path, values, isMissing: false, isWarning: false, isLocalized: false, fieldType: 'richText', editValues: undefined })
      }
      return
    }

    const obj = value as Record<string, unknown>
    for (const [k, v] of Object.entries(obj)) {
      if (SKIP_FIELDS.has(k)) continue
      extractFields(v, k, path ? `${path}.${k}` : k, localeCodes, fields)
    }
    return
  }

  if (typeof value === 'string' && value) {
    const values: Record<string, string> = {}
    for (const code of localeCodes) values[code] = value
    fields.push({ path, values, isMissing: false, isWarning: false, isLocalized: false, fieldType: 'text' })
  }
}

function collectRequiredPaths(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fields: any[],
  prefix: string,
  out: Array<{ path: string; localized: boolean; fieldType: string }>,
  docRecord: Record<string, unknown>,
  siblingData: Record<string, unknown>,
) {
  for (const f of fields ?? []) {
    if (f.type === 'tabs') {
      for (const tab of f.tabs ?? []) {
        const tabPrefix = tab.name ? (prefix ? `${prefix}.${tab.name}` : tab.name) : prefix
        const tabSibling = tab.name
          ? ((siblingData[tab.name] ?? {}) as Record<string, unknown>)
          : siblingData
        collectRequiredPaths(tab.fields ?? [], tabPrefix, out, docRecord, tabSibling)
      }
      continue
    }
    if (!f.name) {
      if (f.fields) collectRequiredPaths(f.fields, prefix, out, docRecord, siblingData)
      continue
    }

    // Evaluate admin.condition — skip field (and its children) if condition is falsy
    if (typeof f.admin?.condition === 'function') {
      try {
        if (!f.admin.condition(docRecord, siblingData)) continue
      } catch {
        continue // if condition throws, skip rather than false-alarm
      }
    }

    const path = prefix ? `${prefix}.${f.name}` : f.name
    if (f.required) {
      out.push({ path, localized: !!f.localized, fieldType: f.type as string })
    }
    if (f.type === 'group' && f.fields) {
      const groupSibling = (siblingData[f.name] ?? {}) as Record<string, unknown>
      collectRequiredPaths(f.fields, path, out, docRecord, groupSibling)
    }
  }
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function getDocumentTitle(
  collection: string,
  doc: Record<string, unknown>,
  localeCodes: string[],
): string {
  function resolve(val: unknown): string {
    if (typeof val === 'string') return val
    if (isLocaleObject(val, localeCodes)) {
      const obj = val as Record<string, unknown>
      for (const code of localeCodes) {
        if (typeof obj[code] === 'string' && obj[code]) return obj[code] as string
      }
    }
    return ''
  }
  if (collection === 'menus') return resolve(doc.name) || 'Unnamed menu'
  return resolve(doc.title) || resolve(doc.name) || resolve(doc.metaTitle) || String(doc.id ?? 'Untitled')
}

function applyMissingDetection(
  fields: ContentField[],
  docRecord: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  configFields: any[],
  localeCodes: string[],
): void {
  // Flag translation gaps
  for (const field of fields) {
    const withValue = localeCodes.filter((c) => !!field.values[c])
    const without = localeCodes.filter((c) => !field.values[c])
    if (withValue.length > 0 && without.length > 0) {
      field.isMissing = true
    }
  }

  // Inject missing required fields
  const requiredDefs: Array<{ path: string; localized: boolean; fieldType: string }> = []
  collectRequiredPaths(configFields, '', requiredDefs, docRecord, docRecord)
  const extractedByPath = new Map(fields.map((f) => [f.path, f]))

  for (const { path, localized, fieldType } of requiredDefs) {
    const existing = extractedByPath.get(path)
    if (existing) {
      if (localeCodes.some((c) => !existing.values[c])) existing.isMissing = true
    } else {
      const rawVal = getNestedValue(docRecord, path)

      // With locale:'all', localized fields return { en: "...", sv: "..." }.
      // An all-empty locale object (e.g. { en: "", sv: "" }) is still a non-null
      // object, so we must check the individual locale values, not the object itself.
      let isEmpty: boolean
      if (localized && typeof rawVal === 'object' && rawVal !== null && !Array.isArray(rawVal)) {
        const localeObj = rawVal as Record<string, unknown>
        isEmpty = localeCodes.every((code) => {
          const v = localeObj[code]
          return v === null || v === undefined || v === ''
        })
      } else {
        const isRelation = fieldType === 'upload' || fieldType === 'relationship'
        isEmpty = rawVal === null || rawVal === undefined || rawVal === '' ||
          (isRelation && !rawVal)
      }

      if (isEmpty) {
        const values: Record<string, string> = {}
        if (localized && typeof rawVal === 'object' && rawVal !== null) {
          for (const code of localeCodes) {
            const v = (rawVal as Record<string, unknown>)[code]
            values[code] = typeof v === 'string' ? v : ''
          }
        } else {
          for (const code of localeCodes) values[code] = ''
        }
        fields.push({ path, values, isMissing: true, isWarning: false, isLocalized: localized, fieldType: fieldType === 'richText' ? 'richText' : 'text' })
        extractedByPath.set(path, fields[fields.length - 1])
      }
    }
  }
}

/**
 * Equal-content warning: localized fields where all locales have identical non-empty text.
 * Skip fields where equal content is expected (slug, sectionId, dates, etc.).
 */
function applyEqualContentWarning(fields: ContentField[], localeCodes: string[]): void {
  if (localeCodes.length < 2) return
  for (const field of fields) {
    if (field.isMissing) continue
    if (!field.isLocalized) continue
    const k = leafKey(field.path)
    if (EQUAL_CONTENT_OK.has(k)) continue
    const vals = localeCodes.map((c) => field.values[c] ?? '')
    const allFilled = vals.every((v) => v.length > 0)
    const allEqual = vals.every((v) => v === vals[0])
    if (allFilled && allEqual) {
      field.isWarning = true
      // No warningNote — the yellow row colour is sufficient signal
    }
  }
}

/**
 * Soft warning: meta image is missing. Not required but worth noting for most pages.
 */
function applyMetaImageWarning(
  docRecord: Record<string, unknown>,
  localeCodes: string[],
  fields: ContentField[],
): void {
  if (!('metaImage' in docRecord)) return
  const val = docRecord.metaImage
  const hasImage = val !== null && val !== undefined && val !== 0 && val !== ''
  if (!hasImage) {
    const values: Record<string, string> = {}
    for (const code of localeCodes) values[code] = ''
    const existingIdx = fields.findIndex((f) => f.path === 'metaImage')
    if (existingIdx === -1) {
      fields.push({ path: 'metaImage', values, isMissing: false, isWarning: true, warningNote: 'No meta image set', isLocalized: false, fieldType: 'text' })
    } else {
      fields[existingIdx].isWarning = true
      fields[existingIdx].warningNote = 'No meta image set'
    }
  }
}

/**
 * localizedPaths: render as a single JSON cell rather than locale columns.
 */
function checkLocalizedPaths(
  docRecord: Record<string, unknown>,
  localeCodes: string[],
  fields: ContentField[],
): void {
  if (!('localizedPaths' in docRecord)) return
  const lp = docRecord.localizedPaths
  const lpObj =
    typeof lp === 'object' && lp !== null && !Array.isArray(lp)
      ? (lp as Record<string, unknown>)
      : {}

  const filled: Record<string, string> = {}
  let hasMissing = false
  for (const code of localeCodes) {
    const val = typeof lpObj[code] === 'string' ? (lpObj[code] as string) : ''
    filled[code] = val
    if (!val) hasMissing = true
  }

  const jsonDisplay = JSON.stringify(filled, null, 2)
  fields.push({
    path: 'localizedPaths',
    values: {},
    singleValue: jsonDisplay,
    isMissing: hasMissing,
    isWarning: false,
    isLocalized: false,
    fieldType: 'text',
  })
}

export async function fetchAllContent(payload: Payload): Promise<{
  documents: ContentDocument[]
  localeCodes: string[]
  notes: Record<string, ReviewNote> // keyed by docKey
}> {
  const localeConfig = payload.config.localization !== false ? payload.config.localization : undefined
  const localeCodes: string[] = localeConfig?.locales.map((l) => l.code) ?? ['en']

  const documents: ContentDocument[] = []

  // Collections
  const collections = payload.config.collections.filter((c) => !SYSTEM_SLUGS.has(c.slug))

  for (const collectionConfig of collections) {
    const collectionLabel =
      typeof collectionConfig.labels?.plural === 'string'
        ? collectionConfig.labels.plural
        : collectionConfig.slug

    let page = 1
    while (true) {
      const batch = await payload.find({
        collection: collectionConfig.slug as 'pages',
        depth: 0,
        limit: 50,
        page,
        locale: 'all' as 'en',
        draft: true,
        overrideAccess: true,
      })

      for (const doc of batch.docs) {
        const docRecord = doc as Record<string, unknown>
        const title = getDocumentTitle(collectionConfig.slug, docRecord, localeCodes)
        const fields: ContentField[] = []

        for (const [key, value] of Object.entries(docRecord)) {
          if (SKIP_FIELDS.has(key)) continue
          extractFields(value, key, key, localeCodes, fields)
        }

        applyMissingDetection(fields, docRecord, (collectionConfig as any).fields ?? [], localeCodes)
        applyEqualContentWarning(fields, localeCodes)
        applyMetaImageWarning(docRecord, localeCodes, fields)
        checkLocalizedPaths(docRecord, localeCodes, fields)

        const docKey = `${collectionConfig.slug}:${doc.id}`
        documents.push({
          type: 'collection',
          collection: collectionConfig.slug,
          collectionLabel,
          documentId: doc.id as number,
          documentTitle: title,
          editUrl: `/admin/collections/${collectionConfig.slug}/${doc.id}`,
          fields,
          docKey,
          docUpdatedAt: String(docRecord.updatedAt ?? ''),
        })
      }

      if (!batch.hasNextPage) break
      page++
    }
  }

  // Globals
  for (const globalConfig of payload.config.globals) {
    try {
      const globalLabel =
        typeof globalConfig.label === 'string' ? globalConfig.label : globalConfig.slug

      const doc = await (payload.findGlobal as any)({
        slug: globalConfig.slug,
        depth: 0,
        locale: 'all' as 'en',
        draft: true,
        overrideAccess: true,
      })

      const docRecord = doc as Record<string, unknown>
      const fields: ContentField[] = []

      for (const [key, value] of Object.entries(docRecord)) {
        if (SKIP_FIELDS.has(key)) continue
        extractFields(value, key, key, localeCodes, fields)
      }

      applyMissingDetection(fields, docRecord, (globalConfig as any).fields ?? [], localeCodes)
      applyEqualContentWarning(fields, localeCodes)

      const docKey = `global:${globalConfig.slug}`
      documents.push({
        type: 'global',
        globalSlug: globalConfig.slug,
        globalLabel,
        documentTitle: globalLabel,
        editUrl: `/admin/globals/${globalConfig.slug}`,
        fields,
        docKey,
        docUpdatedAt: String(docRecord.updatedAt ?? ''),
      })
    } catch {
      // Skip globals that haven't been saved yet
    }
  }

  // Fetch all review notes in one query
  const notes: Record<string, ReviewNote> = {}
  try {
    let notePage = 1
    while (true) {
      const batch = await payload.find({
        collection: 'content-review-notes',
        limit: 200,
        page: notePage,
        overrideAccess: true,
        depth: 0,
      })
      for (const note of batch.docs) {
        const n = note as Record<string, unknown>
        const key = String(n.key ?? '')
        if (key) {
          notes[key] = {
            key,
            docUpdatedAt: String(n.docUpdatedAt ?? ''),
          }
        }
      }
      if (!batch.hasNextPage) break
      notePage++
    }
  } catch {
    // Collection may not exist yet (before first migration) — safe to skip
  }

  return { documents, localeCodes, notes }
}
