# Meta Ads — Click-to-WhatsApp (CTWA)

**Data:** 2026-08-11  
**Graph default no projeto:** `META_GRAPH_VERSION` ou `v20.0` (`lib/meta-ads/graph.ts`)  
**Docs Meta consultadas:** [Ads that Click to WhatsApp](https://developers.facebook.com/docs/marketing-api/ad-creative/messaging-ads/click-to-whatsapp/) (Marketing API; exemplos em v25.0 — contrato estável `destination_type` / `WHATSAPP_MESSAGE`)

---

## Princípio

`WHATSAPP` é **destination** (adset + creative), **não** campaign `objective`.

Objectives de campanha permanecem Outcome_*:

`OUTCOME_AWARENESS` | `OUTCOME_TRAFFIC` | `OUTCOME_ENGAGEMENT` | `OUTCOME_LEADS` | `OUTCOME_SALES` | `OUTCOME_APP_PROMOTION`

CTWA (single-destination) aceita campanhas: `OUTCOME_ENGAGEMENT`, `OUTCOME_LEADS`, `OUTCOME_SALES`, `OUTCOME_TRAFFIC`.

---

## Fluxo GPT / Postman

1. `createCampaign` — objective Outcome_* compatível (ex. `OUTCOME_ENGAGEMENT`), `dryRun` → execute.
2. `createAdset` — `destinationType=WHATSAPP`, `billingEvent=IMPRESSIONS`, `optimizationGoal=CONVERSATIONS` (ou matriz oficial × objective), `targetingTemplate` BR_*, budget; exige `page_id` na integração.
3. `createAd` — `destinationType=WHATSAPP`, `message` (copy), **sem** `linkUrl`; opcional `welcomeMessage` / mídia.
4. Sempre: `confirm` + `confirmTenantId`, default `dryRun: true` — o preview `.body` é o payload Graph sanitizado.

### Segurança

- Não inventar `linkUrl`, `wa.me`, `api.whatsapp.com` como URL de usuário.
- WEBSITE: `linkUrl` de site obrigatório; wa.me / api.whatsapp.com **rejeitados**.
- Sem tokens na resposta; `request_payload` sanitizado em erros Graph.

---

## Adset (WHATSAPP)

Campos Graph relevantes:

| Campo | Valor |
|-------|--------|
| `destination_type` | `WHATSAPP` |
| `billing_event` | `IMPRESSIONS` |
| `optimization_goal` | tipicamente `CONVERSATIONS` |
| `promoted_object.page_id` | Page da integração (obrigatório) |
| `promoted_object.whatsapp_phone_number` | opcional (`whatsappPhoneNumber`) |

Identificador exigido: **Page** (`page_id`) ligada ao WhatsApp Business. Telefone é complementar.

### Matriz optimization × objective (CTWA)

| Objective | optimization_goal permitidos |
|-----------|------------------------------|
| OUTCOME_ENGAGEMENT | CONVERSATIONS, LINK_CLICKS |
| OUTCOME_LEADS | CONVERSATIONS |
| OUTCOME_SALES | CONVERSATIONS, OFFSITE_CONVERSIONS, LINK_CLICKS, IMPRESSIONS, REACH |
| OUTCOME_TRAFFIC | CONVERSATIONS, LANDING_PAGE_VIEWS, LINK_CLICKS, IMPRESSIONS, REACH, POST_ENGAGEMENT |

---

## createAd — destinationType

### WEBSITE (default, retrocompatível)

- `linkUrl` https de **site** obrigatório.
- `link_data` clássico: CTA whitelist + `value.link = linkUrl`.
- Rejeita `wa.me` / `api.whatsapp.com` / `chat.whatsapp.com` no `linkUrl`.

### WHATSAPP

- `linkUrl` **não** aceito (nem fabricado).
- CTA `WHATSAPP_MESSAGE` + `value.app_destination = WHATSAPP`.
- `link_data.link` = protocolo oficial Meta `https://api.whatsapp.com/send` (não é input do usuário).
- Opcional: `welcomeMessage` → `page_welcome_message` (autofill).
- Na execução: adset com `destination_type=WHATSAPP` (mismatch → erro).

### Payload creative (resumo WHATSAPP)

```json
{
  "name": "… Creative",
  "object_story_spec": {
    "page_id": "<PAGE_ID>",
    "link_data": {
      "message": "<COPY>",
      "link": "https://api.whatsapp.com/send",
      "call_to_action": {
        "type": "WHATSAPP_MESSAGE",
        "value": { "app_destination": "WHATSAPP" }
      }
    }
  }
}
```

---

## Erros Graph

Writes (`create` / edit) usam `graphWrite` → `META_GRAPH_ERROR` com:

`message`, `code`, `error_subcode`, `error_user_title`, `error_user_msg`, `fbtrace_id`, `request_payload` (sanitizado).

---

## Arquivos

| Área | Path |
|------|------|
| Destination helpers | `lib/meta-ads/ad-destination.ts` |
| Tools | `lib/meta-ads/tools.ts` |
| OpenAPI | `gpt/blimber/openapi-ads.yaml` |
| Instruções GPT | `gpt/blimber/instructions.md` |
| Skill | `.agents/skills/blimber-meta-ads/SKILL.md` |
| Testes | `tests/meta-ads-tools.test.ts`, `tests/meta-graph.test.ts` |
