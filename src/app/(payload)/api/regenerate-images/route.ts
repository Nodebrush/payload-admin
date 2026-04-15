import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { S3Client, DeleteObjectsCommand } from '@aws-sdk/client-s3'

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: 'serverfi',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
  },
  forcePathStyle: true,
})

const BUCKET = process.env.S3_BUCKET || 'nodebrush-website'

function getSizeFilenames(doc: any): Set<string> {
  const sizes = doc?.sizes as Record<string, { filename?: string }> | undefined
  if (!sizes) return new Set()
  return new Set(
    Object.values(sizes)
      .map((s) => s?.filename)
      .filter((f): f is string => !!f)
  )
}

function resolveUrl(url: string, base: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`
}

export async function GET(req: NextRequest) {
  return run(req)
}

export async function POST(req: NextRequest) {
  return run(req)
}

async function run(req: NextRequest) {
  const base = `${req.nextUrl.protocol}//${req.nextUrl.host}`
  console.log('Starting image regeneration...')

  try {
    const payload = await getPayload({ config })

    const PAGE_SIZE = 50
    let page = 1
    let totalDocs = 0
    const allDocs: any[] = []

    while (true) {
      const batch = await payload.find({
        collection: 'media',
        depth: 0,
        limit: PAGE_SIZE,
        page,
      })

      if (page === 1) {
        totalDocs = batch.totalDocs
        if (totalDocs === 0) {
          return NextResponse.json({ success: false, message: 'No media files found' })
        }
        console.log(`Found ${totalDocs} files to process`)
      }

      allDocs.push(...batch.docs)
      if (!batch.hasNextPage) break
      page++
    }

    let successCount = 0
    let errorCount = 0
    let deletedCount = 0
    const errors: string[] = []

    for (let i = 0; i < allDocs.length; i++) {
      const mediaDoc = allDocs[i]
      const progress = `(${i + 1}/${allDocs.length})`

      try {
        if (!mediaDoc.url || !mediaDoc.mimeType?.startsWith('image/')) {
          console.log(`${progress} Skipping (not an image): ${mediaDoc.filename}`)
          successCount++
          continue
        }

        const originalFilename: string = mediaDoc.filename
        const oldSizeFilenames = getSizeFilenames(mediaDoc)

        const fullUrl = resolveUrl(mediaDoc.url, base)
        console.log(`${progress} Fetching original: ${fullUrl}`)
        const res = await fetch(fullUrl)
        if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`)
        const buffer = Buffer.from(await res.arrayBuffer())

        console.log(`${progress} Regenerating sizes: ${originalFilename}`)
        const updated = await payload.update({
          collection: 'media',
          id: mediaDoc.id,
          data: {},
          file: {
            data: buffer,
            mimetype: mediaDoc.mimeType,
            name: originalFilename,
            size: buffer.byteLength,
          },
          overwriteExistingFiles: true,
        })

        const newSizeFilenames = getSizeFilenames(updated)
        const toDelete = [...oldSizeFilenames].filter((f) => {
          if (!newSizeFilenames.has(f)) {
            if (f === originalFilename) {
              errors.push(`SAFETY: tried to delete original "${originalFilename}" — skipped`)
              return false
            }
            return true
          }
          return false
        })

        if (toDelete.length > 0) {
          await s3.send(new DeleteObjectsCommand({
            Bucket: BUCKET,
            Delete: { Objects: toDelete.map((Key) => ({ Key })) },
          }))
          deletedCount += toDelete.length
          console.log(`${progress} Deleted ${toDelete.length} old size(s): ${toDelete.join(', ')}`)
        }

        console.log(`${progress} Done: ${originalFilename}`)
        successCount++

      } catch (err) {
        console.log(`${progress} Failed: ${mediaDoc.filename}`)
        errorCount++
        const errorMessage = err instanceof Error ? err.message : String(err)
        errors.push(`${mediaDoc.filename}: ${errorMessage}`)
      }
    }

    console.log(`Complete: ${successCount} success, ${errorCount} failed, ${deletedCount} old files deleted`)

    return NextResponse.json({
      success: true,
      processed: allDocs.length,
      successful: successCount,
      failed: errorCount,
      oldFilesDeleted: deletedCount,
      errors,
    })

  } catch (err) {
    console.error('Regeneration failed:', err)
    const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
