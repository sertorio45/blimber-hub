# Referência rápida — tools Blimber Platform

Duas Ações no mesmo GPT (hosts diferentes, cada uma ≤30 ops).
Setup: `docs/gpt-blimber-ACTIONS.md`.
Ads no ChatGPT = `openapi-ads.yaml` (host `ads.*`). Pack standalone `gpt/blimber-meta/` removido.

## Ação Marketing — `openapi-marketing.yaml` (`app.blimber.com.br`)

### Platform
- `GET /api/gpt/tenants?q=` — searchTenants
- `GET /api/gpt/tools` — catálogo (listBlimberTools)

### Marketing
- `GET/POST /api/gpt/marketing/posts`
- `GET/PUT /api/gpt/marketing/posts/{postId}`
- `GET/POST /api/gpt/marketing/campaigns`
- `GET/PUT /api/gpt/marketing/campaigns/{campaignId}`
- `GET /api/gpt/marketing/brand-context?tenantId=`
- `GET /api/gpt/marketing/assets?tenantId=`
- `GET /api/gpt/marketing/accounts?tenantId=`

## Ação Ads — `openapi-ads.yaml` (`ads.blimber.com.br`)

- `GET /api/gpt/meta/tools` / `integrations` / `ad-accounts`
- `GET/POST /api/gpt/meta/campaigns` + `GET …/{campaignId}` + `POST …/{campaignId}/status`
- `GET/POST /api/gpt/meta/adsets` + `POST …/{adsetId}/status|budget|targeting`
- `GET/POST /api/gpt/meta/ads` + `POST …/{adId}/status|creative-copy|media`
- `POST /api/gpt/meta/insights`
- `POST /api/gpt/meta/bulk-delete/preview` + `execute`
- `POST /api/gpt/meta/invoke`

`searchTenants` **não** está nesta Ação — use a Ação Marketing.

## Auth
`Authorization: Bearer BLIMBER_MCP_API_KEY`
