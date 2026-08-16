import { describe, expect, it } from 'vitest'
import {
  clientPortalPostsListQuery,
  includeClientPortalBoardItem,
} from '~/utils/marketing-client-content'

describe('clientPortalPostsListQuery', () => {
  it('does not exclude drafts for agency staff', () => {
    expect(clientPortalPostsListQuery({
      isClientExperience: false,
      mvpStatus: 'all',
    })).toEqual({})
  })

  it('excludes editorial drafts on the default Publicações list', () => {
    expect(clientPortalPostsListQuery({
      isClientExperience: true,
      mvpStatus: 'all',
    })).toEqual({ exclude_editorial_status: 'draft' })
  })

  it('keeps excluding drafts when the client filters a non-draft MVP status', () => {
    expect(clientPortalPostsListQuery({
      isClientExperience: true,
      mvpStatus: 'agendado',
    })).toEqual({ exclude_editorial_status: 'draft' })
  })

  it('does not exclude drafts when the client explicitly filters Rascunho', () => {
    expect(clientPortalPostsListQuery({
      isClientExperience: true,
      mvpStatus: 'rascunho',
    })).toEqual({})
  })
})

describe('includeClientPortalBoardItem', () => {
  it('hides rascunho on the default client list', () => {
    expect(includeClientPortalBoardItem('rascunho', {
      isClientExperience: true,
      mvpStatusFilter: 'all',
    })).toBe(false)
    expect(includeClientPortalBoardItem('aprovacao', {
      isClientExperience: true,
      mvpStatusFilter: 'all',
    })).toBe(true)
    expect(includeClientPortalBoardItem('agendado', {
      isClientExperience: true,
      mvpStatusFilter: 'all',
    })).toBe(true)
    expect(includeClientPortalBoardItem('publicado', {
      isClientExperience: true,
      mvpStatusFilter: 'all',
    })).toBe(true)
  })

  it('shows drafts when the client picks Rascunho', () => {
    expect(includeClientPortalBoardItem('rascunho', {
      isClientExperience: true,
      mvpStatusFilter: 'rascunho',
    })).toBe(true)
    expect(includeClientPortalBoardItem('publicado', {
      isClientExperience: true,
      mvpStatusFilter: 'rascunho',
    })).toBe(false)
  })

  it('keeps drafts in the agency default list', () => {
    expect(includeClientPortalBoardItem('rascunho', {
      isClientExperience: false,
      mvpStatusFilter: 'all',
    })).toBe(true)
  })
})
