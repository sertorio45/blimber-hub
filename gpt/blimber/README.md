# Pack GPT — Blimber Hub (unificado)

**Uma Ação** no ChatGPT: Marketing editorial + Meta Ads write + platform.

| Artefato | Arquivo |
|----------|---------|
| OpenAPI (**importe só este**) | `openapi.yaml` |
| Instruções | `instructions.md` |
| Skill (platform) | `skills/blimber-platform/SKILL.md` |
| Skill (hub espelho) | `skills/blimber-hub/SKILL.md` |

## Setup

1. GPT → colar `instructions.md` (a partir de “Você é o assistente…”)
2. **Ações → uma Ação só:** importe `openapi.yaml` → Bearer `BLIMBER_MCP_API_KEY`
3. **Não** importe `../blimber-meta/openapi.yaml` neste GPT. O ChatGPT recusa o mesmo `servers.url` (`https://app.blimber.com.br`) em duas ações: *«Conjuntos de ações não podem ter domínios duplicados»*.
4. Pack `gpt/blimber-meta` = **outro GPT** (só Ads). Mesma API key.
5. Env: `BLIMBER_MCP_API_KEY` + `BLIMBER_MCP_ACTOR_USER_ID` (creates editoriais)

Docs: `docs/mcp-blimber-platform.md`, `docs/gpt-blimber-MARKETING.md`, `docs/gpt-blimber-UNIFIED-PLAN.md`.
