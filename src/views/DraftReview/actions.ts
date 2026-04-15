'use server'

import { getPayload } from 'payload'
import config from '@payload-config'

export interface PublishResult {
  success: boolean
  error?: string
}

// Per-operation timeout so a stuck hook can't block forever
function withTimeout<T>(promise: Promise<T>, ms = 30_000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms / 1000}s`)), ms),
    ),
  ])
}

export async function publishDocument(
  collection: string,
  id: string,
): Promise<PublishResult> {
  try {
    const payload = await getPayload({ config })
    await withTimeout(
      payload.update({
        collection: collection as any,
        id,
        data: { _status: 'published' } as any,
        overrideAccess: true,
      }),
    )
    return { success: true }
  } catch (err) {
    console.error(`[DraftReview] Failed to publish ${collection}/${id}:`, err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

export async function publishGlobal(slug: string): Promise<PublishResult> {
  try {
    const payload = await getPayload({ config })
    await withTimeout(
      payload.updateGlobal({
        slug: slug as any,
        data: { _status: 'published' } as any,
        overrideAccess: true,
      }),
    )
    return { success: true }
  } catch (err) {
    console.error(`[DraftReview] Failed to publish global "${slug}":`, err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}
