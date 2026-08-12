# Blimber MCP — servidor HTTP local

Servidor **Streamable HTTP** para uso com **túnel** no ChatGPT Developer Mode quando você não quer depender do deploy Vercel.

## Uso

```bash
# Na raiz do repo (usa .env)
pnpm mcp:blimber

# Ou dentro desta pasta
pnpm install && pnpm start
```

Endpoint: `http://127.0.0.1:8787/mcp`

## Túnel (ChatGPT)

1. Inicie o servidor local (`pnpm mcp:blimber`)
2. Exponha com ngrok ou Cloudflare Tunnel:
   ```bash
   ngrok http 8787
   ```
3. No ChatGPT → Developer Mode → Novo plugin:
   - URL: `https://<subdominio-ngrok>/mcp`
   - Auth: Bearer `BLIMBER_MCP_API_KEY`

## Env

Mesmas variáveis do Hub:

- `BLIMBER_MCP_API_KEY` (obrigatório)
- `BLIMBER_MCP_ACTOR_USER_ID` (opcional, writes marketing)
- `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`

Opcionais:

- `BLIMBER_MCP_PORT` (default `8787`)
- `BLIMBER_MCP_HOST` (default `127.0.0.1`)

## Produção

Prefira o endpoint hospedado no Nuxt:

`https://app.blimber.com.br/api/mcp`

Ver [`docs/gpt-blimber-MCP-PLUGIN.md`](../../docs/gpt-blimber-MCP-PLUGIN.md).

Reutiliza `lib/blimber-mcp/create-server.ts` — mesmas tools que `/api/gpt/*`.
