/**
 * GET /api/media-sheets
 *
 * Generates all contact sheets in parallel, saves them as WebP to a temp
 * directory, and returns a JSON manifest with the file paths.
 * Claude then reads each path directly — no downloading via HTTP.
 *
 * Query params:
 *   ?search=keyword     filter by filename or alt text
 *   ?sort=id|-createdAt  (default: id)
 *   ?chunk=N            images per sheet (default: 48)
 */

import { getPayload } from 'payload'
import config from '@payload-config'
import sharp from 'sharp'
import { writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// Layout
const COLS = 8
const CELL_W = 240
const CELL_H = 160  // 3:2 — matches landscape stock photos
const LABEL_H = 20
const TOTAL_CELL_H = CELL_H + LABEL_H
const CANVAS_W = COLS * CELL_W   // 1920px
const HEADER_H = 28

const BG = { r: 14, g: 14, b: 14 }

export async function GET(req: Request) {
  const url = new URL(req.url)
  const origin = url.origin
  const search = url.searchParams.get('search') || undefined
  const sort = url.searchParams.get('sort') || 'id'
  const chunkSize = Math.max(8, parseInt(url.searchParams.get('chunk') || '48'))

  try {
    const payload = await getPayload({ config })

    // Fetch all media metadata in one query
    const result = await payload.find({
      collection: 'media',
      depth: 0,
      limit: 1000,
      sort,
      ...(search
        ? { where: { or: [{ filename: { contains: search } }, { alt: { contains: search } }] } }
        : {}),
    })

    const docs = result.docs
    const chunks = chunk(docs, chunkSize)
    const totalSheets = chunks.length

    // Create output directory
    const outDir = join(tmpdir(), 'nodebrush-media')
    mkdirSync(outDir, { recursive: true })

    // Generate all sheets in parallel
    const sheetPaths = await Promise.all(
      chunks.map((sheetDocs, sheetIdx) =>
        renderSheet(sheetDocs, sheetIdx, totalSheets, docs.length, origin, outDir),
      ),
    )

    return Response.json({
      totalDocs: docs.length,
      totalSheets,
      chunkSize,
      outDir,
      sheets: sheetPaths,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(`Error: ${msg}`, { status: 500 })
  }
}

// ─── Sheet renderer ───────────────────────────────────────────────────────────

async function renderSheet(
  docs: any[],
  sheetIdx: number,
  totalSheets: number,
  totalDocs: number,
  origin: string,
  outDir: string,
): Promise<string> {
  const sheetNum = sheetIdx + 1
  const rows = Math.ceil(docs.length / COLS)
  const canvasH = HEADER_H + rows * TOTAL_CELL_H

  const composites: sharp.OverlayOptions[] = []

  // Fetch and place all images concurrently
  await Promise.all(
    docs.map(async (doc, i) => {
      const col = i % COLS
      const row = Math.floor(i / COLS)
      const x = col * CELL_W
      const y = HEADER_H + row * TOTAL_CELL_H

      const cellImg = await fetchCellImage(doc, origin)
      composites.push({ input: cellImg, left: x, top: y })

      const name = (doc.filename || '').replace(/\.[^.]+$/, '').slice(0, 24)
      composites.push({
        input: Buffer.from(svgLabel(CELL_W, LABEL_H, `#${doc.id}`, name)),
        left: x,
        top: y + CELL_H,
      })
    }),
  )

  // Header
  const startNum = sheetIdx * docs.length + 1  // approximate
  const headerText = `Sheet ${sheetNum}/${totalSheets} — ${docs.length} images (${totalDocs} total)`
  composites.unshift({
    input: Buffer.from(svgHeader(CANVAS_W, HEADER_H, headerText)),
    left: 0,
    top: 0,
  })

  const webp = await sharp({
    create: { width: CANVAS_W, height: canvasH, channels: 3, background: BG },
  })
    .composite(composites)
    .webp({ quality: 82 })
    .toBuffer()

  const filePath = join(outDir, `sheet-${String(sheetNum).padStart(2, '0')}.webp`)
  writeFileSync(filePath, webp)
  return filePath
}

// ─── Image fetcher ─────────────────────────────────────────────────────────────

async function fetchCellImage(doc: any, origin: string): Promise<Buffer> {
  const isImage = doc.mimeType?.startsWith('image/')

  if (isImage) {
    // Prefer 480px 'card' size for detail; fall back to thumbnail, then original
    const thumbUrl =
      doc.sizes?.card?.url ||
      doc.sizes?.thumbnail?.url ||
      doc.url

    if (thumbUrl) {
      try {
        const fullUrl = thumbUrl.startsWith('http') ? thumbUrl : `${origin}${thumbUrl}`
        const res = await fetch(fullUrl, { signal: AbortSignal.timeout(12_000) })

        if (res.ok) {
          const raw = Buffer.from(await res.arrayBuffer())
          return sharp(raw)
            .resize(CELL_W, CELL_H, {
              fit: 'contain',     // never crop — show the full image
              position: 'centre',
              background: BG,
            })
            .png()    // intermediate PNG for sharp compositing
            .toBuffer()
        }
      } catch {
        // fall through to placeholder
      }
    }
  }

  return makePlaceholder(doc.mimeType)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function makePlaceholder(mimeType?: string | null): Promise<Buffer> {
  const label =
    mimeType === 'image/svg+xml'
      ? 'SVG'
      : (mimeType?.split('/')[1]?.toUpperCase().slice(0, 6) ?? '?')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL_W}" height="${CELL_H}">
    <rect width="${CELL_W}" height="${CELL_H}" fill="#1e1e1e"/>
    <text x="${CELL_W / 2}" y="${CELL_H / 2 + 6}" text-anchor="middle"
      font-family="monospace" font-size="15" fill="#444">${label}</text>
  </svg>`
  return sharp(Buffer.from(svg)).resize(CELL_W, CELL_H).png().toBuffer()
}

function svgLabel(w: number, h: number, id: string, name: string): string {
  const idW = id.length * 6.8 + 5
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="#0a0a0a"/>
    <text x="3" y="14" font-family="monospace" font-size="10.5" fill="#555">${id}</text>
    <text x="${idW}" y="14" font-family="monospace" font-size="10.5" fill="#bbb">${escXml(name)}</text>
  </svg>`
}

function svgHeader(w: number, h: number, text: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="#1a1a1a"/>
    <text x="10" y="${h - 8}" font-family="monospace" font-size="12" fill="#ddd">${escXml(text)}</text>
  </svg>`
}

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}
