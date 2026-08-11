# Pack GPT — Blimber Meta Ads

> **Plataforma unificada:** Marketing editorial + hub em `gpt/blimber/` e `docs/mcp-blimber-platform.md`.  
> Este pack Meta **continua válido** — mesmas rotas `/api/gpt/meta/*` e `BLIMBER_MCP_API_KEY`.

Entrega **para ChatGPT** (Ações do GPT + Habilidade).  
O plugin clássico ChatGPT (`ai-plugin.json`) está **descontinuado** — não use.

| Arquivo | Uso na UI (PT) |
|---------|----------------|
| [`openapi.yaml`](./openapi.yaml) | **Explorar GPTs** → **Criar** → **Configurar** → **Ações** → **Criar nova ação** → esquema OpenAPI |
| [`instructions.md`](./instructions.md) | Colar em **Instruções** (aba **Configurar**) |
| [`skills/blimber-meta-ads/`](./skills/blimber-meta-ads/) | Anexar em **Conhecimento** / **Habilidades** (ou enviar o ZIP) |
| [`gpt-actions.md`](./gpt-actions.md) | Configuração detalhada no ChatGPT |

Documentação completa (PT-BR): [`docs/gpt-blimber-meta.md`](../../docs/gpt-blimber-meta.md)  
Tutorial: [`docs/gpt-blimber-meta-TUTORIAL.md`](../../docs/gpt-blimber-meta-TUTORIAL.md)

## Zip da skill

```bash
cd gpt/blimber-meta/skills
zip -r ../blimber-meta-ads.skill.zip blimber-meta-ads
# ZIP com pasta top-level blimber-meta-ads/ (SKILL.md na raiz do bundle)
```

## Autenticação

No editor do GPT: **Autenticação** → **Chave de API** → **Bearer**  
Valor = `BLIMBER_MCP_API_KEY` do servidor (HTTPS público obrigatório).
