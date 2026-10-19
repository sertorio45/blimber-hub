import type { CmsDocumentKind } from '~/lib/cms/contracts'

import { computed } from 'vue'

import { useWorkspace } from '~/composables/useWorkspace'

/**
 * UI gating only: hides what the member cannot do. Every endpoint re-checks the
 * same capabilities server-side.
 */
export function useCmsAccess() {
  const workspace = useWorkspace()
  const can = workspace.can

  /** Capabilities arrive with the workspace context; until then nothing is hidden or shown prematurely. */
  const ready = computed(() => workspace.context.value !== null)

  const canRead = computed(() => can('cms.read'))
  const canPublish = computed(() => can('cms.publish'))
  const canManageSettings = computed(() => can('cms.settings.manage'))
  const canManageSchemas = computed(() => can('cms.schemas.manage'))
  const canReadMedia = computed(() => can('cms.media.read'))
  const canUploadMedia = computed(() => can('cms.media.upload'))
  const canDeleteMedia = computed(() => can('cms.media.delete'))

  function canCreate(kind: CmsDocumentKind) {
    return can(kind === 'page' ? 'cms.pages.create' : 'cms.publications.create')
  }

  function canUpdate(kind: CmsDocumentKind) {
    return can(kind === 'page' ? 'cms.pages.update' : 'cms.publications.update')
  }

  function canDelete(kind: CmsDocumentKind) {
    return can(kind === 'page' ? 'cms.pages.delete' : 'cms.publications.delete')
  }

  return {
    ready,
    canRead,
    canPublish,
    canManageSettings,
    canManageSchemas,
    canReadMedia,
    canUploadMedia,
    canDeleteMedia,
    canCreate,
    canUpdate,
    canDelete,
  }
}
