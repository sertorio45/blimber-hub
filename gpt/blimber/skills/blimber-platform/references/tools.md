# Referência rápida — tools Blimber Platform

Uma Ação = `gpt/blimber/openapi.yaml` (marketing + meta). Pack `gpt/blimber-meta` é GPT separado.

## Platform
- `GET /api/gpt/tenants?q=` — searchTenants
- `GET /api/gpt/tools` — catálogo

## Marketing
- `GET/POST /api/gpt/marketing/posts`
- `GET/PUT /api/gpt/marketing/posts/{postId}`
- `GET/POST /api/gpt/marketing/campaigns`
- `GET/PUT /api/gpt/marketing/campaigns/{campaignId}`
- `GET /api/gpt/marketing/brand-context?tenantId=`
- `GET /api/gpt/marketing/assets?tenantId=`
- `GET /api/gpt/marketing/accounts?tenantId=`

## Ads
- Meta (neste spec): `/api/gpt/meta/*` + `GET /api/gpt/ads/meta/tools`
- Google: `GET /api/gpt/ads/google/status` (stub)

## Auth
`Authorization: Bearer BLIMBER_MCP_API_KEY`
