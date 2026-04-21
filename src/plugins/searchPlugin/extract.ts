/**
 * Walks any Payload document and extracts every string + Lexical text node
 * into one flat string, per locale. Collection-agnostic and locale-agnostic:
 * drives entirely off the runtime document shape.
 */

const SKIP_KEYS = new Set([
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
  'publishedAt',
  'populatedAuthors',
  'hash',
  'salt',
  'author',
  'thumbnailURL',
  'usageCount',
  'usedIn',
  'url',
  'blockType',
  '_key',
  'version',
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

function isMediaRef(val: unknown): boolean {
  if (typeof val !== 'object' || val === null || Array.isArray(val)) return false
  const obj = val as Record<string, unknown>
  return 'filename' in obj && 'mimeType' in obj
}

/**
 * Returns one string per locale. Non-localized text is included in every
 * locale's output so cross-locale search works (a Swedish page with an
 * English proper noun is still findable from the Swedish row).
 */
export function extractText(
  doc: unknown,
  localeCodes: string[],
): { perLocale: Record<string, string>; title: Record<string, string> } {
  const perLocale: Record<string, string[]> = Object.fromEntries(
    localeCodes.map((c) => [c, []]),
  )
  const title: Record<string, string> = Object.fromEntries(localeCodes.map((c) => [c, '']))

  const isLocaleObject = (val: unknown): val is Record<string, unknown> => {
    if (typeof val !== 'object' || val === null || Array.isArray(val)) return false
    if (isLexical(val)) return false
    const keys = Object.keys(val as object)
    if (keys.length === 0) return false
    return keys.every((k) => localeCodes.includes(k))
  }

  const visit = (value: unknown, key: string | null) => {
    if (value === null || value === undefined) return
    if (SKIP_KEYS.has(key ?? '')) return

    if (typeof value === 'string') {
      if (!value.trim()) return
      for (const code of localeCodes) perLocale[code].push(value)
      return
    }

    if (typeof value === 'number' || typeof value === 'boolean') return

    if (Array.isArray(value)) {
      for (const item of value) visit(item, key)
      return
    }

    if (typeof value === 'object') {
      if (isMediaRef(value)) return

      if (isLexical(value)) {
        const text = lexicalToText(value)
        if (text.trim()) for (const code of localeCodes) perLocale[code].push(text)
        return
      }

      if (isLocaleObject(value)) {
        const obj = value as Record<string, unknown>
        for (const code of localeCodes) {
          const localeVal = obj[code]
          if (localeVal === null || localeVal === undefined) continue
          if (typeof localeVal === 'string') {
            if (localeVal.trim()) perLocale[code].push(localeVal)
          } else if (isLexical(localeVal)) {
            const text = lexicalToText(localeVal)
            if (text.trim()) perLocale[code].push(text)
          }
        }
        return
      }

      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        visit(v, k)
      }
      return
    }
  }

  const docRecord = doc as Record<string, unknown>
  for (const [k, v] of Object.entries(docRecord)) visit(v, k)

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
 */
export function resolveUrl(
  collection: string,
  doc: Record<string, unknown>,
  locale: string,
): string | null {
  const lp = doc.localizedPaths
  if (typeof lp === 'object' && lp !== null && !Array.isArray(lp)) {
    const path = (lp as Record<string, unknown>)[locale]
    if (typeof path === 'string' && path) {
      const prefix = `/${locale}`
      return path === '/' ? prefix : `${prefix}${path.startsWith('/') ? path : `/${path}`}`
    }
  }
  return null
}
