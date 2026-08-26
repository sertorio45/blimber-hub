import type { MaybeRefOrGetter } from 'vue'
import { toValue } from 'vue'
import { hasFileDragPayload } from '~/utils/file-drop'

/**
 * Nested dragenter/leave counter so child nodes don't flicker the overlay.
 * Returns File[] from onDrop — caller filters MIME and uploads.
 */
export function useFileDropZone(options?: {
  disabled?: MaybeRefOrGetter<boolean>
}) {
  const isDragOver = ref(false)
  let dragDepth = 0

  function isDisabled(): boolean {
    return Boolean(toValue(options?.disabled))
  }

  function reset(): void {
    dragDepth = 0
    isDragOver.value = false
  }

  function onDragEnter(event: DragEvent): void {
    if (isDisabled() || !hasFileDragPayload(event))
      return
    event.preventDefault()
    dragDepth += 1
    isDragOver.value = true
  }

  function onDragOver(event: DragEvent): void {
    if (!hasFileDragPayload(event))
      return
    event.preventDefault()
    if (event.dataTransfer)
      event.dataTransfer.dropEffect = isDisabled() ? 'none' : 'copy'
  }

  function onDragLeave(event: DragEvent): void {
    if (!hasFileDragPayload(event))
      return
    event.preventDefault()
    dragDepth = Math.max(0, dragDepth - 1)
    if (dragDepth === 0)
      isDragOver.value = false
  }

  function onDrop(event: DragEvent): File[] {
    event.preventDefault()
    reset()
    if (isDisabled())
      return []
    return Array.from(event.dataTransfer?.files || [])
  }

  return {
    isDragOver,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    reset,
  }
}
