import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3'

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

// Matches generated size variants like "image-480x318.webp" or "image-3660x2431.webp"
const SIZE_VARIANT_PATTERN = /-\d+x\d+\.[a-z]+$/i

export async function GET(req: NextRequest) {
  const dry = req.nextUrl.searchParams.get('dry') !== 'false'  // dry=true by default
  return run(dry)
}

export async function POST(req: NextRequest) {
  const dry = req.nextUrl.searchParams.get('dry') !== 'false'
  return run(dry)
}

async function run(dry: boolean) {
  console.log(`Starting orphan cleanup... (${dry ? 'DRY RUN — pass ?dry=false to delete' : 'LIVE'})`)

  try {
    const payload = await getPayload({ config })

    // 1. Collect all filenames referenced in the DB (originals + all current sizes)
    const referencedFilenames = new Set<string>()
    let page = 1

    while (true) {
      const batch = await payload.find({ collection: 'media', depth: 0, limit: 100, page })
      for (const doc of batch.docs) {
        if (doc.filename) referencedFilenames.add(doc.filename)
        const sizes = doc.sizes as Record<string, { filename?: string }> | undefined
        if (sizes) {
          for (const s of Object.values(sizes)) {
            if (s?.filename) referencedFilenames.add(s.filename)
          }
        }
      }
      if (!batch.hasNextPage) break
      page++
    }

    console.log(`DB references ${referencedFilenames.size} filenames`)

    // 2. List all objects in the bucket
    const allKeys: string[] = []
    let continuationToken: string | undefined

    while (true) {
      const res = await s3.send(new ListObjectsV2Command({
        Bucket: BUCKET,
        ContinuationToken: continuationToken,
      }))

      for (const obj of res.Contents ?? []) {
        if (obj.Key) allKeys.push(obj.Key)
      }

      if (!res.IsTruncated) break
      continuationToken = res.NextContinuationToken
    }

    console.log(`Bucket contains ${allKeys.length} objects`)

    // 3. Find orphaned size variants: matches pattern but not referenced in DB
    const orphans = allKeys.filter(
      (key) => SIZE_VARIANT_PATTERN.test(key) && !referencedFilenames.has(key)
    )

    console.log(`Found ${orphans.length} orphaned size variants`)

    if (dry) {
      return NextResponse.json({
        dryRun: true,
        bucketObjects: allKeys.length,
        referencedFilenames: referencedFilenames.size,
        wouldDelete: orphans.length,
        orphans,
      })
    }

    // 4. Delete in batches of 1000 (S3 limit)
    let deletedCount = 0
    for (let i = 0; i < orphans.length; i += 1000) {
      const chunk = orphans.slice(i, i + 1000)
      await s3.send(new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: { Objects: chunk.map((Key) => ({ Key })) },
      }))
      deletedCount += chunk.length
      console.log(`Deleted ${deletedCount}/${orphans.length}`)
    }

    return NextResponse.json({
      dryRun: false,
      deleted: deletedCount,
    })

  } catch (err) {
    console.error('Cleanup failed:', err)
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
