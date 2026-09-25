import type { MetaGraphFetch } from './types'
import { metaGraphUrl } from './graph'
import { MetaAdsToolError } from './types'

/** Only Instagram post/reel permalinks; never fetch an input URL directly. */
export function instagramPostShortcode(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  }
  catch {
    throw new MetaAdsToolError('INSTAGRAM_PERMALINK_INVALID', 'Informe o link completo de uma publicação do Instagram.', 400)
  }
  const match = url.pathname.match(/^\/(p|reel|tv)\/([\w-]+)\/?$/)
  if (url.protocol !== 'https:'
    || !['instagram.com', 'www.instagram.com'].includes(url.hostname.toLowerCase())
    || url.username || url.password || url.port || !match) {
    throw new MetaAdsToolError('INSTAGRAM_PERMALINK_INVALID', 'Use um permalink https://www.instagram.com/p/… ou /reel/… do Instagram.', 400)
  }
  return match[2]!
}

interface InstagramMedia {
  id?: unknown
  permalink?: unknown
  media_type?: unknown
  username?: unknown
  owner?: { id?: unknown } | null
}

export interface OwnedInstagramMedia {
  id: string
  permalink: string | null
  mediaType: string | null
}

/** Read-only ownership check against the tenant's connected IG account, before any AdCreative POST. */
export async function resolveOwnedInstagramMedia(input: {
  apiVersion: string
  accessToken: string
  instagramUserId: string
  mediaId?: string
  permalink?: string
  graph: MetaGraphFetch
}): Promise<OwnedInstagramMedia> {
  const query = { access_token: input.accessToken }
  const account = await input.graph(metaGraphUrl(input.apiVersion, `/${input.instagramUserId}`), {
    query: { ...query, fields: 'id,username' },
  })
  if (String(account?.id || '') !== input.instagramUserId) {
    throw new MetaAdsToolError('INSTAGRAM_ACCOUNT_MISMATCH', 'Conta Instagram conectada não está acessível pelo token Meta do tenant.', 403)
  }

  let media: InstagramMedia | null = null
  if (input.mediaId) {
    media = await input.graph(metaGraphUrl(input.apiVersion, `/${input.mediaId}`), {
      query: { ...query, fields: 'id,permalink,media_type,username,owner' },
    })
    if (String(media?.id || '') !== input.mediaId) {
      throw new MetaAdsToolError('INSTAGRAM_MEDIA_NOT_FOUND', 'Publicação do Instagram não encontrada.', 404)
    }
  }
  else if (input.permalink) {
    const shortcode = instagramPostShortcode(input.permalink)
    let after: string | undefined
    // Graph has no reliable direct permalink → media ID endpoint. Search only this account's media.
    for (let page = 0; page < 10; page++) {
      const response = await input.graph(metaGraphUrl(input.apiVersion, `/${input.instagramUserId}/media`), {
        query: {
          ...query,
          fields: 'id,permalink,media_type,username,owner',
          limit: 100,
          ...(after ? { after } : {}),
        },
      })
      const items: InstagramMedia[] = Array.isArray(response?.data) ? response.data : []
      media = items.find((item) => {
        try {
          return typeof item.permalink === 'string' && instagramPostShortcode(item.permalink) === shortcode
        }
        catch {
          return false
        }
      }) || null
      if (media)
        break
      const next = response?.paging?.cursors?.after
      if (!items.length || typeof next !== 'string' || !next || next === after || next.length > 256)
        break
      after = next
    }
  }

  if (!media?.id) {
    throw new MetaAdsToolError(
      'INSTAGRAM_MEDIA_NOT_FOUND',
      'Publicação não encontrada nas mídias da conta conectada. Se for antiga, informe instagramMediaId.',
      404,
    )
  }
  const ownerId = media.owner?.id ? String(media.owner.id) : null
  const accountUsername = String(account.username || '').toLowerCase()
  const mediaUsername = String(media.username || '').toLowerCase()
  // An explicit foreign owner always wins; missing owner may be checked via Graph usernames.
  if ((ownerId && ownerId !== input.instagramUserId)
    || (!ownerId && (!accountUsername || mediaUsername !== accountUsername))) {
    throw new MetaAdsToolError('INSTAGRAM_MEDIA_OWNERSHIP', 'Publicação não pertence ao Instagram conectado ao tenant.', 403)
  }
  return {
    id: String(media.id),
    permalink: typeof media.permalink === 'string' ? media.permalink : null,
    mediaType: typeof media.media_type === 'string' ? media.media_type : null,
  }
}
