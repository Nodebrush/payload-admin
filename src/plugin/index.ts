import type { Config, Plugin } from 'payload'
import { ContentReviewNotes } from '@payload-admin/collections/ContentReviewNotes'
import { draftProtectionPlugin } from '@payload-admin/plugins/draftProtectionPlugin'
import { searchPlugin } from '@payload-admin/plugins/searchPlugin'

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
export interface PayloadAdminPluginOptions {
  /**
   * Enable the full-text search plugin (afterChange/afterDelete indexing
   * hooks + POST /api/reindex-search). Defaults to true. Set to false for
   * projects that don't want the search.search_index table.
   */
  search?: boolean
}

export function payloadAdminPlugin(options: PayloadAdminPluginOptions = {}): Plugin {
  const { search = true } = options
  return async (config: Config): Promise<Config> => {
    let result = await draftProtectionPlugin()(config)
    if (search) {
      result = await searchPlugin()(result)
    }
    result = {
      ...result,
      collections: [...(result.collections ?? []), ContentReviewNotes],
    }
    return result
  }
}
