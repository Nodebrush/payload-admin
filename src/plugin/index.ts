import type { Config, Plugin } from 'payload'
import { ContentReviewNotes } from '@payload-admin/collections/ContentReviewNotes'
import { draftProtectionPlugin } from '@payload-admin/plugins/draftProtectionPlugin'

/**
 * Payload Admin plugin bundle — injects all collections, globals, and
 * behaviour plugins used by the payload-admin submodule.
 *
 * Applied in payload.config.ts (admin only). The frontend uses push: false
 * so it never touches schema and doesn't need these plugins.
 *
 * Add new collections/plugins here to have them propagate to all projects
 * that use this submodule — just update the submodule pointer.
 */
export function payloadAdminPlugin(): Plugin {
  return async (config: Config): Promise<Config> => {
    let result = await draftProtectionPlugin()(config)
    result = {
      ...result,
      collections: [...(result.collections ?? []), ContentReviewNotes],
    }
    return result
  }
}
