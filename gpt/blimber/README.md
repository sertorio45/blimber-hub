# Pack GPT — Blimber Hub (unificado)

Fundação do assistente ChatGPT: **Marketing editorial** + ponte **Meta Ads**.

| Artefato | Arquivo |
|----------|---------|
| OpenAPI | `openapi.yaml` |
| Instruções | `instructions.md` |
| Skill (platform) | `skills/blimber-platform/SKILL.md` |
| Skill (hub espelho) | `skills/blimber-hub/SKILL.md` |

## Setup

1. GPT → colar `instructions.md`
2. **Ação 1:** `openapi.yaml` → Bearer `BLIMBER_MCP_API_KEY`
3. **Ação 2 (Ads write completo):** `../blimber-meta/openapi.yaml`
4. Env: `BLIMBER_MCP_API_KEY` + `BLIMBER_MCP_ACTOR_USER_ID`

Docs: `docs/mcp-blimber-platform.md`, `docs/gpt-blimber-MARKETING.md`, `docs/gpt-blimber-UNIFIED-PLAN.md`.
