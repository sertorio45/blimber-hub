import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/server/utils/marketing', () => ({
  decryptSecret: vi.fn((value: string) => value ? `decrypted:${value}` : null),
}))

vi.mock('~/utils/social-hashtags', () => ({
  buildCaptionWithHashtags: vi.fn((caption: string) => caption || ''),
}))

vi.mock('~/lib/meta-ads/graph', () => ({
  resolveMetaGraphVersion: vi.fn(() => 'v25.0'),
}))

const fetchMock = vi.fn()
vi.stubGlobal('$fetch', fetchMock)

function integrationClient() {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          config: {
            page_access_token_enc: 'page-token',
            page_id: 'page-1',
          },
        },
      }),
    })),
    storage: {
      from: vi.fn(() => ({
        createSignedUrls: vi.fn().mockResolvedValue({
          data: [{ path: 'tenant/story.jpg', signedUrl: 'https://cdn.example/story.jpg' }],
          error: null,
        }),
      })),
    },
  }
}

function videoClient() {
  const client = integrationClient()
  client.storage.from = vi.fn(() => ({
    createSignedUrls: vi.fn().mockResolvedValue({
      data: [{ path: 'tenant/story.mp4', signedUrl: 'https://cdn.example/story.mp4' }],
      error: null,
    }),
  })) as any
  return client
}

describe('publishToMeta', () => {
  beforeEach(() => {
    vi.resetModules()
    fetchMock.mockReset()
  })

  it('publishes Instagram STORIES with image_url and returns permalink', async () => {
    fetchMock
      .mockResolvedValueOnce({ id: 'container-1' }) // create media
      .mockResolvedValueOnce({ status_code: 'FINISHED' }) // poll container
      .mockResolvedValueOnce({ id: 'ig-media-1' }) // media_publish
      .mockResolvedValueOnce({ permalink: 'https://instagram.com/stories/x/1' })

    const { publishToMeta } = await import('~/server/utils/social-publishers/meta-publisher')
    const result = await publishToMeta({
      client: integrationClient(),
      tenantId: 't1',
      account: { platform: 'instagram', external_account_id: '178414000' },
      variant: { format: 'story', caption: 'ignored', hashtags: [] },
      assets: [{ mime_type: 'image/jpeg', object_path: 'tenant/story.jpg' }],
    })

    expect(result.externalObjectType).toBe('instagram_story')
    expect(result.externalPostId).toBe('ig-media-1')
    expect(result.externalPostUrl).toBe('https://instagram.com/stories/x/1')

    const createCall = fetchMock.mock.calls[0]
    expect(String(createCall[0])).toContain('/178414000/media')
    expect(createCall[1].body).toMatchObject({
      media_type: 'STORIES',
      image_url: 'https://cdn.example/story.jpg',
    })
  })

  it('publishes Facebook photo_stories from an unpublished photo', async () => {
    fetchMock
      .mockResolvedValueOnce({ id: 'photo-99' }) // unpublished photo
      .mockResolvedValueOnce({ success: true, post_id: 'story-post-1' }) // photo_stories
      .mockResolvedValueOnce({
        data: [{ post_id: 'story-post-1', url: 'https://facebook.com/stories/1' }],
      })

    const { publishToMeta } = await import('~/server/utils/social-publishers/meta-publisher')
    const result = await publishToMeta({
      client: integrationClient(),
      tenantId: 't1',
      account: { platform: 'facebook', external_account_id: 'page-1' },
      variant: { format: 'story', caption: '', hashtags: [] },
      assets: [{ mime_type: 'image/jpeg', object_path: 'tenant/story.jpg' }],
    })

    expect(result.externalObjectType).toBe('facebook_story')
    expect(result.externalPostId).toBe('story-post-1')
    expect(result.externalPostUrl).toBe('https://facebook.com/stories/1')

    expect(fetchMock.mock.calls[0][1].body).toMatchObject({
      url: 'https://cdn.example/story.jpg',
      published: false,
    })
    expect(String(fetchMock.mock.calls[1][0])).toContain('/photo_stories')
  })

  it('polls Facebook video_stories status before finish', async () => {
    vi.useFakeTimers()
    try {
      fetchMock
        .mockResolvedValueOnce({
          video_id: 'vid-1',
          upload_url: 'https://rupload.facebook.com/video-upload/v25.0/vid-1',
        }) // start
        .mockResolvedValueOnce({ success: true }) // hosted upload
        .mockResolvedValueOnce({
          status: {
            video_status: 'processing',
            uploading_phase: { status: 'complete' },
            processing_phase: { status: 'not_started' },
          },
        }) // poll #1 still processing
        .mockResolvedValueOnce({
          status: {
            video_status: 'ready',
            uploading_phase: { status: 'complete' },
            processing_phase: { status: 'complete' },
          },
        }) // poll #2 ready
        .mockResolvedValueOnce({ success: true, post_id: 'fb-story-video-1' }) // finish
        .mockResolvedValueOnce({
          data: [{ post_id: 'fb-story-video-1', url: 'https://facebook.com/stories/v1' }],
        })

      const { publishToMeta } = await import('~/server/utils/social-publishers/meta-publisher')
      const publishPromise = publishToMeta({
        client: videoClient(),
        tenantId: 't1',
        account: { platform: 'facebook', external_account_id: 'page-1' },
        variant: { format: 'story', caption: '', hashtags: [] },
        assets: [{ mime_type: 'video/mp4', object_path: 'tenant/story.mp4' }],
      })

      await vi.advanceTimersByTimeAsync(3_000)
      const result = await publishPromise

      expect(result.externalPostId).toBe('fb-story-video-1')
      expect(result.externalPostUrl).toBe('https://facebook.com/stories/v1')

      const statusPolls = fetchMock.mock.calls.filter(call =>
        String(call[0]).includes('/vid-1') && call[1]?.query?.fields === 'status',
      )
      expect(statusPolls.length).toBeGreaterThanOrEqual(2)

      const finishCall = fetchMock.mock.calls.find(call =>
        String(call[0]).includes('/video_stories')
        && call[1]?.body?.upload_phase === 'finish',
      )
      expect(finishCall?.[1]?.body).toMatchObject({
        upload_phase: 'finish',
        video_id: 'vid-1',
      })
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('sets explicit IMAGE media_type for Instagram static posts', async () => {
    fetchMock
      .mockResolvedValueOnce({ id: 'container-img' })
      .mockResolvedValueOnce({ status_code: 'FINISHED' })
      .mockResolvedValueOnce({ id: 'ig-img-1' })
      .mockResolvedValueOnce({ permalink: 'https://instagram.com/p/abc' })

    const { publishToMeta } = await import('~/server/utils/social-publishers/meta-publisher')
    await publishToMeta({
      client: integrationClient(),
      tenantId: 't1',
      account: { platform: 'instagram', external_account_id: '178414000' },
      variant: { format: 'static', caption: 'Olá', hashtags: [] },
      assets: [{ mime_type: 'image/jpeg', object_path: 'tenant/story.jpg' }],
    })

    expect(fetchMock.mock.calls[0][1].body).toMatchObject({
      media_type: 'IMAGE',
      image_url: 'https://cdn.example/story.jpg',
      caption: 'Olá',
    })
  })
})

describe('throwMetaPublishError', () => {
  it('formats Graph error fields into statusMessage', async () => {
    const { throwMetaPublishError } = await import('~/server/utils/social-publishers/meta-publisher')
    expect(() => throwMetaPublishError({
      data: {
        error: {
          message: 'Invalid parameter',
          code: 100,
          error_subcode: 2207027,
          fbtrace_id: 'AbCdEf',
        },
      },
    }, 'fallback')).toThrowError(/Invalid parameter · código 100 · subcódigo 2207027 · fbtrace AbCdEf/)
  })
})
