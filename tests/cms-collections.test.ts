import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { cmsCollectionSchemaSchema } from '~/lib/cms/contracts'
import { coerceEntryPayload } from '~/server/utils/cms/collections'

const ASSET_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const schema = cmsCollectionSchemaSchema.parse({
  version: 1,
  fields: [
    { key: 'titulo', label: 'Título', type: 'text', required: true },
    { key: 'preco', label: 'Preço', type: 'number', required: false },
    { key: 'destaque', label: 'Destaque', type: 'boolean', required: false },
    { key: 'capa', label: 'Capa', type: 'media', required: false },
  ],
})

function statusOf(error: unknown): number {
  return (error as { statusCode?: number }).statusCode ?? 0
}

describe('coleções', () => {
  it('aceita texto, número, booleano e referência de mídia', () => {
    expect(coerceEntryPayload(schema, {
      titulo: 'Olá',
      preco: 12.5,
      destaque: true,
      capa: { assetId: ASSET_ID, alt: 'Capa' },
      extra: 'ignorado',
    })).toEqual({
      titulo: 'Olá',
      preco: 12.5,
      destaque: true,
      capa: { assetId: ASSET_ID, alt: 'Capa' },
    })
  })

  it('recusa campo obrigatório vazio, número inválido e mídia sem arquivo', () => {
    expect(() => coerceEntryPayload(schema, { titulo: '' })).toThrow()
    expect(() => coerceEntryPayload(schema, { titulo: 'Ok', preco: '12' })).toThrow()
    expect(() => coerceEntryPayload(schema, { titulo: 'Ok', capa: { url: 'https://cdn.example/a.jpg' } })).toThrow()
    try {
      coerceEntryPayload(schema, { titulo: 'Ok', preco: '12' })
    }
    catch (error) {
      expect(statusOf(error)).toBe(422)
    }
  })

  it('a migração cria as tabelas com RLS por tenant e semeia cms.schemas.manage', () => {
    const sql = readFileSync(
      fileURLToPath(new URL('../supabase/migrations/20261019140000_cms_collections.sql', import.meta.url)),
      'utf8',
    )
    expect(sql).toContain('CREATE TABLE public.cms_collection_definitions')
    expect(sql).toContain('CREATE TABLE public.cms_entries')
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('private.user_has_tenant_access(tenant_id)')
    expect(sql).toContain('schema->>\'version\' = \'1\'')
    expect(sql).toContain('\'cms.schemas.manage\'')
    expect(sql).not.toContain('\'atendente\'')
  })
})
