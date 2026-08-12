/** Normalize a single hashtag token (always prefixed with #). */
export function normalizeHashtag(tag: string): string {
  const trimmed = tag.trim()
  if (!trimmed)
    return ''
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`
}

/** Parse raw hashtag text into a deduplicated list (max 30). */
export function parseHashtags(raw: string): string[] {
  return [...new Set(
    raw
      .split(/[\s,]+/)
      .map(token => token.trim())
      .filter(Boolean)
      .map(normalizeHashtag)
      .slice(0, 30),
  )]
}

/** Join hashtags inline with a single space (Meta-style). */
export function formatHashtagsInline(tags: string[] | undefined | null): string {
  return (tags || [])
    .map(normalizeHashtag)
    .filter(Boolean)
    .join(' ')
}

/** Build full post text with caption and inline hashtags. */
export function buildCaptionWithHashtags(
  caption: string | undefined | null,
  hashtags: string[] | undefined | null,
): string {
  const body = (caption || '').trimEnd()
  const tags = formatHashtagsInline(hashtags)
  if (!body)
    return tags
  if (!tags)
    return body
  return `${body} ${tags}`
}
