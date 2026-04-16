'use server'

import { getPayload } from 'payload'
import config from '@payload-config'
import { markdownToLexical } from './lexicalMarkdown'

// ---------------------------------------------------------------------------
// deepSetPath — navigate to a dot/bracket path and set the leaf value
// e.g. deepSetPath(obj, "sections[4].cta.text", "hello")
// ---------------------------------------------------------------------------
function parsePath(path: string): (string | number)[] {
  const segments: (string | number)[] = []
  const re = /([^.[\]]+)|\[(\d+)\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(path)) !== null) {
    if (m[1] !== undefined) segments.push(m[1])
    else segments.push(parseInt(m[2], 10))
  }
  return segments
}

function deepSetPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const segments = parsePath(path)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = obj
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]
    if (current[seg] === undefined || current[seg] === null) return
    current = current[seg]
  }
  current[segments[segments.length - 1]] = value
}

export async function markDocumentReviewed(key: string, docUpdatedAt: string): Promise<void> {
  const payload = await getPayload({ config })

  // Globals without versioning have no updatedAt — store review time as fallback
  const timestamp = docUpdatedAt || new Date().toISOString()

  const existing = await payload.find({
    collection: 'content-review-notes',
    where: { key: { equals: key } },
    limit: 1,
    overrideAccess: true,
  })

  if (existing.docs.length > 0) {
    await payload.update({
      collection: 'content-review-notes',
      id: existing.docs[0].id as number,
      data: { docUpdatedAt: timestamp },
      overrideAccess: true,
    })
  } else {
    await payload.create({
      collection: 'content-review-notes',
      data: { key, docUpdatedAt: timestamp },
      overrideAccess: true,
    })
  }
}

// ---------------------------------------------------------------------------
// saveDocumentEdits
// ---------------------------------------------------------------------------

export type FieldEdit = {
  path: string
  value: string
  fieldType: 'text' | 'richText'
}

/**
 * Save inline edits from the Content Review page as a draft.
 * editsByLocale: locale code → array of {path, value, fieldType}
 *
 * Strategy:
 *  1. Fetch the document with the specific locale (flat values, not locale objects)
 *  2. Apply each edit by path — convert markdown → Lexical for richText fields
 *  3. Save as draft for that locale
 */
export async function saveDocumentEdits(
  docKey: string,
  editsByLocale: Record<string, FieldEdit[]>,
): Promise<void> {
  const payload = await getPayload({ config })
  const isGlobal = docKey.startsWith('global:')
  const slug = isGlobal ? docKey.slice(7) : docKey.split(':')[0]
  const id = isGlobal ? null : docKey.split(':').slice(1).join(':')

  for (const [locale, edits] of Object.entries(editsByLocale)) {
    if (edits.length === 0) continue

    // Fetch current state for this locale (flat values, not locale objects)
    const current = isGlobal
      ? await (payload.findGlobal as any)({
          slug,
          locale,
          depth: 0,
          draft: true,
          overrideAccess: true,
        })
      : await payload.findByID({
          collection: slug as 'pages',
          id: id!,
          locale: locale as 'en',
          depth: 0,
          draft: true,
          overrideAccess: true,
        })

    // Clone and strip read-only system fields
    const data = { ...(current as Record<string, unknown>) }
    delete data.id
    delete data.updatedAt
    delete data.createdAt
    delete data._status

    for (const edit of edits) {
      const value: unknown = edit.fieldType === 'richText'
        ? markdownToLexical(edit.value)
        : edit.value
      deepSetPath(data, edit.path, value)
    }

    if (isGlobal) {
      await (payload.updateGlobal as any)({
        slug,
        locale,
        data,
        draft: true,
        overrideAccess: true,
      })
    } else {
      await payload.update({
        collection: slug as 'pages',
        id: id!,
        locale: locale as 'en',
        data,
        draft: true,
        overrideAccess: true,
      })
    }
  }
}

export async function unmarkDocumentReviewed(key: string): Promise<void> {
  const payload = await getPayload({ config })

  const existing = await payload.find({
    collection: 'content-review-notes',
    where: { key: { equals: key } },
    limit: 1,
    overrideAccess: true,
  })

  if (existing.docs.length > 0) {
    await payload.delete({
      collection: 'content-review-notes',
      id: existing.docs[0].id as number,
      overrideAccess: true,
    })
  }
}
