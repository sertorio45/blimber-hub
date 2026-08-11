# Plano: GPT / MCP Meta — ferramentas de escrita (write)

**Data:** 2026-08-11  
**Status:** Etapas **0–6** **concluídas** — ver registros `gpt-blimber-meta-WRITE-ETAPA-0.md` … `WRITE-ETAPA-6.md`. **Plano write finalizado.**  
**Escopo:** expandir Blimber Meta Ads (ChatGPT Actions + `lib/meta-ads` + `/api/gpt/meta/*` + MCP opcional) além de leitura + pause/activate.  
**Fora deste plano:** ETAPA 8 do epic Marketing/Ads/Brand (`docs/marketing-ads-brand-reorg/`). Não alterar artefatos desse epic; docs de write ficam sob `docs/gpt-*`.
---

## 1. Resumo executivo

Hoje o pack GPT Meta é **quase só leitura**. A única mutação é `meta_update_campaign_status` (`ACTIVE` | `PAUSED`), com guards `confirm: true` + `confirmTenantId === tenantId` e checagem de ownership da ad account.

O usuário quer, via GPT/MCP:

1. Criar campanha / adset / anúncio / criativo  
2. Editar budget, targeting, copy e mídia  
3. Delete em massa  

**Ordem sugerida:** reforçar segurança (MVP write) → create campaign → create adset → create ad/creative → edits pontuais → bulk delete **só depois** de preview + dry-run.  
**Brand Context / Criativos (ETAPA 7)** alimentam um pipeline futuro de IA para copy/imagem; não bloqueiam o MVP de create “manual” via Graph, mas viram dependência nas etapas de criativo inteligente.

---

## 2. Estado atual (inventário)

### 2.1 Camadas

| Camada | Caminho | Papel |
|--------|---------|--------|
| Tools tipadas | `lib/meta-ads/tools.ts` | Handlers Zod + Graph |
| Graph helper | `lib/meta-ads/graph.ts` | URL, fetch, date query (GET + body→query para POST) |
| Credenciais | `lib/meta-ads/integration.ts` | Token AES por tenant em `marketing_integrations` |
| HTTP GPT | `server/api/gpt/meta/*` | Bearer `BLIMBER_MCP_API_KEY` → `runMetaGptTool` |
| OpenAPI / Skill | `gpt/blimber-meta/` | Actions ChatGPT |
| Docs | `docs/gpt-blimber-meta.md`, tutorial, `docs/mcp-blimber-meta.md` |

### 2.2 Tools expostas hoje

| Tool | Tipo | Graph |
|------|------|--------|
| `meta_list_integrations` | read | DB (+ `write_readiness`) |
| `meta_list_ad_accounts` | read | `GET /me/adaccounts` |
| `meta_list_campaigns` | read | `GET /act_*/campaigns` |
| `meta_get_campaign` | read | `GET /{campaignId}` + ownership |
| `meta_list_adsets` | read | `GET .../adsets` |
| `meta_list_ads` | read | `GET .../ads` (+ creative thumb) |
| `meta_get_insights` | read | `GET .../insights` |
| `meta_update_campaign_status` | **write** | `POST /{campaignId}` `{ status }` |
| `meta_update_adset_status` | **write** | `POST /{adsetId}` `{ status }` |
| `meta_update_ad_status` | **write** | `POST /{adId}` `{ status }` |
| `meta_create_campaign` | **write** | `POST /act_*/campaigns` |
| `meta_create_adset` | **write** | `POST /act_*/adsets` |
| `meta_create_ad` | **write** | `POST /act_*/adcreatives` + `POST /act_*/ads` |
| `meta_update_adset_budget` | **write** | `POST /{adsetId}` budget |
| `meta_update_adset_targeting` | **write** | `POST /{adsetId}` targeting (BR_*) |
| `meta_update_ad_creative_copy` | **write** | novo creative + swap no ad |
| `meta_update_ad_media` | **write** | novo creative (imageUrl\|hash) + swap |
| `meta_preview_bulk_delete` | **write preview** | GET ownership + previewToken |
| `meta_execute_bulk_delete` | **write** | `POST /{id}` `{ status: DELETED\|ARCHIVED }` em lote |

Dry-run e audit existem nas tools de status, create, edits e bulk delete (Etapas 0–6).
### 2.3 Outras chamadas Meta no monorepo (contexto)

| Área | Uso |
|------|-----|
| `server/api/marketing/overview.get.ts` | Leitura live de campanhas/ads/creatives (`object_story_spec`) para boards Ads — **sem create paid** |
| `server/utils/social-publishers/meta-publisher.ts` | Publicação **orgânica** (Page/IG), não Marketing Ads objects |
| CRM Meta CAPI | Eventos de conversão — domínio separado |
| OAuth marketing | Conecta token usado pelas tools |

Conclusão: a Graph API **já é chamada** com POST para status de campanha; create/update ricos de Ads **ainda não** passam por `lib/meta-ads`.

### 2.4 OAuth scopes atuais (Marketing Meta)

Fonte: `server/api/marketing/oauth/[provider]/start.get.ts` (provider `meta`):

```
public_profile, email, business_management,
ads_read, ads_management, read_insights,
pages_show_list, pages_read_engagement, pages_manage_metadata,
pages_manage_posts, pages_read_user_content,
instagram_basic, instagram_content_publish,
instagram_manage_insights, instagram_manage_comments,
instagram_manage_contents
```

Config pública da integração guarda `granted_scopes` / `missing_publish_scopes` (sem expor tokens).

### 2.5 Brand Context / Criativos (ETAPA 7) — peça futura de IA

Já entregue (arquitetura, sem geração):

- `GET /api/marketing/brand/context` + `useAdsBrandContext`
- `types/ads-brand.ts` / `utils/ads-brand.ts` (`buildAdsCreativeGenerationInput`)
- UI `/ads/creatives` (checklist campanha + produto + brand + objetivo)

Fluxo futuro:

```
Campanha paga + Produto + Brand Context + Objetivo
        → Blimber AI → Copy / Imagem / Variações
        → (depois) upload mídia + create AdCreative / Ad na Meta
```

**Fronteira:** GPT write Meta **não** lista `social_campaigns` editoriais; apenas objetos da Marketing API do tenant.

---

## 3. Princípios de segurança (obrigatórios em toda etapa write)

Estes princípios estendem o que já existe em pause/activate e alinham com `audit_events` / `recordAuditEvent` do restante do Hub.

### 3.1 Confirmação explícita

- Toda mutação exige `confirm: true` (literal).  
- Toda mutação exige `confirmTenantId` **idêntico** a `tenantId`.  
- Instruções do GPT: **nunca** mutar sem o usuário confirmar IDs, valores e impacto no chat.  
- Preferir fluxo em **duas chamadas** quando o risco for alto: (1) preview / dry-run, (2) execute.

### 3.2 Isolamento por tenant

- `tenantId` obrigatório em todas as tools.  
- Credenciais só via `resolveMetaCredentials` / `marketing_integrations` do mesmo tenant.  
- Antes de mutar: ownership — objeto pertence à `ad_account_id` do tenant (padrão de `meta_get_campaign`).  
- Nunca aceitar `access_token` do cliente GPT; nunca devolver tokens.

### 3.3 Dry-run

- Parâmetro `dryRun: boolean` (default **true** em tools destrutivas / create com spend).  
- Dry-run: valida schema + ownership + monta payload Graph **sem** `POST`/`DELETE` real; retorna preview.  
- Execute: só com `dryRun: false` **e** `confirm: true` **e** `confirmTenantId`.  
- Pause/activate atual: na Etapa 0/1, adicionar dry-run opcional retrocompatível (default false só para essa tool legada, ou exigir dry-run em novas tools — ver Etapa 1).

### 3.4 Limites

| Limite | Sugestão inicial |
|--------|------------------|
| Itens por bulk (delete / update em lote) | Máx. **20** por request (configurável via env, ex. `META_GPT_BULK_MAX`) |
| Create por request | **1** objeto folha (ou 1 campaign + N adsets com teto baixo) |
| Budget diário (create/edit) | Teto configurável por tenant/env (ex. alerta se > X centavos na moeda da conta) |
| Rate | Reusar auth Bearer; considerar throttle por `tenantId` + API key (ex. N mutações/min) |
| Timeout OpenAI Actions | ~45s — operações bulk longas devem ser síncronas curtas ou job futuro (fora do MVP) |

### 3.5 Audit log

- Toda mutação **executada** (`dryRun: false`) deve gravar em `audit_events` via `recordAuditEvent` / `writeAuditEvent`.  
- Campos: `tenant_id`, `action` (ex. `meta.gpt.campaign.status`, `meta.gpt.campaign.create`), `entity_type`, `entity_id`, `before`/`after` sanitizados (sem tokens).  
- `actor_id`: null ou marker `gpt-meta` / hash da API key — GPT não tem user Hub; documentar decisão na Etapa 1.  
- Dry-run **não** precisa persistir, ou persiste action `*.preview` com flag (opcional).

### 3.6 Auth GPT

- Continua `Authorization: Bearer BLIMBER_MCP_API_KEY`.  
- Sem chave → 401; env ausente → 503.  
- HTTPS público obrigatório para Actions.

### 3.7 App Review / permissões Meta

- `ads_management` já está no OAuth — suficiente para create/update/delete de objetos Ads na Marketing API (contanto que Advanced Access esteja aprovado para clientes reais).  
- Criativos que postam na Page podem exigir `pages_*` / page token já usados no orgânico — validar na etapa de creative.  
- **Não** pedir escopos novos sem necessidade comprovada (ver §4).

---

## 4. Escopos OAuth: atuais vs necessários

| Escopo | Atual? | Necessário para write Ads? | Notas |
|--------|--------|----------------------------|--------|
| `ads_read` | Sim | Sim (leitura/ownership) | Já ok |
| `ads_management` | Sim | **Sim — núcleo create/update/delete** | Já ok |
| `business_management` | Sim | Útil (BM / accounts) | Já ok |
| `read_insights` | Sim | Relatórios | Já ok |
| `pages_*` / Instagram | Sim | Criativos com Page/IG post | Já no login; validar page token no create creative |
| Catalog / Commerce extras | Não | Só se product catalog ads | **Adiar** |
| Lead gen form create | Não (a confirmar) | Só se lead ads forms | **Adiar** |

**Veredito:** para o roadmap write planejado, **não há necessidade imediata de novos scopes** no start OAuth. Riscos reais: token sem Advanced Access, `missing_publish_scopes`, page token ausente, ad account sem permissão de anunciante.

**Ação prevista (Etapa 1):** tool ou campo em `meta_list_integrations` que reporte se `ads_management` está em `granted_scopes` e se `page_access_token` existe para creatives com Page.

---

## 5. O que NÃO fazer no início

| Proibido no início | Motivo |
|--------------------|--------|
| Delete sem preview / sem dry-run | Risco irreversível / spend e histórico |
| Bulk delete > limite sem confirmar lista de IDs | GPT pode alucinar IDs |
| Create campanha já `ACTIVE` com budget alto sem confirmação | Gasto acidental |
| Expor delete genérico “apague tudo que tiver X no nome” sem lista | Destrutivo demais |
| Geração de imagem/copy por IA acoplada ao GPT Meta na mesma etapa | Depende Brand Context / ETAPA 7+; misturar atrasa segurança |
| Alterar menus Marketing / ETAPA 8 / migrations Ads | Fora do escopo; evitar conflito |
| Aceitar SQL ou token Meta do usuário | Bypass de isolação |
| Editar muitos campos Graph de uma vez sem whitelist | API enorme; erros difíceis de reverter |
| Advantage+/ASC complex sem templates fixos | Alta chance de payload inválido |
| Soft-delete ARCHIVED confundido com DELETE físico sem explicar | UX/confusão de auditoria |

---

## 6. Dependências Brand Context / criativos

| Dependência | Quando entra | Papel |
|-------------|--------------|--------|
| Brand Context (`/api/marketing/brand/context`) | Etapas 4+ (copy/creative assistido) | Tom, cores, restrições — input para sugestão de copy |
| `buildAdsCreativeGenerationInput` | Pós-MVP write mecânico | Contrato estável para IA; **não** chama modelo ainda |
| `/ads/creatives` UI | Paralelo produto Hub | Não bloqueia GPT tools |
| Biblioteca de assets / upload Meta | Etapa 4 (mídia) | Hash de imagem / video_id na Graph |
| Page + IG no `config` da integração | Etapa 4 | `object_story_spec` com page_id |

**Regra:** etapas 1–3 podem usar payloads **explícitos** (nome, objective, budget, targeting JSON whitelist). IA + Brand Context = fase opcional **depois** de create ad/creative estável.

---

## 7. Etapas numeradas (com critério de aceite e risco)

Convenção de risco: **baixo** | **médio** | **alto**.  
Após cada etapa: **PARAR E VALIDAR** com humanos (mesmo espírito do epic marketing).

---

### Etapa 0 — Fundação write (rails) ✅ DONE

**Objetivo:** preparar `lib/meta-ads` + GPT auth para mutações seguras sem novas features de negócio.  
**Risco:** baixo.  
**Registro:** [`gpt-blimber-meta-WRITE-ETAPA-0.md`](./gpt-blimber-meta-WRITE-ETAPA-0.md)

**Entregas (quando implementar):**

- Helper compartilhado: `assertWriteConfirmation(input)`, `assertOwnership(...)`, `withDryRun(...)`.  
- Wrapper de audit para tools Meta GPT.  
- Constantes de limites / env.  
- Documentar no OpenAPI o contrato comum de write (`confirm`, `confirmTenantId`, `dryRun`).  
- Testes unitários dos guards (sem Graph real).

**Critérios de aceite:**

- [x] Nenhuma tool nova de negócio ainda (ou só refator interna).  
- [x] Pause/activate existente continua passando nos testes.  
- [x] Docs `docs/gpt-*` atualizados apontando este plano.  
- [x] Zero conflito com pastas `docs/marketing-ads-brand-reorg/`.

**PARAR E VALIDAR:** code review dos guards + decisão actor_id no audit.  
→ Decisão MVP: `actor_id = null` + `after.source = "gpt-meta"` (ver ETAPA-0).

---

### Etapa 1 — MVP write (endurecer o que já existe + paridade status) ✅ DONE

**Objetivo:** escrita mínima confiável e auditável; estender pause/activate para adset/ad se fizer sentido.  
**Risco:** baixo–médio.  
**Registro:** [`gpt-blimber-meta-WRITE-ETAPA-1.md`](./gpt-blimber-meta-WRITE-ETAPA-1.md)

**Escopo sugerido:**

1. Audit em `meta_update_campaign_status` (hoje sem audit).  
2. Opcional: `dryRun` também nessa tool.  
3. Novas tools espelho: `meta_update_adset_status`, `meta_update_ad_status` (ACTIVE/PAUSED only) com mesmos guards.  
4. Reportar scopes/page token readiness em list integrations (sem novos OAuth scopes).  
5. Atualizar OpenAPI + Skill + instruções PT-BR.

**Não incluir:** create, budget edit, delete.

**Critérios de aceite:**

- [x] Toda mutação executada gera `audit_events`.  
- [x] Ownership falha com 403 se objeto de outra ad account.  
- [x] `confirm` / `confirmTenantId` rejeitados nos testes.  
- [x] GPT instructions: fluxo “mostrar → confirmar → mutar”.  
- [x] `pnpm test` em `tests/meta-ads-tools.test.ts` + openapi.

**PARAR E VALIDAR:** pausar/ativar campanha + adset em sandbox Meta de um tenant piloto.

---

### Etapa 2 — Create campaign ✅ DONE

**Objetivo:** `POST /act_{ad_account_id}/campaigns` via tool tipada.  
**Risco:** médio.  
**Registro:** [`gpt-blimber-meta-WRITE-ETAPA-2.md`](./gpt-blimber-meta-WRITE-ETAPA-2.md)

**Campos MVP (whitelist):**

- `name`, `objective` (enum Meta documentado), `status` default **PAUSED**,  
- `daily_budget` **ou** `lifetime_budget` (centavos), `special_ad_categories` quando exigido.

**Dry-run default:** `true`.

**Critérios de aceite:**

- [x] Create só na ad account do tenant.  
- [x] Default PAUSED; ACTIVE exige confirmação extra no chat + campo explícito.  
- [x] Preview dry-run mostra payload e budget convertido na moeda da conta (se disponível).  
- [x] Audit com `after` contendo campaign id retornado.  
- [x] OpenAPI + testes de schema.  
- [x] Documentação: objetivos suportados vs rejeitados.

**PARAR E VALIDAR:** criar 1 campanha PAUSED no Ads Manager do piloto; conferir audit.

---

### Etapa 3 — Create adset ✅ DONE

**Objetivo:** `POST /act_*/adsets` ligado a `campaignId` do mesmo tenant.  
**Risco:** médio–alto (targeting).  
**Registro:** [`gpt-blimber-meta-WRITE-ETAPA-3.md`](./gpt-blimber-meta-WRITE-ETAPA-3.md)

**MVP whitelist:**

- `name`, `campaign_id`, `billing_event`, `optimization_goal`,  
- budget (daily/lifetime), `start_time` / `end_time` opcionais,  
- `targeting` via **templates** (ex.: país BR + idade) — não aceitar targeting Graph arbitrário no dia 1,  
- `status` default PAUSED.

**Critérios de aceite:**

- [x] Rejeita campaignId fora da ad account.  
- [x] Targeting só schemas Zod permitidos (lista fechada).  
- [x] Dry-run preview legível (geos, idade, budget).  
- [x] Audit + testes.  
- [x] Sem Advantage+ complex / catálogo.

**PARAR E VALIDAR:** 1 adset PAUSED sob a campanha da Etapa 2; revisar targeting no Ads Manager.

---

### Etapa 4 — Create ad + creative ✅ DONE

**Objetivo:** `adcreatives` + `ads` (link entre adset e creative).  
**Risco:** alto (mídia, Page, políticas).  
**Registro:** [`gpt-blimber-meta-WRITE-ETAPA-4.md`](./gpt-blimber-meta-WRITE-ETAPA-4.md)

**Fases internas:**

1. **4a — Creative link/page post simples:** `object_story_spec` com `page_id` da integração + link + message/headline (copy explícita do usuário). ✅  
2. **4b — Mídia:** `image_url` / `image_hash` opcionais (sem upload binário / sem geração). ✅ parcial  
3. **4c (opcional, depois) — Brand Context assist:** sugerir copy via AI usando `buildAdsCreativeGenerationInput` — **não** nesta entrega.

**Critérios de aceite:**

- [x] Falha clara se `page_id` / page token ausente.  
- [x] Ad criado PAUSED por default.  
- [x] Ownership: adset e creative na mesma ad account.  
- [x] Dry-run mostra copy + URL + page.  
- [x] Sem geração de imagem automática nesta etapa (salvo epic AI separado).  
- [x] Skill GPT: nunca inventar URLs de mídia.

**PARAR E VALIDAR:** anúncio PAUSED visível no Ads Manager; thumbnail ok; políticas Meta.

---

### Etapa 5 — Edit budget / targeting / copy / media ✅ DONE

**Objetivo:** updates pontuais com whitelist por object type.  
**Risco:** alto (spend + alcance).  
**Registro:** [`gpt-blimber-meta-WRITE-ETAPA-5.md`](./gpt-blimber-meta-WRITE-ETAPA-5.md)

**Tools sugeridas (separadas, não um “patch anything”):**

| Tool | Objeto | Campos permitidos (MVP) |
|------|--------|-------------------------|
| `meta_update_adset_budget` | adset | daily_budget / lifetime_budget |
| `meta_update_adset_targeting` | adset | mesmos templates da Etapa 3 |
| `meta_update_ad_creative_copy` | ad (novo creative + swap) | message, title, description, link, CTA |
| `meta_update_ad_media` | ad (novo creative + swap) | image_hash / image_url |

**Regras:**

- Sempre `before` snapshot no audit (GET antes do POST).  
- Dry-run obrigatório na primeira implementação (default true).  
- Limite de variação de budget (ex. não aumentar > X% sem flag `confirmBudgetIncrease`).

**Critérios de aceite:**

- [x] Schema rejeita campos fora da whitelist.  
- [x] Diff before/after no response e no audit.  
- [x] Testes de regressão com pause/activate intactos.  
- [x] Tutorial GPT: exemplos PT de cada edição.

**PARAR E VALIDAR:** editar budget para baixo e para cima (com flag); editar copy em ad teste; rollback manual documentado.

---

### Etapa 6 — Bulk delete ✅ DONE

**Objetivo:** deletar/arquivar em lote com preview obrigatório.  
**Risco:** **alto**.  
**Registro:** [`gpt-blimber-meta-WRITE-ETAPA-6.md`](./gpt-blimber-meta-WRITE-ETAPA-6.md)

**Desenho obrigatório:**

1. `meta_preview_bulk_delete` — recebe `level` (`campaign`|`adset`|`ad`) + lista de IDs (máx. N) → valida ownership → retorna tabela nome/status/spend-ish se disponível.  
2. `meta_execute_bulk_delete` — mesmos IDs + `confirm` + `confirmTenantId` + `dryRun: false` + `confirmDelete: true` + `previewToken`.  
3. Preferir `status=DELETED` / arquivo conforme best practice Marketing API; documentar diferença vs ARCHIVED.  
4. Processar sequencialmente com resultados parciais (`succeeded[]`, `failed[]`).

**Proibido:** delete por filtro de nome sem lista explícita de IDs na Etapa 6.

**Critérios de aceite:**

- [x] Impossível execute sem preview recente (`previewToken` com TTL).  
- [x] Limite de itens enforced.  
- [x] Audit por item ou por batch idempotente.  
- [x] Testes com graphFetch mock (nenhum DELETE/POST se dry-run / preview).  
- [x] Instruções GPT: listar IDs, pedir confirmação, só então execute.

**PARAR E VALIDAR:** deletar só objetos de teste criados nas etapas 2–4; nunca produção do cliente sem janela acordada.

---

## 8. Ordem sugerida e checkpoints

```
Etapa 0  Fundação rails ✅
   │  PARAR E VALIDAR
   ▼
Etapa 1  MVP write (audit + status adset/ad) ✅
   │  PARAR E VALIDAR  ← piloto pause/activate
   ▼
Etapa 2  Create campaign (PAUSED) ✅
   │  PARAR E VALIDAR  ← piloto create PAUSED
   ▼
Etapa 3  Create adset (targeting template) ✅
   │  PARAR E VALIDAR  ← piloto adset PAUSED
   ▼
Etapa 4  Create ad/creative (+ mídia) ✅
   │  PARAR E VALIDAR  ← Brand Context / IA (opcional 4c) ainda aberto
   ▼
Etapa 5  Edit budget / targeting / copy / media ✅
   │  PARAR E VALIDAR
   ▼
Etapa 6  Bulk delete (preview → execute) ✅
   │  PARAR E VALIDAR
   ▼
(Backlog) Templates Advantage+, catalog, lead forms, jobs async
```

**Plano write 0–6 concluído.** Não reabrir etapas sem necessidade.  
**Não iniciar** mutações destrutivas em produção de cliente sem janela acordada.

---

## 9. Superfícies a atualizar (quando implementar — checklist)

| Artefato | Ação |
|----------|------|
| `lib/meta-ads/tools.ts` (+ poss. módulos `writes/*.ts`) | Novos handlers |
| `server/api/gpt/meta/*` | Rotas REST espelho OpenAPI |
| `gpt/blimber-meta/openapi.yaml` | Novas operations |
| `gpt/blimber-meta/instructions.md` + Skill | Fluxos PT + segurança |
| `docs/gpt-blimber-meta.md` + tutorial | Remover “fora de escopo create/delete” gradualmente |
| `docs/mcp-blimber-meta.md` | Espelho MCP |
| `.agents/skills/blimber-meta-ads/SKILL.md` | Espelho Cursor |
| `tests/meta-ads-tools.test.ts`, `tests/gpt-meta-openapi.test.ts` | Cobertura |
| `audit_events` | Sem migration se schema atual bastar |

**Não tocar (neste roadmap):** `docs/marketing-ads-brand-reorg/ETAPA-8-*`, menus Marketing, OAuth scope list (salvo evidência).

---

## 10. Estimativa de risco por etapa (visão rápida)

| Etapa | Risco | Principal ameaça |
|-------|-------|------------------|
| 0 Fundação | Baixo | Refator quebrar pause |
| 1 MVP write | Baixo–médio | Mutação sem audit / ad errado |
| 2 Create campaign | Médio | Campanha ACTIVE + budget |
| 3 Create adset | Médio–alto | Targeting amplo / spend |
| 4 Ad/creative | Alto | Page/mídia/políticas |
| 5 Edits | Alto | Budget spike / copy errada |
| 6 Bulk delete | Alto | Perda em massa |

---

## 11. Critérios globais de “pronto para próximo estágio”

Antes de avançar qualquer etapa:

1. Testes automatizados verdes na área Meta GPT.  
2. Validação manual em **tenant piloto / ad account sandbox**.  
3. OpenAPI importável no ChatGPT sem erro de schema.  
4. Instruções do GPT atualizadas em português.  
5. Registro de audit verificável no Hub (ou query admin).  
6. Nenhuma regressão nas tools de leitura.

---

## 12. Relação com o produto Ads / Brand (sem conflitar ETAPA 8)

| Trabalho | Onde |
|----------|------|
| Este plano write GPT/MCP | `docs/gpt-blimber-meta-WRITE-PLAN.md` + implementação futura em `lib/meta-ads` / `gpt/blimber-meta` |
| Brand Context + UI criativos | Já em ETAPA 7; consumo AI depois |
| Revisão final Marketing epic | ETAPA 8 — **outro agente**; não misturar PRs |

Inclusão futura saudável: após Etapa 4 estável, documentar bridge “GPT sugere copy com Brand Context → usuário confirma → `meta_create_ad`”.

---

## 13. Decisões em aberto (perguntar antes de implementar Etapa 2+)

1. Actor de audit para GPT: `null`, service user, ou fingerprint da API key?  
   → **Decisão MVP (Etapa 0):** `actor_id = null` + `after.source = "gpt-meta"`.  
2. Moeda / teto de budget default por tenant ou global env?  
   → **Global env** `META_GPT_BUDGET_DAILY_MAX_CENTS` (+ increase %).  
3. Delete = `DELETED` vs `ARCHIVED` como padrão Blimber?  
   → **DELETED** (default); `ARCHIVED` opcional via `deleteMode`.  
4. Create multicamada em uma tool (“campaign+adset+ad”) vs tools atômicas (recomendado: **atómanicas**)?  
   → **Atômicas** (entregue).  
5. Permitir ACTIVE no create em algum dia, ou sempre PAUSED + tool de status?  
   → Default **PAUSED**; ACTIVE só com `confirmActive: true`.

---

## 14. Referências rápidas no repo

- Tools: `lib/meta-ads/tools.ts`  
- OAuth scopes: `server/api/marketing/oauth/[provider]/start.get.ts`  
- Status write atual: `server/api/gpt/meta/campaigns/[campaignId]/status.post.ts`  
- Audit: `server/utils/audit-events.ts`  
- Brand bridge: `types/ads-brand.ts`, `docs/marketing-ads-brand-reorg/ETAPA-7-ADS-BRAND.md`  
- Pack GPT: `gpt/blimber-meta/`, `docs/gpt-blimber-meta.md`
