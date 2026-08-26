import { describe, expect, it } from 'vitest'

import {
  hasFileDragPayload,
  isAcceptedMediaFile,
  mediaFileAcceptAttr,
  mediaFileRejectMessage,
} from '~/utils/file-drop'

function file(name: string, type: string): File {
  return new File(['x'], name, { type })
}

describe('file-drop', () => {
  it('detects Files drag payload', () => {
    expect(hasFileDragPayload({ dataTransfer: { types: ['Files'] } } as DragEvent)).toBe(true)
    expect(hasFileDragPayload({ dataTransfer: { types: ['text/plain'] } } as DragEvent)).toBe(false)
    expect(hasFileDragPayload({ dataTransfer: null } as DragEvent)).toBe(false)
  })

  it('accepts publication images and videos', () => {
    expect(isAcceptedMediaFile(file('a.jpg', 'image/jpeg'), 'publication')).toBe(true)
    expect(isAcceptedMediaFile(file('a.mp4', 'video/mp4'), 'publication')).toBe(true)
    expect(isAcceptedMediaFile(file('a.mov', 'video/quicktime'), 'publication')).toBe(true)
    expect(isAcceptedMediaFile(file('a.pdf', 'application/pdf'), 'publication')).toBe(false)
  })

  it('accepts reference PDF and falls back to extension', () => {
    expect(isAcceptedMediaFile(file('brief.pdf', 'application/pdf'), 'reference')).toBe(true)
    expect(isAcceptedMediaFile(file('shot.PNG', ''), 'publication')).toBe(true)
    expect(isAcceptedMediaFile(file('clip.MOV', ''), 'reference')).toBe(true)
    expect(isAcceptedMediaFile(file('notes.docx', ''), 'reference')).toBe(false)
  })

  it('exposes accept attrs and reject copy', () => {
    expect(mediaFileAcceptAttr('publication')).toContain('image/*')
    expect(mediaFileAcceptAttr('reference')).toContain('application/pdf')
    expect(mediaFileRejectMessage('publication')).toMatch(/peças finais/i)
  })
})
