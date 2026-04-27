/**
 * Walks any Payload document driven by its collection field schema. Only
 * collects values from text-bearing field types (text, textarea, email,
 * richText) so select/radio/checkbox/number/relationship/upload values
 * never leak into the search index. Schema traversal handles nesting via
 * group, array, blocks, tabs, row, and collapsible.
 *
 * `extraSkipKeys` lets a project drop a specific text field by name from
 * indexing without touching the submodule.
 */

import type { Field } from 'payload'

const TEXT_TYPES = new Set(['text', 'textarea', 'email'])

/**
 * Defense-in-depth skip list for keys that, if declared as a text field on
 * some collection, should still never end up in the search index. Schema
 * walking already drops non-text types, internal markers (`id`, `blockType`,
 * `_key`, `_status`, `version`), and date/number fields (`updatedAt`,
 * `width`, etc.) without help — those don't need to be listed here.
 *
 * What stays: text fields auto-injected by Payload's upload + auth features
 * (in case a project enables uploads on a non-media collection or auth on
 * a non-users collection), plus the derived `localizedPaths` URL map.
 */
const GLOBAL_SKIP_KEYS = new Set([
  // Payload auto-injects `id` as a text field on every array/blocks item
  // (UUID-style identifier). It IS in the field schema, so schema walking
  // would visit it without this guard — and we'd index document/block IDs
  // as if they were content.
  'id',
  'filename',
  'mimeType',
  'sizes',
  'thumbnailURL',
  'url',
  'hash',
  'salt',
  'localizedPaths',
])

function isLexical(val: unknown): val is { root: unknown } {
  return (
    typeof val === 'object' &&
    val !== null &&
    !Array.isArray(val) &&
    'root' in (val as object)
  )
}

function lexicalToText(json: unknown): string {
  if (!isLexical(json)) return ''
  const parts: string[] = []
  const walk = (node: Record<string, unknown>) => {
    if (node.type === 'text' && typeof node.text === 'string') parts.push(node.text)
    const children = node.children as Record<string, unknown>[] | undefined
    if (children) for (const child of children) walk(child)
  }
  walk(json.root as Record<string, unknown>)
  return parts.join(' ')
}

function pushString(
  value: unknown,
  perLocale: Record<string, string[]>,
  localeCodes: string[],
  localized: boolean | undefined,
) {
  if (value === null || value === undefined) return
  if (localized && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    for (const code of localeCodes) {
      const v = obj[code]
      if (typeof v === 'string' && v.trim()) perLocale[code].push(v)
    }
    return
  }
  if (typeof value === 'string' && value.trim()) {
    for (const code of localeCodes) perLocale[code].push(value)
  }
}

function pushRichText(
  value: unknown,
  perLocale: Record<string, string[]>,
  localeCodes: string[],
  localized: boolean | undefined,
) {
  if (value === null || value === undefined) return
  if (localized && typeof value === 'object' && !Array.isArray(value) && !isLexical(value)) {
    const obj = value as Record<string, unknown>
    for (const code of localeCodes) {
      const text = lexicalToText(obj[code])
      if (text.trim()) perLocale[code].push(text)
    }
    return
  }
  const text = lexicalToText(value)
  if (text.trim()) for (const code of localeCodes) perLocale[code].push(text)
}

function visit(
  value: unknown,
  fields: Field[],
  perLocale: Record<string, string[]>,
  localeCodes: string[],
  skipKeys: Set<string>,
) {
  if (value === null || value === undefined) return
  if (typeof value !== 'object' || Array.isArray(value)) return
  const obj = value as Record<string, unknown>

  for (const field of fields) {
    if (field.type === 'row' || field.type === 'collapsible') {
      visit(obj, field.fields, perLocale, localeCodes, skipKeys)
      continue
    }

    if (field.type === 'tabs') {
      for (const tab of field.tabs) {
        if ('name' in tab && tab.name) {
          visit(obj[tab.name], tab.fields, perLocale, localeCodes, skipKeys)
        } else {
          visit(obj, tab.fields, perLocale, localeCodes, skipKeys)
        }
      }
      continue
    }

    if (field.type === 'ui') continue
    if (!('name' in field) || !field.name) continue
    if (skipKeys.has(field.name)) continue

    const fv = obj[field.name]
    if (fv === null || fv === undefined) continue

    const localized = 'localized' in field ? field.localized : undefined

    if (field.type === 'group') {
      if (localized && typeof fv === 'object' && !Array.isArray(fv)) {
        const lo = fv as Record<string, unknown>
        for (const code of localeCodes) {
          if (lo[code] !== undefined) visit(lo[code], field.fields, perLocale, [code], skipKeys)
        }
      } else {
        visit(fv, field.fields, perLocale, localeCodes, skipKeys)
      }
    } else if (field.type === 'array') {
      const visitArray = (arr: unknown, codes: string[]) => {
        if (!Array.isArray(arr)) return
        for (const item of arr) visit(item, field.fields, perLocale, codes, skipKeys)
      }
      if (localized && typeof fv === 'object' && !Array.isArray(fv)) {
        const lo = fv as Record<string, unknown>
        for (const code of localeCodes) visitArray(lo[code], [code])
      } else {
        visitArray(fv, localeCodes)
      }
    } else if (field.type === 'blocks') {
      const visitBlocks = (arr: unknown, codes: string[]) => {
        if (!Array.isArray(arr)) return
        for (const item of arr) {
          const blockType = (item as { blockType?: string } | null)?.blockType
          const block = field.blocks.find((b) => b.slug === blockType)
          if (!block) continue
          visit(item, block.fields, perLocale, codes, skipKeys)
        }
      }
      if (localized && typeof fv === 'object' && !Array.isArray(fv)) {
        const lo = fv as Record<string, unknown>
        for (const code of localeCodes) visitBlocks(lo[code], [code])
      } else {
        visitBlocks(fv, localeCodes)
      }
    } else if (TEXT_TYPES.has(field.type)) {
      pushString(fv, perLocale, localeCodes, localized)
    } else if (field.type === 'richText') {
      pushRichText(fv, perLocale, localeCodes, localized)
    }
    // All other types (select, radio, checkbox, number, date, point, code,
    // json, relationship, upload, join) are intentionally skipped.
  }
}

export interface ExtractTextOptions {
  /**
   * Project-specific field names to skip on top of the global system list.
   * Use this to exclude a text field from indexing without editing the
   * submodule (e.g. an internal-only note field).
   */
  extraSkipKeys?: string[]
}

/**
 * Returns one string per locale. Non-localized text is included in every
 * locale's output so cross-locale search works (a Swedish page with an
 * English proper noun is still findable from the Swedish row).
 */
export function extractText(
  doc: unknown,
  localeCodes: string[],
  fields: Field[],
  options: ExtractTextOptions = {},
): { perLocale: Record<string, string>; title: Record<string, string> } {
  const perLocale: Record<string, string[]> = Object.fromEntries(
    localeCodes.map((c) => [c, []]),
  )
  const title: Record<string, string> = Object.fromEntries(localeCodes.map((c) => [c, '']))

  const skipKeys = new Set<string>([...GLOBAL_SKIP_KEYS, ...(options.extraSkipKeys ?? [])])

  visit(doc, fields, perLocale, localeCodes, skipKeys)

  const docRecord = doc as Record<string, unknown>
  const titleCandidates = ['name', 'title', 'metaTitle', 'heading']
  for (const code of localeCodes) {
    for (const key of titleCandidates) {
      const val = docRecord[key]
      if (typeof val === 'string' && val.trim()) {
        title[code] = val
        break
      }
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        const localeVal = (val as Record<string, unknown>)[code]
        if (typeof localeVal === 'string' && localeVal.trim()) {
          title[code] = localeVal
          break
        }
      }
    }
  }

  const result: Record<string, string> = {}
  for (const code of localeCodes) {
    result[code] = perLocale[code].join(' \n ').replace(/\s+/g, ' ').trim()
  }

  return { perLocale: result, title }
}

/**
 * Resolves the URL for a doc in a given locale using `localizedPaths`.
 * Returns null if no path is set — caller decides whether to skip indexing.
 *
 * `prefixLocale` controls whether the returned URL is prefixed with `/${locale}`.
 * Multi-locale projects (e.g. nodebrush) route through `/en/…`, `/sv/…` and need
 * the prefix. Single-locale projects (no `payload.config.localization`) route
 * directly from root and should get the raw path.
 */
export function resolveUrl(
  collection: string,
  doc: Record<string, unknown>,
  locale: string,
  opts?: { prefixLocale?: boolean },
): string | null {
  const lp = doc.localizedPaths
  if (typeof lp === 'object' && lp !== null && !Array.isArray(lp)) {
    const path = (lp as Record<string, unknown>)[locale]
    if (typeof path === 'string' && path) {
      const normalized = path === '/' ? '/' : path.startsWith('/') ? path : `/${path}`
      if (opts?.prefixLocale === false) return normalized
      const prefix = `/${locale}`
      return normalized === '/' ? prefix : `${prefix}${normalized}`
    }
  }
  return null
}
