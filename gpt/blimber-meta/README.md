# Pack GPT — Blimber Meta Ads

Entrega **para ChatGPT** (Custom GPT Actions + Skill).  
O plugin clássico ChatGPT (`ai-plugin.json`) está **deprecated** — não use.

| Arquivo | Uso |
|---------|-----|
| [`openapi.yaml`](./openapi.yaml) | Importar em **Create a GPT → Actions → Schema** |
| [`instructions.md`](./instructions.md) | Colar em **Instructions** do Custom GPT |
| [`skills/blimber-meta-ads/`](./skills/blimber-meta-ads/) | Skill OpenAI (`SKILL.md` + references) — anexar Knowledge ou upload ZIP |
| [`gpt-actions.md`](./gpt-actions.md) | Setup detalhado no ChatGPT |

Docs completas (PT-BR): [`docs/gpt-blimber-meta.md`](../../docs/gpt-blimber-meta.md)

## Zip da skill

```bash
cd gpt/blimber-meta/skills
zip -r ../blimber-meta-ads.skill.zip blimber-meta-ads
# ZIP com pasta top-level blimber-meta-ads/ (SKILL.md na raiz do bundle)
```

## Auth

No editor do GPT: **Authentication → API Key → Bearer**  
Valor = `BLIMBER_MCP_API_KEY` do servidor (HTTPS público obrigatório).
