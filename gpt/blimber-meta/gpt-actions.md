# Setup — Ações do GPT (Blimber Meta)

Formato atual OpenAI (2025–2026): **GPT personalizado** + **Ações** (Actions / OpenAPI) + **Habilidade** (Skill / `SKILL.md`).  
O antigo plugin ChatGPT (`/.well-known/ai-plugin.json`) **não** é o caminho recomendado.

> **Tutorial completo (conceitos, passo a passo, prompts, troubleshooting):**  
> [`docs/gpt-blimber-meta-TUTORIAL.md`](../../docs/gpt-blimber-meta-TUTORIAL.md)

## Onde achar na interface (PT)

**Explorar GPTs** → **Criar** (ou **Meus GPTs** → **Editar GPT**) → aba **Configurar** → **Ações** → **Criar nova ação** → colar o esquema OpenAPI → **Autenticação** (**Chave de API** + **Bearer**) → **Criar** / **Atualizar**.

## 1. Deploy HTTPS

O ChatGPT só chama ações em URL **pública HTTPS** (TLS 1.2+, porta 443).  
Localhost não funciona para ações em produção do ChatGPT.

## 2. API key

No servidor Blimber:

```bash
BLIMBER_MCP_API_KEY=uma-chave-longa-e-aleatoria
```

Alternativa aceita: `MARKETING_WORKER_SECRET` (mesmo valor no header Bearer).

## 3. Criar o GPT personalizado

1. ChatGPT → **Explorar GPTs** → **Criar**
2. Aba **Configurar** — Nome: ex. `Blimber Meta Ads`
3. **Instruções**: cole o corpo de `instructions.md`
4. **Ações** → **Criar nova ação** → cole / importe `openapi.yaml`
   - O schema já usa um único `servers.url`: `https://app.blimber.com.br` (não use placeholders)
   - Este pack é um **GPT só de Ads**. **Não** importe também `gpt/blimber/openapi.yaml` neste GPT (mesmo host → *domínios duplicados*). Para Marketing + Meta no mesmo assistente, use **só** `gpt/blimber/openapi.yaml` em outro GPT.
5. **Autenticação**:
   - Tipo: **Chave de API** (API Key)
   - Auth Type: **Bearer**
   - Chave: valor de `BLIMBER_MCP_API_KEY` (sem escrever `Bearer ` no campo)
6. **Conhecimento** / **Habilidades**: anexe `skills/blimber-meta-ads/` ou o ZIP gerado
7. **Criar** (novo) ou **Atualizar** (existente)

## 4. Testar

Prompt (por nome — preferido):

```
Busque o cliente Farmaestetica e liste as integrações Meta. Se houver vários matches, pergunte qual.
```

Ou com UUID:

```
Liste as integrações Meta do tenant <TENANT_UUID> e diga se está pronto.
```

Depois:

```
Mostre spend dos últimos 7 dias (level=campaign) do mesmo cliente.
```

Mutação (deve pedir confirmação):

```
Pause a campanha <CAMPAIGN_ID> desse cliente. Confirme comigo antes.
```

Fluxo esperado: `searchTenants` → `tenantId` → demais Ações Meta.
## 5. Limites das Ações OpenAI

- Timeout ~45s
- Payload texto < ~100k caracteres
- Um único security scheme (Bearer)
- Um único `servers.url` (sem placeholders / hosts extras)
- Parameters devem estar **inline** (o importador não resolve bem `$ref` de parameter)
- Mutações com `x-openai-isConsequential: true` → ChatGPT força confirmação na UI

## 6. Reimportar OpenAPI (GPT já existente)

Após mudanças no schema (write create/edit/bulk ou correção YAML), **reimporte o `openapi.yaml` completo** na ação — não edite só um trecho na UI.

1. **Meus GPTs** → **Editar** o GPT → aba **Configurar** → **Ações**
2. Abra a ação existente → substitua o esquema completo pelo `openapi.yaml` atualizado (YAML válido 3.0.3; se o import falhar, confira newline entre `contact.name` e `servers:`)
3. Confirme `servers.url` = `https://app.blimber.com.br` e **Autenticação** Bearer
4. Recole **Instruções** de `instructions.md` se o fluxo mudou
5. Atualize a **Habilidade** / ZIP se necessário
6. **Atualizar** o GPT e teste na **Prévia**
