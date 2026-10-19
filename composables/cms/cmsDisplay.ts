import type { CmsDocumentKind, CmsPublicationType, CmsPublicStatus, CmsRevision, CmsSite } from '~/lib/cms/contracts'

import { CMS_LIMITS } from '~/lib/cms/contracts'

export const CMS_PUBLICATION_TYPE_LABELS: Record<CmsPublicationType, string> = {
  article: 'Artigo',
  news: 'Notícia',
}

export const CMS_PUBLICATION_TYPE_HINTS: Record<CmsPublicationType, string> = {
  article: 'Conteúdo aprofundado e atemporal, como guias, análises e opiniões.',
  news: 'Fato recente com data, ideal para comunicados e novidades.',
}

export const CMS_KIND_LABELS: Record<CmsDocumentKind, string> = {
  page: 'Página',
  publication: 'Publicação',
}

export const CMS_REVISION_REASON_LABELS: Record<CmsRevision['reason'], string> = {
  checkpoint: 'Ponto de salvamento',
  review: 'Enviado para revisão',
  publish: 'Publicação',
  restore: 'Restauração',
}

export interface CmsStatusDisplay {
  label: string
  tone: 'neutral' | 'success' | 'warning' | 'muted'
}

export function cmsStatusDisplay(status: CmsPublicStatus, hasUnpublishedChanges = false): CmsStatusDisplay {
  if (status === 'published') {
    return hasUnpublishedChanges
      ? { label: 'Publicado · com alterações', tone: 'warning' }
      : { label: 'Publicado', tone: 'success' }
  }
  if (status === 'withdrawn')
    return { label: 'Retirado do ar', tone: 'muted' }
  return { label: 'Rascunho', tone: 'neutral' }
}

const DEFAULT_ROUTE_PREFIXES: Record<CmsPublicationType, string> = {
  article: 'artigos',
  news: 'noticias',
}

/** Route prefixes live in `site.settings.routes.{article,news}`; unset values fall back to pt-BR defaults. */
export function cmsRoutePrefixes(site: CmsSite | null | undefined): Record<CmsPublicationType, string> {
  const routes = (site?.settings as { routes?: Partial<Record<CmsPublicationType, unknown>> } | undefined)?.routes
  const read = (type: CmsPublicationType) => {
    const value = routes?.[type]
    return typeof value === 'string' && value.trim() ? value.trim().replace(/^\/+|\/+$/g, '') : DEFAULT_ROUTE_PREFIXES[type]
  }
  return { article: read('article'), news: read('news') }
}

export function cmsPathPrefix(
  kind: CmsDocumentKind,
  publicationType: CmsPublicationType | null | undefined,
  site: CmsSite | null | undefined,
): string {
  if (kind === 'page' || !publicationType)
    return '/'
  return `/${cmsRoutePrefixes(site)[publicationType]}/`
}

/** Slug while typing: keeps a trailing hyphen so "minha-" can become "minha-pagina". */
export function cmsSlugDraft(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, CMS_LIMITS.maxSlugLength)
}

export function cmsSlugify(value: string): string {
  return cmsSlugDraft(value).replace(/-+$/, '')
}

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatCmsDateTime(value: string | null | undefined): string {
  if (!value)
    return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : dateTimeFormatter.format(date)
}

const relativeFormatter = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

export function formatCmsRelative(value: string | Date | null | undefined, now = Date.now()): string {
  if (!value)
    return '—'
  const date = value instanceof Date ? value : new Date(value)
  const diffSeconds = Math.round((date.getTime() - now) / 1000)
  const abs = Math.abs(diffSeconds)
  if (abs < 45)
    return 'agora'
  if (abs < 3600)
    return relativeFormatter.format(Math.round(diffSeconds / 60), 'minute')
  if (abs < 86_400)
    return relativeFormatter.format(Math.round(diffSeconds / 3600), 'hour')
  if (abs < 86_400 * 7)
    return relativeFormatter.format(Math.round(diffSeconds / 86_400), 'day')
  return formatCmsDateTime(date.toISOString())
}

const FIELD_REASON_MESSAGES: Record<string, string> = {
  taken: 'Este valor já está em uso.',
  published: 'O tipo de uma publicação já publicada não pode ser alterado.',
  not_allowed: 'Este campo não pode ser usado aqui.',
  not_found: 'Registro não encontrado.',
  unknown_term: 'Uma das categorias ou tags não pertence a este site.',
  unknown_author: 'Autor não encontrado neste site.',
  unknown_asset: 'A imagem de capa não foi encontrada nesta empresa.',
}

/** Zod's default English messages, replaced so the form stays in Portuguese. */
const ENGLISH_ZOD = /^(?:String |Number |Expected |Invalid |Required|Too (?:big|small)|Unrecognized)/

const FIELD_HINTS: Record<string, string> = {
  'title': 'Informe um título.',
  'slug': 'Use apenas letras minúsculas, números e hífens.',
  'excerpt': 'Revise o resumo.',
  'body': 'Revise o conteúdo.',
  'publicationType': 'Escolha Artigo ou Notícia.',
  'sourceName': 'Revise o nome da fonte.',
  'sourceUrl': 'Informe uma URL válida.',
  'eventDate': 'Informe uma data válida.',
  'seo': 'Revise os campos de SEO.',
  'seo.title': 'Revise o título de SEO.',
  'seo.description': 'Revise a descrição de SEO.',
  'seo.canonicalUrl': 'Informe uma URL canônica válida.',
  'canonicalUrl': 'Informe uma URL canônica válida.',
  'siteKey': 'Use de 3 a 64 caracteres: letras minúsculas, números e hífens.',
  'name': 'Informe um nome.',
  'authorId': 'Escolha um autor deste site.',
  'termIds': 'Revise as categorias e tags.',
  'cover': 'Escolha uma imagem da biblioteca.',
  'bio': 'Revise a biografia.',
  'kind': 'Escolha categoria ou tag.',
}

function fieldText(key: string, message: unknown): string | undefined {
  const text = typeof message === 'string'
    ? message
    : Array.isArray(message)
      ? message.find((item): item is string => typeof item === 'string')
      : undefined
  if (!text)
    return undefined
  const reason = FIELD_REASON_MESSAGES[text]
  if (reason)
    return reason
  const hint = FIELD_HINTS[key]
  return hint && ENGLISH_ZOD.test(text) ? hint : text
}

/**
 * Field errors from a 422 `details`. The server may send a Zod `flatten()`
 * (`fieldErrors`), a list of issues (`issues` / array), a `fields` map or a
 * single `{ field, reason }`. Paths under `payload.` are unwrapped so the
 * editor can mark `title` / `seo.title`.
 */
export function cmsFieldErrors(details: unknown, fallbackMessage?: string): Record<string, string> {
  const result: Record<string, string> = {}
  if (!details || typeof details !== 'object')
    return result

  const assign = (path: unknown, message: unknown) => {
    const rawKey = Array.isArray(path) ? path.map(String).join('.') : String(path ?? '')
    const key = rawKey.replace(/^payload\./, '')
    const text = fieldText(key, message)
    if (key && text && !result[key])
      result[key] = text
  }

  const record = details as Record<string, unknown>
  const issues = Array.isArray(details) ? details : Array.isArray(record.issues) ? record.issues : null
  if (issues) {
    for (const issue of issues as Array<{ path?: unknown, field?: unknown, message?: unknown, reason?: unknown }>)
      assign(issue.path ?? issue.field, issue.message ?? issue.reason)
  }

  const fieldErrors = record.fieldErrors ?? record.fields
  if (fieldErrors && typeof fieldErrors === 'object' && !Array.isArray(fieldErrors)) {
    for (const [key, value] of Object.entries(fieldErrors as Record<string, unknown>))
      assign(key, value)
  }

  if (typeof record.field === 'string' && !result[record.field]) {
    const reason = typeof record.reason === 'string' ? FIELD_REASON_MESSAGES[record.reason] : undefined
    const message = typeof record.message === 'string' ? record.message : reason ?? fallbackMessage
    if (message)
      assign(record.field, message)
  }

  return result
}
