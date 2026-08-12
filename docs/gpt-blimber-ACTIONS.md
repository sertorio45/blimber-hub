# ChatGPT — 2 Ações no mesmo GPT (Marketing + Ads)

O ChatGPT limita **cada Ação a ≤30 operations** e **recusa o mesmo hostname** em duas Ações (*«app.blimber.com.br já existe em outra ação»*).

Solução: **dois OpenAPI**, **dois hosts**, **um GPT**.

| Ação | Arquivo | Host (`servers.url`) | Ops |
|------|---------|----------------------|-----|
| Marketing | [`gpt/blimber/openapi-marketing.yaml`](../gpt/blimber/openapi-marketing.yaml) | `https://app.blimber.com.br` | 13 |
| Ads (Meta) | [`gpt/blimber/openapi-ads.yaml`](../gpt/blimber/openapi-ads.yaml) | `https://ads.blimber.com.br` | 21 |

**Não importe** `gpt/blimber/openapi.yaml` (índice, não é spec).  
**Não importe** `gpt/blimber-meta/openapi.yaml` neste GPT (host `app.*` = duplicado com Marketing).  
Pack `gpt/blimber-meta/` = GPT **Ads-only** (standby), host `app.blimber.com.br`.

## Hosts

Não há rewrite/domínio `ads.blimber.com.br` no repo (`vercel.json` / Nuxt). É **alias DNS** no mesmo projeto Vercel.

- Marketing chama `https://app.blimber.com.br/api/gpt/...`
- Ads chama `https://ads.blimber.com.br/api/gpt/meta/...`
- Mesmo app Nuxt, mesmas rotas, mesma `BLIMBER_MCP_API_KEY`

## O que fazer no Vercel / DNS

1. **DNS** (onde o domínio `blimber.com.br` está): CNAME `ads` → `cname.vercel-dns.com` (ou o target que o Vercel mostrar).
2. **Vercel** → projeto Blimber Hub → **Settings** → **Domains** → **Add** `ads.blimber.com.br`.
3. Apontar para o **mesmo** projeto / production (não criar outro deployment).
4. Aguardar TLS. Teste: `https://ads.blimber.com.br/api/gpt/meta/tools` (Bearer) deve responder igual a `https://app.blimber.com.br/api/gpt/meta/tools`.

**Obrigatório:** sem o alias `ads.blimber.com.br` no **mesmo** projeto Vercel, a 2ª Ação dá 404 no ChatGPT. Não crie outro projeto / outro deploy.

## Como configurar no ChatGPT (UI PT)

1. **Explorar GPTs** → **Meus GPTs** → GPT Blimber → **Editar** → aba **Configurar**.
2. **Instruções**: cole o corpo de `gpt/blimber/instructions.md` (a partir de “Você é o assistente…”).
3. **Ações** → apague a Ação antiga (o YAML unificado).
4. **Criar nova ação** → cole `openapi-marketing.yaml` → **Autenticação** → **Chave de API** → **Bearer** → `BLIMBER_MCP_API_KEY`.
5. **Criar nova ação** de novo → cole `openapi-ads.yaml` → mesma Bearer key.
6. Confira nos esquemas: Marketing = `app.blimber.com.br`, Ads = `ads.blimber.com.br`.
7. **Atualizar**.

`searchTenants` só existe na Ação Marketing. A Ação Ads usa o `tenantId` já resolvido.

## Auth

Ambas as Ações: Bearer `BLIMBER_MCP_API_KEY` (sem prefixo `Bearer ` no campo do ChatGPT).
