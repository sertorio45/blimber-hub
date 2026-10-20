# Blimber CMS — API Pública v1

Contrato entre o **Blimber Hub** e os sites dos clientes. O site externo **não** acessa o banco de dados: ele só consome esta API.

- **Base (produção):** `https://app.blimber.com.br/api/public/cms/v1`
- **`siteKey`:** identificador público do site (vai na URL, ex.: `horizon-imoveis`). Não é segredo e não autentica ninguém.
- **Autenticação:** nenhuma. Só conteúdo **publicado** é servido.
- **Atualizado em:** 2026-10-20

---

## 1. Convenções

### Envelope

Toda resposta usa o mesmo envelope:

```json
{ "data": { } }
```

Erros:

```json
{ "error": { "code": "not_found", "message": "Página não encontrada" } }
```

### Situações e códigos

| Situação | HTTP | `code` |
|---|---|---|
| Caminho desconhecido, rascunho, lixeira ou site inativo | 404 | `not_found` |
| Documento que já foi ao ar e foi retirado | 410 | `gone` |
| Caminho antigo apontando para o documento atual | 200 (corpo com `redirect`) | — |
| Coleção desconhecida ou site inativo (rotas de coleções) | 404 | `not_found` |
| Token de preview expirado ou adulterado | 401 | `unauthenticated` |

> Nas respostas de **redirect**, o site deve responder **HTTP 301** para `data.redirect.to`.

### Cache e cabeçalhos

| Resposta | `Cache-Control` | `X-Robots-Tag` |
|---|---|---|
| `resolve`, `publications`, `collections` | `public, max-age=60, s-maxage=300, stale-while-revalidate=600` | `index, follow` (ou `noindex, nofollow` se `seo.noindex`) |
| `sitemap` / `sitemap.xml` | mesmo cache público | `noindex, nofollow` |
| `preview`, erros 404/410 | `no-store` | `noindex, nofollow` |

CORS aberto para leitura (`Access-Control-Allow-Origin: *`); o navegador do visitante nunca envia cookie de administração.

### Salvar = publicar

Não existe etapa separada de publicação: **salvou no Hub, a API já serve** (respeitado o cache acima). Isso vale para páginas, registros de coleções e campos. Rascunho é apenas o status inicial de um registro novo — basta salvar como publicado.

---

## 2. Rotas

### 2.1 `GET /sites/:siteKey/resolve?path=&locale=`

Retorna a página completa daquele caminho (`/`, `/sobre`, `/artigos/guia`...). Sem `locale`, vale o idioma padrão do site.

```json
{
  "data": {
    "id": "…",
    "kind": "page",
    "publicationType": null,
    "locale": "pt-BR",
    "path": "/sobre",
    "revisionId": "…",
    "publishedAt": "2026-10-20T10:00:00.000Z",
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
      "siteKey": "horizon-imoveis",
      "name": "Horizon Imóveis",
      "locale": "pt-BR",
      "defaultLocale": "pt-BR",
      "menus": [{ "key": "header", "items": [{ "label": "Início", "href": "/" }] }],
      "theme": { "colorPrimary": "#0F3D2E", "fontFamily": "Fraunces, serif" },
      "seo": { "title": "Horizon Imóveis" }
    }
  }
}
```

- `data.seo` é o SEO **da página publicada** — use no `<title>`, meta description, canonical e `noindex`.
- `data.site.seo` é o padrão do site; preenche o que a página não definiu.
- `data.site.menus`: lista `{ key, items }`; item `{ label, href, children? }` (um nível). `href` só pode ser caminho (`/…`) ou `https://`.
- `data.site.theme`: apenas os tokens `colorBackground`, `colorForeground`, `colorPrimary`, `colorPrimaryForeground`, `colorMuted`, `colorBorder`, `fontFamily`, `fontFamilyHeading`, `radius`.
- `content` **nunca** inclui rascunho (`draftPayload` não é selecionado).

Redirect:

```json
{ "data": { "redirect": { "to": "/sobre", "status": 301 }, "site": { "siteKey": "horizon-imoveis" } } }
```

### 2.2 `GET /sites/:siteKey/publications?type=&locale=&cursor=&limit=`

Feed de artigos e notícias **publicados**, do mais novo para o mais antigo.

| Parâmetro | Valores |
|---|---|
| `type` | `article` ou `news` (vazio = ambos) |
| `cursor` | cursor da página anterior (`nextCursor`) |
| `limit` | itens por página |

Cada item tem o mesmo formato do `resolve`, porém `content` **não** traz `body` nem `blocks`. Para a página inteira, chame `resolve` com o `path` do item.

### 2.3 `GET /sites/:siteKey/collections`

Lista as coleções do site:

```json
{
  "data": [
    { "key": "imoveis", "name": "Imóveis", "schema": { "version": 1, "fields": [ ] } },
    { "key": "depoimentos", "name": "Depoimentos", "schema": { "version": 1, "fields": [ ] } }
  ]
}
```

### 2.4 `GET /sites/:siteKey/collections/:collectionKey?limit=`

Retorna uma coleção com seus registros **publicados** (rascunho nunca sai), do atualizado mais recente para o mais antigo:

```json
{
  "data": {
    "collection": { "key": "imoveis", "name": "Imóveis", "schema": { "version": 1, "fields": [ ] } },
    "entries": [
      { "id": "…", "payload": { "titulo": "Cobertura duplex no Bigorrilho" }, "updatedAt": "2026-10-20T09:00:00.000Z" }
    ]
  }
}
```

Exemplo real (trecho do `payload` de um imóvel):

```json
{
  "titulo": "Cobertura duplex no Bigorrilho",
  "foto-capa": {
    "assetId": "a1000000-0000-4000-8000-000000000613",
    "objectPath": "a1000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000613/original.jpg",
    "alt": "Cobertura duplex no Bigorrilho ao entardecer"
  },
  "galeria": [
    { "assetId": "a1000000-0000-4000-8000-000000000614", "objectPath": "…/original.jpg", "alt": "Sala ampla com ilha de cozinha" }
  ],
  "preco": 1890000,
  "quartos": 4
}
```

### 2.5 Sitemap

- `GET /sites/:siteKey/sitemap` → `{ "data": [{ "path", "loc", "lastmod", "locale", "kind", "publicationType" }] }`
- `GET /sites/:siteKey/sitemap.xml` → XML `urlset` (`Content-Type: application/xml`)

Só entram rotas canônicas de documentos publicados (teto de 5.000 URLs). `loc` usa o domínio primário verificado do site quando ele existe; senão repete `path`. O site deve publicar seu `/sitemap.xml` fazendo proxy desta rota (ou montar as URLs a partir de `path`) e cuidar do próprio `/robots.txt`.

### 2.6 Preview

1. No Hub (com sessão): `POST /api/cms/documents/:id/preview-token` → `{ "data": { "token", "expiresAt", "revisionId", "previewPath" } }`
2. O site chama `GET /api/public/cms/v1/preview?token=`

O token dura **10 minutos**, é opaco (HMAC) e carrega só tenant, site, documento, revisão e expiração. A resposta segue o formato do `resolve`, com `preview: true` e `seo.noindex: true`. O preview mostra **uma revisão salva**, nunca o rascunho em edição.

---

## 3. Coleções e campos

O `schema` de cada coleção declara os campos; o `payload` de cada registro segue esses campos.

| Tipo | Valor no `payload` |
|---|---|
| `text` | string |
| `number` | número |
| `boolean` | `true` / `false` |
| `media` | **referência de mídia** (abaixo) |
| `gallery` | **lista** de referências de mídia, na ordem escolhida no Hub |

### Referências de mídia

Imagem **nunca** sai como URL assinada (ela expira). Sai a referência permanente:

```json
{ "assetId": "uuid-do-arquivo", "objectPath": "tenant/arquivo/original.jpg", "alt": "Texto alternativo", "credit": "opcional" }
```

- `assetId` e `objectPath` são obrigatórios na prática (`objectPath` pode vir ausente em registros antigos).
- O renderer resolve a referência para a URL exibível no próprio domínio. Exemplo de uso: fotos de imóveis (`foto-capa`, `galeria`), foto de corretor, logo de parceiro.
- Campo vazio sai como `null` (mídia) ou `[]` (galeria).

---

## 4. Blocos vinculados a coleções

Blocos `testimonials`, `cards` e `faq` podem apontar para uma coleção. A página guarda **só a referência** — nunca uma cópia dos dados:

```json
{
  "type": "testimonials",
  "props": {
    "title": "Quem já encontrou o próximo endereço",
    "collectionKey": "depoimentos",
    "collectionLimit": 4,
    "items": []
  }
}
```

No `resolve`, a API **substitui `props.items`** pelos registros publicados da coleção antes de responder — o site recebe os itens prontos, como se fossem manuais:

| Bloco | Item gerado | Campos de origem (primeiro que existir) |
|---|---|---|
| `testimonials` | `{ quote, author, role }` | `depoimento`/`quote`/`texto`/`descricao` · `nome`/`author`/`autor` · `papel`/`role`/`cargo` |
| `faq` | `{ question, answer }` | `pergunta`/`question`/`titulo` · `resposta`/`answer`/`descricao` |
| `cards` | `{ title, description, href }` | `titulo`/`nome`/`title` · `descricao`/`resumo`/`bio`/`depoimento`/`texto` · `href`/`link`/`url`/`site-url` |

Regras:

- `collectionLimit` limita a quantidade (1–20, padrão 6).
- Se **qualquer** registro tiver o campo numérico `ordem`, a lista é ordenada por ele (ascendente); senão, do atualizado mais recente.
- Se a coleção não existir, valem os `items` gravados na página (fallback).
- Editar a coleção reflete em todas as páginas vinculadas — sem tocar nas páginas.

---

## 5. Mapa de blocos

`content.blocks` é uma lista de `{ id, type, version, props, children? }`. Se `blocks` vier vazio, renderize `content.body` como HTML sanitizado. **Tipo desconhecido: ignore o bloco e siga** — nunca quebre a página.

| `type` | `props` |
|---|---|
| `section` | `label`, `background` (`default`/`muted`/`contrast`), `padding` (`none`/`sm`/`md`/`lg`), `width` (`full`/`contained`) + `children` |
| `hero` | `eyebrow`, `title`, `subtitle`, `align` (`start`/`center`), `image` (mídia), `primaryCta` / `secondaryCta` (`{ label, href }`) |
| `richText` | `html` |
| `imageText` | `title`, `body`, `image` (mídia), `imagePosition` (`left`/`right`) |
| `cards` | `title`, `columns` (`2`/`3`/`4`), `collectionKey`, `collectionLimit`, `items[]` (`{ title, description, href }`) |
| `faq` | `title`, `collectionKey`, `collectionLimit`, `items[]` (`{ question, answer }`) |
| `testimonials` | `title`, `collectionKey`, `collectionLimit`, `items[]` (`{ quote, author, role }`) |
| `cta` | `title`, `description`, `buttonLabel`, `buttonHref`, `tone` (`default`/`primary`) |
| `gallery` | `title`, `columns` (`2`/`3`/`4`), `images[]` (`{ image` (mídia)`, caption }`) |
| `latestPublications` | `title`, `publicationType` (`all`/`article`/`news`), `limit` (1–12) |

Campos de mídia dentro dos blocos usam a mesma referência `{ assetId, objectPath?, alt?, credit? }` da seção 3.

---

## 6. Exemplos rápidos

```bash
# Página inicial já com os blocos expandidos das coleções
curl "https://app.blimber.com.br/api/public/cms/v1/sites/horizon-imoveis/resolve?path=/"

# Imóveis com foto de capa e galeria
curl "https://app.blimber.com.br/api/public/cms/v1/sites/horizon-imoveis/collections/imoveis"

# Depoimentos publicados
curl "https://app.blimber.com.br/api/public/cms/v1/sites/horizon-imoveis/collections/depoimentos"

# Artigos mais recentes
curl "https://app.blimber.com.br/api/public/cms/v1/sites/horizon-imoveis/publications?type=article&limit=10"
```

---

## 7. Resumo das rotas

| Método | Rota | Descrição |
|---|---|---|
| GET | `/sites/:siteKey/resolve?path=&locale=` | Página completa (blocos vinculados já expandidos) |
| GET | `/sites/:siteKey/publications?type=&locale=&cursor=&limit=` | Feed de artigos/notícias publicados |
| GET | `/sites/:siteKey/collections` | Coleções do site (chave, nome, schema) |
| GET | `/sites/:siteKey/collections/:collectionKey?limit=` | Registros publicados de uma coleção |
| GET | `/sites/:siteKey/sitemap` | Sitemap em JSON |
| GET | `/sites/:siteKey/sitemap.xml` | Sitemap em XML |
| GET | `/preview?token=` | Preview de uma revisão (token de 10 min) |

## Changelog

- **2026-10-20** — Rotas públicas de coleções (`/collections`, `/collections/:collectionKey`); blocos vinculados expandidos no `resolve`; novo tipo de campo `gallery` (lista de mídias); salvar no Hub publica imediatamente.
- **2026-10-19** — Contrato inicial: `resolve`, `publications`, `sitemap`, `preview`, mapa de blocos.
