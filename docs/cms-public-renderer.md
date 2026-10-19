# CMS — contrato do site público (Vercel)

Este documento é o contrato entre o Hub e o site Nuxt hospedado na Vercel. O site **não** acessa o Postgres. Ele só chama a API pública do Hub.

`siteKey` é um identificador público (vai na URL). Não é segredo e não autentica ninguém. Segredos de webhook, token de verificação de domínio e `draft_payload` nunca saem por essas rotas.

Base: `https://<hub>/api/public/cms/v1`

Todas as respostas de sucesso e de erro usam o envelope do CMS. Erro:

```json
{ "error": { "code": "not_found", "message": "Página não encontrada" } }
```

## Cabeçalhos

| Resposta | `Cache-Control` | `X-Robots-Tag` | CORS |
|---|---|---|---|
| `resolve` e feed publicados | `public, max-age=60, s-maxage=300, stale-while-revalidate=600` | `index, follow`, ou `noindex, nofollow` se `seo.noindex` | `Access-Control-Allow-Origin: *` |
| redirect no `resolve` | o mesmo cache público | `noindex, nofollow` | GET, OPTIONS |
| sitemap JSON e XML | o mesmo cache público | `noindex, nofollow` | GET, OPTIONS |
| preview, 404 e 410 | `no-store` | `noindex, nofollow` | GET, OPTIONS |

`Vary: Accept-Encoding` em todas. Não há `Access-Control-Allow-Credentials`: o browser do visitante não manda cookie de admin.

O renderer deve copiar `X-Robots-Tag` para o HTML. Em redirect, responder **HTTP 301** para `data.redirect.to` (caminho do mesmo site). Não indexar a URL antiga.

| Situação | HTTP no site | `code` da API |
|---|---|---|
| Caminho desconhecido, rascunho, lixeira ou site inativo | 404 | `not_found` |
| Documento que já foi ao ar e foi retirado | 410 | `gone` |
| Caminho antigo ainda apontando para o documento | 301 | corpo com `redirect.status: 301` |

## `GET /sites/:siteKey/resolve?path=&locale=`

`path` é o caminho do site (`/`, `/sobre`, `/artigos/guia`). Sem `locale`, vale o idioma padrão do site.

Documento publicado:

```json
{
  "data": {
    "id": "…",
    "kind": "page",
    "publicationType": null,
    "locale": "pt-BR",
    "path": "/sobre",
    "revisionId": "…",
    "publishedAt": "2026-10-19T15:00:00.000Z",
    "content": {
      "title": "Sobre",
      "slug": "sobre",
      "excerpt": "",
      "body": "<p>…</p>",
      "blocks": [],
      "seo": { "title": "Sobre a empresa", "description": "…", "noindex": false }
    },
    "seo": { "title": "Sobre a empresa", "description": "…", "noindex": false },
    "site": {
      "siteKey": "empresa-a",
      "name": "Empresa A",
      "locale": "pt-BR",
      "defaultLocale": "pt-BR",
      "menus": [{ "key": "header", "items": [{ "label": "Início", "href": "/" }] }],
      "theme": { "colorPrimary": "#112233", "fontFamily": "Inter, sans-serif" },
      "seo": { "title": "Empresa A" }
    }
  }
}
```

- `data.seo` é o SEO **da revisão publicada** (`content.seo`). Use-o no `<title>`, na meta description, no canonical e no `noindex`.
- `data.site.seo` é o padrão do site (`settings.seo`). Preenche o que a página não definiu. Não contém chaves fora do contrato (`title`, `description`, `canonicalUrl` https, `noindex`, `socialImage`).
- `data.site.menus` sai de `settings.menus`. Aceita uma lista `{ key, items }` ou um mapa `{ "header": [itens] }`. Item: `{ label, href, children? }` com um nível de filhos. `href` só pode ser caminho (`/…`) ou `https://`. Lista vazia significa que o site ainda não configurou menu — o renderer mostra o fallback dele, sem inventar página.
- `data.site.theme` sai de `settings.theme`, só com estes tokens: `colorBackground`, `colorForeground`, `colorPrimary`, `colorPrimaryForeground`, `colorMuted`, `colorBorder`, `fontFamily`, `fontFamilyHeading`, `radius`.
- O objeto `settings` bruto não é devolvido. Webhooks e outros campos ficam no Hub.

Redirect:

```json
{ "data": { "redirect": { "to": "/sobre", "status": 301 }, "site": { "siteKey": "empresa-a" } } }
```

`content` nunca inclui `draftPayload` / `draft_payload`. A API também não seleciona essa coluna.

## `GET /sites/:siteKey/publications?type=&locale=&cursor=&limit=`

Feed de artigos e notícias **publicados**, do mais novo para o mais antigo. `type` é `article` ou `news`. Cada item tem o mesmo formato do documento, porém `content` não traz `body` nem `blocks` (lista). Para a página inteira, chame `resolve` com o `path` do item.

## Sitemap

- `GET /sites/:siteKey/sitemap` → `{ "data": [ { "path", "loc", "lastmod", "locale", "kind", "publicationType" } ] }`
- `GET /sites/:siteKey/sitemap.xml` → XML `urlset` (`Content-Type: application/xml`)

Só entram rotas canônicas (`route_kind = document`) de documentos publicados. Rascunho, lixeira, redirect e conteúdo retirado ficam de fora. `path` é relativo ao site. `loc` é `https://<domínio primário verificado><path>` quando esse domínio existe; senão repete `path`.

O site na Vercel deve publicar `/sitemap.xml` fazendo proxy desta rota (assim o `loc` absoluto usa o domínio do cliente) ou montar as URLs com a origem dele a partir de `path`. `/robots.txt` também é responsabilidade do site, por exemplo:

```txt
User-agent: *
Allow: /

Sitemap: https://www.cliente.com.br/sitemap.xml
```

O teto desta versão é 5000 URLs, as publicadas mais recentemente.

## Preview

O preview mostra **uma revisão** (`cms_revisions.snapshot`), nunca o rascunho.

1. No Hub, com sessão de quem tem `cms.read`:

   `POST /api/cms/documents/:id/preview-token`

   Corpo opcional: `{ "revisionId": "<uuid>" }`. Sem id, usa a revisão de maior `revision_number`. Se não existir revisão, a resposta é 422 — é preciso ter um checkpoint, revisão de publicação ou restauração. O rascunho sozinho não é pré-visualizado.

2. Resposta:

   ```json
   {
     "data": {
       "token": "<opaco>",
       "expiresAt": "2026-10-19T12:10:00.000Z",
       "revisionId": "…",
       "previewPath": "/api/public/cms/v1/preview?token=<opaco>"
     }
   }
   ```

3. O site chama `GET /api/public/cms/v1/preview?token=`. O token dura 10 minutos, é HMAC-SHA256 (`CMS_PREVIEW_SECRET`, senão `NUXT_CMS_PREVIEW_SECRET`, senão `API_SECRET`) e carrega só versão, tenant, site, documento, revisão e expiração. Não leva usuário, cookie nem sessão. A URL pública não tem outro segredo de admin.

A resposta segue o `resolve`, com `preview: true` e `seo.noindex: true`. Token expirado: 401 `unauthenticated` (“O link de pré-visualização expirou”) e zero leitura no banco. Token adulterado: 401, mesma ausência de leitura. `Cache-Control: no-store`.

## Mapa de blocos

`content.blocks` é uma lista de `{ id, type, version, props, children? }`. Se `blocks` vier vazio, renderize `content.body` como HTML sanitizado.

| `type` | `props` que o renderer entende |
|---|---|
| `hero` | `title`, `subtitle`, `media`, `href` |
| `rich_text` | `html` |
| `heading` | `level` (1–6), `text` |
| `image` | `media`, `caption` |
| `quote` | `text`, `citation` |
| `embed` | `url` (somente https), `title` |
| `button` | `label`, `href` |
| `gallery` | `items` (lista de `media`) |

`media` é `{ assetId, objectPath?, alt?, credit? }`. Não é uma URL assinada. O renderer resolve a mídia pelo `assetId` no próprio domínio, sem guardar URL temporária em HTML cacheado.

Tipo desconhecido: ignorar o bloco e seguir. Não quebrar a página.

## Invalidação

Publicar e despublicar já gravam `cms_audit_events` dentro das RPCs. A migration `cms_event_outbox` copia `publish` e `unpublish` para uma fila (`status = pending`) na mesma transação. O payload é o metadata da auditoria (caminho, número da revisão), nunca o rascunho.

Nesta fase ninguém consome a fila nem chama webhook. O site deve respeitar o `Cache-Control` acima. Um worker futuro vai marcar `delivered_at` e avisar o renderer; a URL de webhook, se existir em `settings`, continua só no servidor.

`enqueueCmsInvalidation` existe para eventos que **não** passam pela auditoria de publish/unpublish. Não chame o helper depois dessas RPCs, senão o job sai duplicado.
