# Meta WRITE — ETAPA 6 (Bulk delete) — concluída

**Data:** 2026-08-11  
**Plano:** [`gpt-blimber-meta-WRITE-PLAN.md`](./gpt-blimber-meta-WRITE-PLAN.md)  
**Status:** done (preview → execute; IDs explícitos; fim do plano write 0–6)  
**Pré-requisitos:** Etapas 0–5

---

## Objetivo

Exclusão/arquivamento em lote com **preview obrigatório**, `previewToken` (TTL), confirmações múltiplas e ownership por tenant/ad account. Sem delete por nome.

---

## Entregas

| Entrega | Onde |
|---------|------|
| Preview token HMAC + TTL | `lib/meta-ads/bulk-delete-preview.ts` + `META_GPT_BULK_PREVIEW_TTL_MS` |
| Tools | `meta_preview_bulk_delete`, `meta_execute_bulk_delete` |
| Rotas GPT REST | `bulk-delete/preview.post.ts`, `bulk-delete/execute.post.ts` |
| OpenAPI v1.7.0 | `gpt/blimber-meta/openapi.yaml` |
| Instruções + Skill | avisos fortes PT-BR |
| Doc | este arquivo |
| Testes | `meta-ads-tools`, `meta-write-guards`, `gpt-meta-openapi` |

### Tools

| Tool | Entrada | Mutação Graph? |
|------|---------|----------------|
| `meta_preview_bulk_delete` | `level` + `ids[]` (+ `deleteMode?`) | **Não** (só GET ownership) |
| `meta_execute_bulk_delete` | mesmos IDs + `previewToken` + `confirm` + `confirmTenantId` + `confirmDelete` + `dryRun` (default **true**) | Só com `dryRun: false` → `POST /{id}` `{ status: DELETED\|ARCHIVED }` |

- Limite: `META_GPT_BULK_MAX` (default 20) via `assertBulkItemLimit`.
- Levels: `campaign` | `adset` | `ad` (um nível por request).
- Default `deleteMode=DELETED`. `ARCHIVED` documentado como menos destrutivo.
- Execute: sequencial; `succeeded[]` / `failed[]`; audit por item + batch.

### Fluxo obrigatório

1. Listar IDs via tools de leitura  
2. `previewBulkDelete` → tabela nome/status/budget + `previewToken`  
3. Usuário confirma listando IDs no chat  
4. `executeBulkDelete` com `dryRun: false` + `confirmDelete: true`  

**Proibido:** apagar por nome/filtro sem lista explícita de IDs.

### Audit

| Ação | Quando |
|------|--------|
| `meta.gpt.bulk.delete.preview` | preview e execute com dryRun=true |
| `meta.gpt.bulk.delete` | cada item sucesso + resumo do batch |

---

## Critérios de aceite

- [x] Execute exige previewToken recente (mismatch/expirado → erro)  
- [x] Limite de itens enforced  
- [x] Ownership por ID; falha 403 se misturar ad accounts no execute  
- [x] Audit preview + execute  
- [x] Testes: preview sem POST Graph; limite; confirms; ownership; dryRun  
- [x] OpenAPI + Skill + instructions com avisos fortes  

---

## Como validar

```bash
pnpm test tests/meta-write-guards.test.ts tests/meta-ads-tools.test.ts tests/gpt-meta-openapi.test.ts
```

### Sandbox

1. Criar objetos de teste (etapas 2–4) ou usar IDs de sandbox  
2. Preview → conferir tabela  
3. Execute `dryRun: true` → nenhum status DELETED  
4. Execute `dryRun: false` só em objetos de teste; nunca produção sem janela acordada  

---

## O que NÃO foi feito

- Delete por filtro de nome  
- Job async / bulk > timeout Actions  
- Brand Context / IA  

**FIM DO PLANO WRITE (etapas 0–6).** Backlog (Advantage+, catalog, lead forms) fora deste plano.
