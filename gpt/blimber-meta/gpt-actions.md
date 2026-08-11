# Setup — Custom GPT Actions (Blimber Meta)

Formato atual OpenAI (2025–2026): **Custom GPT + Actions (OpenAPI)** + **Skill** (`SKILL.md`).  
O antigo ChatGPT Plugin (`/.well-known/ai-plugin.json`) **não** é o caminho recomendado.

## 1. Deploy HTTPS

O ChatGPT só chama Actions em URL **pública HTTPS** (TLS 1.2+, porta 443).  
Localhost não funciona para Actions em produção do ChatGPT.

## 2. API key

No servidor Blimber:

```bash
BLIMBER_MCP_API_KEY=uma-chave-longa-e-aleatoria
```

Fallback aceito: `MARKETING_WORKER_SECRET` (mesmo valor no header Bearer).

## 3. Criar o Custom GPT

1. ChatGPT → **Explore GPTs** → **Create a GPT**
2. Nome: ex. `Blimber Meta Ads`
3. **Instructions**: cole `instructions.md`
4. **Actions** → **Create new action** → cole / importe `openapi.yaml`
5. Ajuste `servers[0].url` no schema se o host não for `https://app.blimber.com.br`
6. **Authentication**:
   - Tipo: **API Key**
   - Auth Type: **Bearer**
   - API Key: valor de `BLIMBER_MCP_API_KEY` (sem escrever `Bearer ` no campo)
7. **Knowledge / Skills**: anexe `skills/blimber-meta-ads/` ou o ZIP gerado

## 4. Testar

Prompt:

```
Liste as integrações Meta do tenant <TENANT_UUID> e diga se está pronto.
```

Depois:

```
Mostre spend dos últimos 7 dias (level=campaign) do tenant <TENANT_UUID>.
```

Mutação (deve pedir confirmação):

```
Pause a campanha <CAMPAIGN_ID> do tenant <TENANT_UUID>.
```

## 5. Limites OpenAI Actions

- Timeout ~45s
- Payload texto < ~100k caracteres
- Um único security scheme (Bearer)
- Mutações com `x-openai-isConsequential: true` → ChatGPT força confirmação na UI
