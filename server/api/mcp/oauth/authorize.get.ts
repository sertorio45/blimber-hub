import { createError, defineEventHandler, getQuery, sendRedirect, setHeader } from 'h3'
import { resolveMetaGptApiSecret } from '~/server/utils/meta-gpt-auth'
import {
  BLIMBER_MCP_OAUTH_SCOPE,
  getMcpRequestOrigin,
  parseOAuthAuthorizeQuery,
  resolveMcpPublicBaseUrl,
  resolveMcpResourceUrl,
  validateOAuthClientRedirect,
} from '~/server/utils/blimber-mcp-oauth'

function renderAuthorizePage(input: {
  baseUrl: string
  responseType: string
  clientId: string
  redirectUri: string
  scope: string
  state: string
  codeChallenge: string
  codeChallengeMethod: string
  resource: string
  error?: string
}) {
  const hiddenFields = [
    ['response_type', input.responseType],
    ['client_id', input.clientId],
    ['redirect_uri', input.redirectUri],
    ['scope', input.scope],
    ['state', input.state],
    ['code_challenge', input.codeChallenge],
    ['code_challenge_method', input.codeChallengeMethod],
    ['resource', input.resource],
  ]
    .map(([name, value]) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}" />`)
    .join('\n')

  const errorBlock = input.error
    ? `<p class="error">${escapeHtml(input.error)}</p>`
    : ''

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Conectar Blimber Hub MCP</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b0b0c; color: #f4f4f5; }
    main { width: min(420px, calc(100vw - 2rem)); background: #18181b; border: 1px solid #3f3f46; border-radius: 16px; padding: 1.75rem; box-shadow: 0 24px 80px rgba(0,0,0,.45); }
    h1 { margin: 0 0 .35rem; font-size: 1.35rem; }
    p { margin: 0 0 1rem; color: #a1a1aa; line-height: 1.5; font-size: .95rem; }
    label { display: block; font-size: .85rem; margin-bottom: .45rem; color: #d4d4d8; }
    input[type="password"] { width: 100%; box-sizing: border-box; border-radius: 10px; border: 1px solid #52525b; background: #09090b; color: inherit; padding: .75rem .85rem; font-size: 1rem; }
    button { margin-top: 1rem; width: 100%; border: 0; border-radius: 10px; background: #fafafa; color: #18181b; font-weight: 600; padding: .8rem 1rem; cursor: pointer; }
    button:hover { background: #e4e4e7; }
    .error { color: #fca5a5; background: rgba(239,68,68,.12); border: 1px solid rgba(239,68,68,.35); padding: .65rem .75rem; border-radius: 8px; }
    .meta { margin-top: 1rem; font-size: .78rem; color: #71717a; word-break: break-all; }
  </style>
</head>
<body>
  <main>
    <h1>Blimber Hub MCP</h1>
    <p>Autorize o ChatGPT a acessar as ferramentas MCP do Blimber Hub. Informe a chave de API staff (<code>BLIMBER_MCP_API_KEY</code>) uma vez; o servidor emitirá um token OAuth de curta duração.</p>
    ${errorBlock}
    <form method="post" action="${escapeHtml(`${input.baseUrl}/api/mcp/oauth/authorize`)}">
      ${hiddenFields}
      <label for="api_key">Chave de API Blimber</label>
      <input id="api_key" name="api_key" type="password" autocomplete="off" required placeholder="Cole sua BLIMBER_MCP_API_KEY" />
      <button type="submit">Autorizar conexão</button>
    </form>
    <p class="meta">Cliente: ${escapeHtml(input.clientId)}<br/>Escopos: ${escapeHtml(input.scope)}</p>
  </main>
</body>
</html>`
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;')
}

export default defineEventHandler(async (event) => {
  const baseUrl = resolveMcpPublicBaseUrl(getMcpRequestOrigin(event))
  const query = parseOAuthAuthorizeQuery(event)
  const resource = query.resource || resolveMcpResourceUrl(baseUrl)

  if (query.responseType !== 'code') {
    throw createError({ statusCode: 400, statusMessage: 'response_type deve ser code' })
  }

  if (!query.clientId || !query.redirectUri || !query.codeChallenge) {
    throw createError({ statusCode: 400, statusMessage: 'Parâmetros OAuth incompletos' })
  }

  const clientValid = await validateOAuthClientRedirect(query.clientId, query.redirectUri)
  if (!clientValid) {
    throw createError({ statusCode: 400, statusMessage: 'client_id ou redirect_uri inválidos' })
  }

  if (!resolveMetaGptApiSecret()) {
    throw createError({ statusCode: 503, statusMessage: 'BLIMBER_MCP_API_KEY não configurado no servidor' })
  }

  const error = String(getQuery(event).error || '')
  setHeader(event, 'Content-Type', 'text/html; charset=utf-8')
  setHeader(event, 'Cache-Control', 'no-store')

  return renderAuthorizePage({
    baseUrl,
    responseType: query.responseType,
    clientId: query.clientId,
    redirectUri: query.redirectUri,
    scope: query.scope || BLIMBER_MCP_OAUTH_SCOPE,
    state: query.state,
    codeChallenge: query.codeChallenge,
    codeChallengeMethod: query.codeChallengeMethod,
    resource,
    error: error || undefined,
  })
})
