# Tutorial: Meta Ads do Blimber no ChatGPT

Guia operacional completo para configurar e usar a integração **Meta Ads** do Blimber Hub dentro do **ChatGPT**, via **GPT personalizado** + **Ações** (Actions) + **Habilidade** (Skill).

> Resumo técnico e arquitetura: [`gpt-blimber-meta.md`](./gpt-blimber-meta.md)  
> Pack de arquivos: [`gpt/blimber-meta/`](../gpt/blimber-meta/)  
> OpenAPI (fonte das tools): [`gpt/blimber-meta/openapi.yaml`](../gpt/blimber-meta/openapi.yaml)

---

## Onde achar na interface (PT)

Caminho típico no ChatGPT em **português (Brasil)**:

1. Barra lateral → **Explorar GPTs** (ou [chatgpt.com/gpts](https://chatgpt.com/gpts))
2. **Criar** (Create a GPT) — ou, se já existir: **Meus GPTs** → GPT → **Editar GPT**
3. Aba **Configurar** (Configure)
4. Campos: **Nome**, **Descrição**, **Instruções** (Instructions)
5. Seção **Ações** (Actions) → **Criar nova ação** (Create new action) → colar o esquema OpenAPI
6. Em **Autenticação** (Authentication): **Chave de API** (API Key) → tipo **Bearer**
7. **Conhecimento** (Knowledge) e/ou **Habilidades** (Skills): anexar a skill
8. Testar na **Prévia** → **Criar** (novo) ou **Atualizar** (existente)

> Os rótulos abaixo seguem a [ajuda OpenAI em PT-BR](https://help.openai.com/pt-br/articles/8554397-creating-a-gpt). Em contas Enterprise/Edu a ordem dos menus pode variar um pouco.

---

## A. Conceitos (sem jargão)

### O que é um GPT personalizado (Custom GPT)

É um ChatGPT **personalizado** que você cria na conta OpenAI: tem nome, instruções próprias, pode conectar APIs externas e anexar conhecimento/habilidades. Em vez de pedir tudo no chat genérico, você conversa com um GPT feito para um domínio — neste caso, **Meta Ads do Blimber**.

### O que são Ações (Actions) — antigo “plugin”

**Ações** (Actions) são a forma atual de o GPT **chamar a sua API HTTP**.

- Antigamente existiam os “ChatGPT Plugins” (`ai-plugin.json` / `.well-known`). Esse caminho está **descontinuado**.
- Hoje você importa um **OpenAPI** no editor do GPT (seção **Ações**). O ChatGPT vira um cliente HTTP e chama rotas como `GET /api/gpt/meta/campaigns`.
- No Blimber, as ações batem em **`https://SEU_HOST/api/gpt/meta/...`** com a chave Bearer.

Pense assim: **Ação = ferramenta HTTP** (o GPT “aperta um botão” que faz GET/POST no seu servidor).

### O que são Habilidades (Skills) / Conhecimento

Uma **Habilidade** (Skill) é um pacote de **conhecimento e procedimento** (arquivo `SKILL.md`) que orienta *quando* e *como* usar as ações — fluxo recomendado, o que não fazer, regras de segurança.

- Não substitui a API.
- Não autentica sozinha.
- Complementa as **Instruções** com um roteiro operacional mais rico.

No Blimber: `gpt/blimber-meta/skills/blimber-meta-ads/SKILL.md` (ou o ZIP gerado a partir dessa pasta).  
Na UI, o upload costuma aparecer em **Conhecimento** e/ou **Habilidades**, conforme a conta.

### Diferença rápida

| Peça na UI (PT) | Termo técnico | Papel |
|-----------------|---------------|--------|
| **Instruções** | Instructions | Personalidade, regras absolutas, tom, idioma |
| **Ações** | Actions | Tools HTTP (OpenAPI → chama o Blimber) |
| **Habilidade** / **Conhecimento** | Skill / Knowledge | Procedimento/conhecimento (fluxo, limites, quando usar) |

---

## B. Pré-requisitos

Antes de configurar o GPT, confira:

1. **Conta ChatGPT** que permite **Criar** um GPT e usar **Ações** (planos com GPTs personalizados / ações habilitadas — caminho: *Explorar GPTs → Criar*).
2. **Blimber deployado em HTTPS público** (TLS 1.2+, porta 443). **Localhost não funciona** para ações do ChatGPT.
3. Variável de ambiente no servidor:
   ```bash
   BLIMBER_MCP_API_KEY=uma-chave-longa-e-aleatoria
   ```
   (ver `.env.example`). Fallback: se vazia, o servidor pode aceitar `MARKETING_WORKER_SECRET` como Bearer.
4. Outras envs já usadas pelo Hub (tokens Meta cifrados):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY` (ou `SUPABASE_SERVICE_ROLE_KEY`)
   - `MARKETING_ENCRYPTION_SECRET`
   - `META_GRAPH_VERSION=v20.0` (opcional)
5. **Tenant** com Meta **já conectado** em Integrações (OAuth no Hub). Sem isso, as tools de listagem/insights falham ou mostram integração inativa.
6. Arquivos locais no repo:
   - `gpt/blimber-meta/openapi.yaml`
   - `gpt/blimber-meta/instructions.md`
   - `gpt/blimber-meta/skills/blimber-meta-ads/` (ou ZIP da skill)
   - Setup curto: `gpt/blimber-meta/gpt-actions.md`

Você também vai precisar identificar o cliente: pelo **nome** (o GPT chama `searchTenants`) ou pelo **`tenantId`** (UUID).

---

## C. Passo a passo (do zero ao uso)

### 1. Gerar / definir a API key no servidor

No ambiente de produção (ou staging público):

```bash
# .env / secrets do deploy
BLIMBER_MCP_API_KEY=uma-chave-longa-e-aleatoria
```

- Gere uma string longa e aleatória (não reutilize senhas pessoais).
- Redeploy / reinicie o app para a variável valer.
- Guarde a chave: ela vai no editor do GPT (**Autenticação** → **Chave de API** → **Bearer**), **não** na conversa com o usuário.

Headers aceitos pelo servidor:

| Header | Uso |
|--------|-----|
| `Authorization: Bearer <chave>` | **Use no GPT** (único scheme do OpenAPI) |
| `x-blimber-mcp-key: <chave>` | Scripts / bridge legado |

Se a chave **não** estiver configurada no servidor → respostas **503**.  
Se a chave estiver errada ou ausente na chamada → **401**.

### 2. Confirmar URL pública e health das rotas

Substitua `https://app.blimber.com.br` pelo host real do seu deploy.

```bash
# Catálogo (exige API key)
curl -sS -H "Authorization: Bearer $BLIMBER_MCP_API_KEY" \
  "https://app.blimber.com.br/api/gpt/meta/tools"

# Buscar cliente pelo nome → obter tenantId
curl -sS -H "Authorization: Bearer $BLIMBER_MCP_API_KEY" \
  "https://app.blimber.com.br/api/gpt/meta/tenants?q=Farmaestetica"

# Integrações de um tenant (substitua TENANT_UUID)
curl -sS -H "Authorization: Bearer $BLIMBER_MCP_API_KEY" \
  "https://app.blimber.com.br/api/gpt/meta/integrations?tenantId=TENANT_UUID"
```

Esperado: JSON com `ok` / catálogo de tools — **não** página HTML de login e **não** 401/503.

Rotas implementadas em `server/api/gpt/meta/*` (espelham o OpenAPI).

### 3. Criar o GPT no ChatGPT

1. Abra o ChatGPT (web).
2. Vá em **Explorar GPTs** → **Criar** (ou **Meus GPTs** se for editar um existente).
3. Abra a aba **Configurar**.
4. Nome sugerido: `Blimber Meta Ads`.
5. Descrição curta: assistência a Meta Ads (Facebook/Instagram) de tenants do Blimber Hub.

### 4. Colar as Instruções

1. Abra `gpt/blimber-meta/instructions.md`.
2. Copie o texto **abaixo** do cabeçalho (a partir de “Você é o assistente…”).
3. Cole no campo **Instruções** do editor do GPT (aba **Configurar**).

Essas regras mandam o GPT pedir `tenantId`, nunca misturar tenants, nunca expor tokens e só mutar após confirmação.

### 5. Configurar Ações (OpenAPI + auth)

1. Na aba **Configurar** → seção **Ações** → **Criar nova ação**.
2. Importe / cole o conteúdo de `gpt/blimber-meta/openapi.yaml` no campo do **esquema** (Schema).
3. Confirme `servers.url` (já vem fixo, **um único** hostname):
   - Produção: `https://app.blimber.com.br`
   - Não adicione um segundo `servers` com placeholder — o ChatGPT rejeita “multiple hostnames”.
4. **Autenticação**:
   - Tipo: **Chave de API** (API Key)
   - Tipo de autenticação / Auth Type: **Bearer**
   - Chave: valor de `BLIMBER_MCP_API_KEY`  
     (**sem** digitar o prefixo `Bearer ` no campo — o ChatGPT adiciona).
5. Salve / valide o esquema. Se o esquema for inválido, as ações não aparecem (ver Troubleshooting).

Detalhes também em `gpt/blimber-meta/gpt-actions.md`.

### 6. Anexar / carregar a Habilidade (Skill)

**Opção A — pasta**

Anexe / faça upload da pasta:

`gpt/blimber-meta/skills/blimber-meta-ads`

(incluindo o `SKILL.md`).

**Opção B — ZIP**

```bash
cd gpt/blimber-meta/skills
zip -r ../blimber-meta-ads.skill.zip blimber-meta-ads
```

O arquivo fica em `gpt/blimber-meta/blimber-meta-ads.skill.zip`.  
Faça upload via **Habilidades** e/ou **Conhecimento** na aba **Configurar** (o rótulo exato varia conforme a conta OpenAI).

A habilidade reforça o fluxo: integrações → campanhas/insights → pausar/ativar só com confirmação.

### 7. Salvar o GPT

Use **Criar** (GPT novo) ou **Atualizar** (GPT já existente).  
Privacidade sugerida: **Somente eu** (Only me) — ou compartilhado conforme política da empresa.  
Confirme que Instruções, Ações e Habilidade/Conhecimento estão ativos antes do primeiro teste na **Prévia**.

### 8. Primeiro teste: buscar cliente e listar integrações

No chat do GPT (por nome — preferido):

```
Busque o cliente Farmaestetica e diga se a Meta está conectada. Se houver vários matches, pergunte qual.
```

Ou com UUID:

```
Liste as integrações do tenant <TENANT_UUID> e diga se Meta está pronto.
```

O GPT deve chamar `searchTenants` (se for por nome) → obter `tenantId` → `listIntegrations` e resumir se `meta` / `meta_ready` está ok.  
Se vários matches: o GPT **lista e pergunta** antes de usar as Ações Meta.
### 9. Listar campanhas e insights

```
Liste as campanhas ACTIVE do tenant <TENANT_UUID>.
```

```
Mostre o spend dos últimos 7 dias (level=campaign) do tenant <TENANT_UUID>.
```

```
Liste os adsets da campanha <CAMPAIGN_ID> do tenant <TENANT_UUID>.
```

Fluxo saudável: o GPT já confirmou Meta conectado no passo 8.

### 10. (Opcional) Pausar / ativar — com riscos

Pausar ou ativar **afeta anúncios reais** (gastos, entrega, performance).

```
Pause a campanha <CAMPAIGN_ID> do tenant <TENANT_UUID>. Só execute depois da minha confirmação.
```

Esperado:

1. GPT chama `getCampaign` e resume nome/status.
2. Pede confirmação explícita (“sim”).
3. Só então chama `updateCampaignStatus` com `confirm: true` e `confirmTenantId` **igual** a `tenantId`.
4. No ChatGPT, ações marcadas como consequenciais (`x-openai-isConsequential: true`) também pedem confirmação na UI.

**Riscos:** pausar campanha errada, tenant errado, ou ativar campanha que não deveria gastar. Sempre confira IDs e o nome da campanha antes de confirmar.

---

## D. Como usar no dia a dia

### Prompts prontos (português)

```
Busque o cliente Farmaestetica e mostre o status da integração Meta.
```

```
Qual o status da integração Meta do tenant <TENANT_UUID>?
```

```
Liste as ad accounts do cliente Farmaestetica.
```

```
Campanhas ACTIVE do tenant <TENANT_UUID> (limit 50).
```

```
Insights last_7d level=campaign do cliente Farmaestetica. Resuma spend, impressões, cliques e CTR.
```

```
Insights de ontem (yesterday) level=adset do tenant <TENANT_UUID> só da campanha <CAMPAIGN_ID>.
```

```
Mostre o detalhe da campanha <CAMPAIGN_ID> do cliente Farmaestetica.
```

```
Liste anúncios ativos (activeOnly) da campanha <CAMPAIGN_ID> do tenant <TENANT_UUID>.
```

```
Ative a campanha <CAMPAIGN_ID> do cliente Farmaestetica — confirme comigo antes de executar.
```

### Quando o GPT deve buscar ou pedir `tenantId`

Se você der **só o nome**, o GPT chama `searchTenants` e usa o `id` como `tenantId`.  
Se houver vários matches, pergunta qual. Se zero, pede outro nome ou o UUID.  
**Sem `tenantId` (resolvido ou informado) o GPT não deve chamar Ações Meta.**  
Nunca misture dados de empresas diferentes na mesma conversa sem deixar o cliente explícito.

### Fluxo recomendado

```
0. searchTenants      → nome → tenantId (se ainda não tiver UUID)
1. listIntegrations     → Meta conectado?
2. listAdAccounts       → (opcional) contas disponíveis
3. listCampaigns        → IDs reais
4. getInsights          → performance (datePreset + level)
5. getCampaign          → detalhe antes de mutar
6. updateCampaignStatus → só após “sim” do usuário
```

### Limitações (MVP)

- **Não há** no GPT: criar/deletar campanha, editar budget em massa, Meta CAPI, Brand Center, campanhas orgânicas (`social_campaigns`).
- Ações exigem **HTTPS público**.
- Limites típicos das Ações OpenAI: timeout ~**45s**, payload texto ~**< 100k** caracteres.
- Um único security scheme no schema: **Bearer** (não dependa de header custom no OpenAPI do GPT).
- Tokens Meta **nunca** saem nas respostas; ficam cifrados em `marketing_integrations`.
- A API key confia no cliente do GPT: **sempre** use o `tenantId` correto.

---

## E. Troubleshooting

| Sintoma | Causa provável | O que fazer |
|---------|----------------|-------------|
| **401** Unauthorized | Bearer errado / ausente | Confira `BLIMBER_MCP_API_KEY` no servidor e em **Autenticação** no GPT (sem prefixo `Bearer ` no campo). Redeploy se acabou de criar a env. |
| **503** Service Unavailable | Env vazia no servidor | Defina `BLIMBER_MCP_API_KEY` (ou fallback `MARKETING_WORKER_SECRET`) e reinicie. |
| Ação falha / host errado | `servers.url` desatualizado | No esquema OpenAPI do GPT, aponte para o host HTTPS real do Blimber. |
| **localhost não funciona** | ChatGPT não alcança sua máquina | Use deploy / túnel **HTTPS público**. |
| Meta “não conectado” / erro de ownership | Tenant sem OAuth ou UUID errado | Reconecte Meta em Integrações no Hub; confira o `tenantId`. |
| Ação não aparece / esquema inválido | YAML quebrado, paths inválidos, security mal definido, `$ref` em parameters, múltiplos `servers` | Reimporte `openapi.yaml` (3.0.3, parameters inline, um único `https://app.blimber.com.br`); um scheme Bearer só. |
| Habilidade “não carregada” | Upload incompleto / ZIP sem `SKILL.md` | Reenvie a pasta `blimber-meta-ads` ou regenere o ZIP a partir de `skills/blimber-meta-ads`. |
| Mutação recusada | Falta `confirm` / `confirmTenantId` diferente | Confirme no chat; o GPT deve enviar `confirm: true` e IDs iguais. |
| Timeout / resposta cortada | Insights muito grandes ou Meta lenta | Reduza `limit`, período ou `level`; repita em fatias. |

Testes automatizados no repo:

```bash
pnpm test tests/meta-ads-tools.test.ts tests/gpt-meta-openapi.test.ts
```

---

## F. Referência rápida

### Operations (OpenAPI)

Fonte canônica: [`gpt/blimber-meta/openapi.yaml`](../gpt/blimber-meta/openapi.yaml). Não reinventar o contrato — ajustes de schema vão nesse arquivo.

| operationId | Método | Path |
|-------------|--------|------|
| `searchTenants` | GET | `/api/gpt/meta/tenants?q=` |
| `listMetaTools` | GET | `/api/gpt/meta/tools` |
| `listIntegrations` | GET | `/api/gpt/meta/integrations?tenantId=` |
| `listAdAccounts` | GET | `/api/gpt/meta/ad-accounts?tenantId=` |
| `listCampaigns` | GET | `/api/gpt/meta/campaigns?...` |
| `getCampaign` | GET | `/api/gpt/meta/campaigns/{campaignId}?tenantId=` |
| `updateCampaignStatus` | POST | `/api/gpt/meta/campaigns/{campaignId}/status` |
| `listAdsets` | GET | `/api/gpt/meta/adsets?...` |
| `listAds` | GET | `/api/gpt/meta/ads?...` |
| `getInsights` | POST | `/api/gpt/meta/insights` |
| `invokeMetaTool` | POST | `/api/gpt/meta/invoke` (fallback — **prefira** as rotas REST acima) |

`searchTenants` é busca administrativa (API key global): retorna só `id`/`name`/`slug`. Opcional `organizationId` limita ao portfólio em `organization_tenants`.  
Mutações exigem `confirm: true` + `confirmTenantId === tenantId`.  
`updateCampaignStatus` e `invokeMetaTool` marcam `x-openai-isConsequential: true`.

Implementação Nuxt: `server/api/gpt/meta/*`.

### Paths no repositório

| Artefato | Caminho |
|----------|---------|
| Tutorial (este arquivo) | `docs/gpt-blimber-meta-TUTORIAL.md` |
| Doc curto / arquitetura | `docs/gpt-blimber-meta.md` |
| OpenAPI | `gpt/blimber-meta/openapi.yaml` |
| Instruções (texto para colar na UI) | `gpt/blimber-meta/instructions.md` |
| Setup Ações | `gpt/blimber-meta/gpt-actions.md` |
| Skill | `gpt/blimber-meta/skills/blimber-meta-ads/SKILL.md` |
| Env exemplo | `.env.example` (`BLIMBER_MCP_API_KEY`) |
| Auth server | `server/utils/meta-gpt-auth.ts` |
| MCP opcional (Cursor) | `docs/mcp-blimber-meta.md` |

### Opcional (não é o caminho do usuário final no ChatGPT)

| Modo | Quando |
|------|--------|
| `pnpm mcp:meta` (stdio) | Dev local Cursor / Claude Desktop |
| `POST /api/internal/mcp/meta/invoke` | Bridge legado de agents |
| Skill Cursor `.agents/skills/blimber-meta-ads` | Legado — aponta para este fluxo GPT |

---

## Checklist rápido (execute agora)

- [ ] `BLIMBER_MCP_API_KEY` definida no deploy HTTPS
- [ ] `curl` em `/api/gpt/meta/tools` retorna 200 com Bearer
- [ ] Meta OAuth ativo no tenant de teste (nome ou `tenantId` em mãos)
- [ ] GPT criado + texto colado em **Instruções**
- [ ] OpenAPI importado em **Ações** + `servers.url` correto + **Autenticação** Bearer
- [ ] Habilidade/Conhecimento anexado (pasta ou ZIP)
- [ ] Prompt: listar integrações do tenant
- [ ] Prompt: campanhas / insights `last_7d`
- [ ] (Opcional) pausar/ativar **só** com confirmação consciente
