import type { Config, Plugin } from 'payload'
import { getUserRole } from '@payload-admin/access/roles'

/**
 * Payload plugin that blocks publishing for users with the `contributor` role
 * across every collection and global that has draft mode enabled.
 *
 * Uses a beforeOperation hook — the earliest possible interception point,
 * before field processing, access checks, or beforeChange hooks run.
 * Throws an error if a contributor attempts to set _status: 'published'.
 *
 * Admins and editors are unaffected and can publish freely.
 */
export const draftProtectionPlugin = (): Plugin => (incomingConfig: Config): Config => {
    const hasDrafts = (versions: any): boolean => {
        if (!versions) return false
        if (typeof versions === 'object' && versions.drafts) return true
        return false
    }

    const blockContributorPublish = async ({ args, operation, req }: any) => {
        if (
            req.user &&
            getUserRole(req.user) === 'contributor' &&
            (operation === 'update' || operation === 'create') &&
            args?.data?._status === 'published'
        ) {
            throw new Error('Contributors can only save drafts — publishing is not allowed.')
        }
        return args
    }

    return {
        ...incomingConfig,
        collections: incomingConfig.collections?.map(collection => {
            if (!hasDrafts(collection.versions)) return collection
            return {
                ...collection,
                hooks: {
                    ...collection.hooks,
                    beforeOperation: [
                        blockContributorPublish,
                        ...(collection.hooks?.beforeOperation ?? []),
                    ],
                },
            }
        }),
        globals: incomingConfig.globals?.map(global => {
            if (!hasDrafts(global.versions)) return global
            return {
                ...global,
                hooks: {
                    ...global.hooks,
                    beforeOperation: [
                        blockContributorPublish,
                        ...(global.hooks?.beforeOperation ?? []),
                    ],
                },
            }
        }),
    }
}
