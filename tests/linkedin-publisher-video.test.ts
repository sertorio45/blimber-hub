import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/server/utils/marketing', () => ({
  decryptSecret: vi.fn(() => 'li-token'),
}))

vi.mock('~/utils/social-hashtags', () => ({
  buildCaptionWithHashtags: vi.fn((caption: string) => caption || ''),
}))

const fetchMock = vi.fn()
vi.stubGlobal('$fetch', Object.assign(fetchMock, { raw: vi.fn() }))

describe('publishToLinkedin video', () => {
  beforeEach(() => {
    vi.resetModules()
    fetchMock.mockReset()
    ;($fetch as any).raw.mockReset()
  })

  it('uploads MP4 via Videos API then creates the post', async () => {
    const binary = new ArrayBuffer(80 * 1024)
    const client = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { config: { access_token_enc: 'enc' } },
        }),
      })),
      storage: {
        from: vi.fn(() => ({
          createSignedUrl: vi.fn().mockResolvedValue({
            data: { signedUrl: 'https://storage.example/video.mp4' },
          }),
        })),
      },
    }

    fetchMock
      .mockResolvedValueOnce(binary) // download from storage
      .mockResolvedValueOnce({
        value: {
          video: 'urn:li:video:VID1',
          uploadToken: '',
          uploadInstructions: [{
            uploadUrl: 'https://www.linkedin.com/dms-uploads/part-1',
            firstByte: 0,
            lastByte: binary.byteLength - 1,
          }],
        },
      }) // initializeUpload
      .mockResolvedValueOnce({}) // finalizeUpload
      .mockResolvedValueOnce({ status: 'AVAILABLE' }) // poll video

    ;($fetch as any).raw
      .mockResolvedValueOnce({
        headers: { get: (name: string) => name.toLowerCase() === 'etag' ? '"etag-part-1"' : null },
      }) // part PUT
      .mockResolvedValueOnce({
        headers: { get: (name: string) => name.toLowerCase() === 'x-restli-id' ? 'urn:li:share:POST1' : null },
      }) // create post

    const { publishToLinkedin } = await import('~/server/utils/social-publishers/linkedin-publisher')
    const result = await publishToLinkedin({
      client,
      tenantId: 't1',
      account: { external_account_id: 'org-9' },
      variant: { caption: 'Olá vídeo', hashtags: [] },
      assets: [{
        name: 'clip.mp4',
        mime_type: 'video/mp4',
        object_path: 'tenant/clip.mp4',
      }],
    })

    expect(result.externalPostId).toBe('urn:li:share:POST1')

    const initializeCall = fetchMock.mock.calls.find(call =>
      String(call[0]).includes('/rest/videos?action=initializeUpload'),
    )
    expect(initializeCall?.[1]?.body?.initializeUploadRequest).toMatchObject({
      owner: 'urn:li:organization:org-9',
      fileSizeBytes: binary.byteLength,
      uploadCaptions: false,
      uploadThumbnail: false,
    })

    const partPut = ($fetch as any).raw.mock.calls[0]
    expect(partPut[0]).toBe('https://www.linkedin.com/dms-uploads/part-1')
    expect(partPut[1].headers.Authorization).toBeUndefined()

    const createPost = ($fetch as any).raw.mock.calls[1]
    expect(createPost[1].body.content.media).toEqual({
      id: 'urn:li:video:VID1',
      title: 'clip',
    })
  })
})
