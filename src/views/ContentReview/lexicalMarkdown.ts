/**
 * Bidirectional Lexical JSON ↔ Markdown converter for the Content Review edit mode.
 *
 * Lexical node facts (Payload v3 / lexical@0.41.0):
 *  - Link URL lives at node.fields.url (NOT node.url)
 *  - Both "link" and "autolink" node types exist
 *  - Text format bitmask: bold=1, italic=2, strikethrough=4, underline=8, code=16
 *  - No CodeHighlight feature enabled — only inline code via text format bitmask
 *  - paragraph has extra textFormat/textStyle fields (Payload additions)
 *  - horizontalrule has only type+version (no children)
 */

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function isLexical(val: unknown): val is { root: Record<string, unknown> } {
  return typeof val === 'object' && val !== null && !Array.isArray(val) && 'root' in (val as object)
}

type LexNode = Record<string, unknown>

function children(node: LexNode): LexNode[] {
  return (node.children as LexNode[] | undefined) ?? []
}

// ---------------------------------------------------------------------------
// Lexical → Markdown
// ---------------------------------------------------------------------------

function inlineToMd(node: LexNode): string {
  const type = node.type as string

  if (type === 'linebreak') return '\n'
  if (type === 'tab') return '\t'

  if (type === 'text') {
    let text = String(node.text ?? '')
    if (!text) return ''
    const fmt = (node.format as number) ?? 0
    const bold      = (fmt & 1) !== 0
    const italic    = (fmt & 2) !== 0
    const strike    = (fmt & 4) !== 0
    const code      = (fmt & 16) !== 0
    // Escape backticks inside code spans
    if (code)   return `\`${text.replace(/`/g, '\\`')}\``
    if (bold && italic) return `___${text}___`
    if (bold)   return `__${text}__`
    if (italic) return `_${text}_`
    if (strike) return `~~${text}~~`
    return text
  }

  if (type === 'link' || type === 'autolink') {
    const fields = (node.fields as Record<string, unknown>) ?? {}
    const url = (fields.url as string) ?? ''
    const inner = children(node).map(inlineToMd).join('')
    if (!url || url === inner) return `<${inner}>`
    return `[${inner}](${url})`
  }

  // Fallback: recurse into children
  return children(node).map(inlineToMd).join('')
}

function blockToMd(node: LexNode): string {
  const type = node.type as string

  if (type === 'root') {
    return children(node)
      .map(blockToMd)
      .filter((s) => s.trim().length > 0)
      .join('\n\n')
  }

  if (type === 'paragraph') {
    return children(node).map(inlineToMd).join('')
  }

  if (type === 'heading') {
    const level = String(node.tag ?? 'h1').replace('h', '')
    const prefix = '#'.repeat(Math.max(1, Math.min(6, Number(level))))
    return `${prefix} ${children(node).map(inlineToMd).join('')}`
  }

  if (type === 'quote') {
    return `> ${children(node).map(inlineToMd).join('')}`
  }

  if (type === 'horizontalrule') {
    return '---'
  }

  if (type === 'list') {
    const listType = node.listType as string
    return children(node)
      .map((item, i) => {
        const content = children(item).map(inlineToMd).join('')
        return listType === 'number' ? `${i + 1}. ${content}` : `- ${content}`
      })
      .join('\n')
  }

  if (type === 'listitem') {
    // Shouldn't be reached directly (handled by 'list'), but just in case
    return children(node).map(inlineToMd).join('')
  }

  // Fallback: treat as paragraph
  const inner = children(node).map(inlineToMd).join('')
  return inner
}

export function lexicalToMarkdown(json: unknown): string {
  if (!isLexical(json)) {
    return typeof json === 'string' ? json : ''
  }
  return blockToMd(json.root).trim()
}

// ---------------------------------------------------------------------------
// Markdown → Lexical
// ---------------------------------------------------------------------------

function makeText(text: string, format: number = 0): LexNode {
  return { type: 'text', version: 1, text, format, detail: 0, mode: 'normal', style: '' }
}

function makeParagraph(kids: LexNode[]): LexNode {
  return { type: 'paragraph', version: 1, children: kids, direction: 'ltr', format: '', indent: 0, textFormat: 0, textStyle: '' }
}

function makeHeading(tag: string, kids: LexNode[]): LexNode {
  return { type: 'heading', version: 1, tag, children: kids, direction: 'ltr', format: '', indent: 0 }
}

function makeLink(url: string, kids: LexNode[]): LexNode {
  return {
    type: 'link',
    version: 1,
    fields: { linkType: 'custom', url, newTab: false, doc: null },
    children: kids,
    direction: 'ltr',
    format: '',
    indent: 0,
    rel: 'noreferrer',
  }
}

function makeListItem(kids: LexNode[], value: number): LexNode {
  return { type: 'listitem', version: 1, value, checked: undefined, children: kids, direction: 'ltr', format: '', indent: 0 }
}

function makeList(listType: 'bullet' | 'number', items: LexNode[]): LexNode {
  return {
    type: 'list',
    version: 1,
    listType,
    tag: listType === 'number' ? 'ol' : 'ul',
    start: 1,
    children: items,
    direction: 'ltr',
    format: '',
    indent: 0,
  }
}

/**
 * Parse inline markdown within a single line of text.
 * Processes in order: links, auto-links, inline-code, bold+italic, bold, italic, strikethrough, plain.
 */
function parseInline(text: string): LexNode[] {
  const nodes: LexNode[] = []
  let i = 0

  while (i < text.length) {
    // [text](url) links
    if (text[i] === '[') {
      const closeBracket = text.indexOf('](', i + 1)
      if (closeBracket !== -1) {
        const closeUrl = text.indexOf(')', closeBracket + 2)
        if (closeUrl !== -1) {
          const linkText = text.slice(i + 1, closeBracket)
          const url = text.slice(closeBracket + 2, closeUrl)
          nodes.push(makeLink(url, parseInline(linkText)))
          i = closeUrl + 1
          continue
        }
      }
    }

    // <url> / <email> auto-links
    if (text[i] === '<') {
      const close = text.indexOf('>', i + 1)
      if (close !== -1) {
        const raw = text.slice(i + 1, close)
        let url = raw
        let display = raw
        if (raw.includes('@') && !raw.includes('://')) {
          url = `mailto:${raw}`
        } else if (!raw.includes('://') && !raw.startsWith('tel:') && !raw.startsWith('mailto:')) {
          url = `https://${raw}`
        }
        if (url.startsWith('mailto:')) display = url.slice(7)
        else if (url.startsWith('tel:')) display = url.slice(4)
        nodes.push(makeLink(url, [makeText(display)]))
        i = close + 1
        continue
      }
    }

    // Inline code: `code`
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1)
      if (end !== -1) {
        nodes.push(makeText(text.slice(i + 1, end), 16))
        i = end + 1
        continue
      }
    }

    // ___bold+italic___
    if (text.startsWith('___', i)) {
      const end = text.indexOf('___', i + 3)
      if (end !== -1) {
        nodes.push(makeText(text.slice(i + 3, end), 3))
        i = end + 3
        continue
      }
    }

    // __bold__
    if (text.startsWith('__', i)) {
      const end = text.indexOf('__', i + 2)
      if (end !== -1) {
        nodes.push(makeText(text.slice(i + 2, end), 1))
        i = end + 2
        continue
      }
    }

    // _italic_
    if (text[i] === '_') {
      const end = text.indexOf('_', i + 1)
      if (end !== -1) {
        nodes.push(makeText(text.slice(i + 1, end), 2))
        i = end + 1
        continue
      }
    }

    // ~~strikethrough~~
    if (text.startsWith('~~', i)) {
      const end = text.indexOf('~~', i + 2)
      if (end !== -1) {
        nodes.push(makeText(text.slice(i + 2, end), 4))
        i = end + 2
        continue
      }
    }

    // Plain text — collect until next special character
    let j = i + 1
    while (j < text.length && !'[<`_~'.includes(text[j])) j++
    nodes.push(makeText(text.slice(i, j)))
    i = j
  }

  return nodes
}

/**
 * Merge adjacent plain-text nodes (for cleaner output).
 */
function mergeTextNodes(nodes: LexNode[]): LexNode[] {
  const out: LexNode[] = []
  for (const n of nodes) {
    const prev = out[out.length - 1]
    if (
      n.type === 'text' && prev?.type === 'text' &&
      n.format === prev.format && n.mode === prev.mode
    ) {
      out[out.length - 1] = { ...prev, text: String(prev.text) + String(n.text) }
    } else {
      out.push(n)
    }
  }
  return out
}

export function markdownToLexical(text: string): object {
  const rootChildren: LexNode[] = []

  // Split into blocks by double newline
  const blocks = text.split(/\n\n+/).map((b) => b.trim()).filter(Boolean)

  for (const block of blocks) {
    // Heading: # text
    const headingMatch = block.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      const tag = `h${headingMatch[1].length}`
      rootChildren.push(makeHeading(tag, mergeTextNodes(parseInline(headingMatch[2]))))
      continue
    }

    // Blockquote: > text
    if (block.startsWith('> ')) {
      const inner = block.replace(/^>\s*/gm, '')
      rootChildren.push({
        type: 'quote',
        version: 1,
        children: mergeTextNodes(parseInline(inner)),
        direction: 'ltr',
        format: '',
        indent: 0,
      })
      continue
    }

    // Horizontal rule
    if (block === '---') {
      rootChildren.push({ type: 'horizontalrule', version: 1 })
      continue
    }

    // Bullet list: all lines start with "- "
    const lines = block.split('\n')
    if (lines.every((l) => /^-\s/.test(l))) {
      rootChildren.push(
        makeList('bullet', lines.map((l, idx) =>
          makeListItem(mergeTextNodes(parseInline(l.replace(/^-\s+/, ''))), idx + 1)
        ))
      )
      continue
    }

    // Ordered list: all lines start with "N. "
    if (lines.every((l) => /^\d+\.\s/.test(l))) {
      rootChildren.push(
        makeList('number', lines.map((l, idx) =>
          makeListItem(mergeTextNodes(parseInline(l.replace(/^\d+\.\s+/, ''))), idx + 1)
        ))
      )
      continue
    }

    // Paragraph (single newlines become linebreak nodes within the paragraph)
    const paragraphChildren: LexNode[] = []
    for (let k = 0; k < lines.length; k++) {
      if (k > 0) paragraphChildren.push({ type: 'linebreak', version: 1 })
      paragraphChildren.push(...parseInline(lines[k]))
    }
    rootChildren.push(makeParagraph(mergeTextNodes(paragraphChildren)))
  }

  // Ensure at least one empty paragraph (Lexical requirement)
  if (rootChildren.length === 0) {
    rootChildren.push(makeParagraph([makeText('')]))
  }

  return {
    root: {
      type: 'root',
      version: 1,
      children: rootChildren,
      direction: 'ltr',
      format: '',
      indent: 0,
    },
  }
}
