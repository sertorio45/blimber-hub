import type { CmsBlock } from '~/lib/cms/contracts'

import { getBlockDefinition } from './registry'

const ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '\'': '&#39;',
}

/** Escapes text before it is interpolated into public HTML. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, char => ESCAPE[char] ?? char)
}

function stripScripts(html: string): string {
  const lower = html.toLowerCase()
  let result = ''
  let index = 0
  while (index < html.length) {
    const start = lower.indexOf('<script', index)
    if (start === -1) {
      result += html.slice(index)
      break
    }
    result += html.slice(index, start)
    const end = lower.indexOf('</script>', start)
    index = end === -1 ? html.length : end + '</script>'.length
  }
  return result
}

/**
 * Minimal rich-text pass used until the public site owns a sanitizer.
 * Drops scripts and inline event handlers; the editor stores the source.
 */
export function sanitizeRichHtml(value: unknown): string {
  return stripScripts(String(value ?? ''))
    .replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript\s*:/gi, '')
}

function safeHref(value: unknown): string | null {
  const href = String(value ?? '').trim()
  if (!href)
    return null
  if (href.startsWith('/') && !href.startsWith('//'))
    return escapeHtml(href)
  if (/^https?:\/\//i.test(href))
    return escapeHtml(href)
  return null
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function asList(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value))
    return []
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
}

function linkHtml(value: unknown, className: string): string {
  const link = asRecord(value)
  const href = safeHref(link.href)
  const label = escapeHtml(link.label).trim()
  if (!href || !label)
    return ''
  return `<a class="${className}" href="${href}">${label}</a>`
}

function renderKnown(type: string, props: Record<string, unknown>, childrenHtml: string): string {
  switch (type) {
    case 'section':
      return `<section data-block="section" data-width="${escapeHtml(props.width)}" data-background="${escapeHtml(props.background)}">${childrenHtml}</section>`
    case 'hero': {
      const title = escapeHtml(props.title)
      const subtitle = escapeHtml(props.subtitle)
      const actions = [linkHtml(props.primaryCta, 'cms-btn'), linkHtml(props.secondaryCta, 'cms-btn-secondary')].filter(Boolean).join('')
      return `<header data-block="hero"><p>${escapeHtml(props.eyebrow)}</p><h1>${title}</h1><p>${subtitle}</p>${actions}</header>`
    }
    case 'richText':
      return `<div data-block="richText">${sanitizeRichHtml(props.html)}</div>`
    case 'imageText':
      return `<article data-block="imageText" data-image-position="${escapeHtml(props.imagePosition)}"><h2>${escapeHtml(props.title)}</h2><p>${escapeHtml(props.body)}</p></article>`
    case 'cards':
      return `<section data-block="cards" data-columns="${escapeHtml(props.columns)}"><h2>${escapeHtml(props.title)}</h2><ul>${asList(props.items).map((item) => {
        const href = safeHref(item.href)
        const title = escapeHtml(item.title)
        const link = href && title.trim() ? `<a href="${href}">${title}</a>` : `<h3>${title}</h3>`
        return `<li>${link}<p>${escapeHtml(item.description)}</p></li>`
      }).join('')}</ul></section>`
    case 'faq':
      return `<section data-block="faq"><h2>${escapeHtml(props.title)}</h2>${asList(props.items).map(item => `<details><summary>${escapeHtml(item.question)}</summary><p>${escapeHtml(item.answer)}</p></details>`).join('')}</section>`
    case 'cta': {
      const href = safeHref(props.buttonHref)
      const label = escapeHtml(props.buttonLabel)
      const button = href && label.trim() ? `<a href="${href}">${label}</a>` : ''
      return `<aside data-block="cta" data-tone="${escapeHtml(props.tone)}"><h2>${escapeHtml(props.title)}</h2><p>${escapeHtml(props.description)}</p>${button}</aside>`
    }
    case 'gallery':
      return `<section data-block="gallery" data-columns="${escapeHtml(props.columns)}"><h2>${escapeHtml(props.title)}</h2><ul>${asList(props.images).map(item => `<li>${escapeHtml(item.caption)}</li>`).join('')}</ul></section>`
    case 'testimonials':
      return `<section data-block="testimonials"><h2>${escapeHtml(props.title)}</h2>${asList(props.items).map(item => `<blockquote><p>${escapeHtml(item.quote)}</p><footer>${escapeHtml(item.author)}</footer></blockquote>`).join('')}</section>`
    case 'latestPublications':
      return `<section data-block="latestPublications" data-type="${escapeHtml(props.publicationType)}" data-limit="${escapeHtml(props.limit)}"><h2>${escapeHtml(props.title)}</h2></section>`
    default:
      return childrenHtml
  }
}

/** Renders one block. Unknown types are skipped so a public page can still ship. */
export function renderBlock(block: CmsBlock): string {
  const definition = getBlockDefinition(block.type)
  if (!definition)
    return ''
  const parsed = definition.propsSchema.safeParse(block.props ?? {})
  const props = parsed.success ? parsed.data as Record<string, unknown> : definition.defaults
  const childrenHtml = (block.children ?? []).map(child => renderBlock(child)).join('')
  return renderKnown(definition.id, props, childrenHtml)
}

/** Public HTML for a page tree. The site runtime can replace `latestPublications` later. */
export function renderBlocks(blocks: CmsBlock[]): string {
  return blocks.map(block => renderBlock(block)).join('')
}
