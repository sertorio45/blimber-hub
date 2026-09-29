# Inventário de clientes no MCP e n8n

Use a ferramenta MCP `listClients` ou `GET /api/gpt/clients` com `Authorization: Bearer <BLIMBER_MCP_API_KEY>` em uma credencial protegida do n8n. A chave é administrativa: não a compartilhe com workflows de clientes nem a inclua em URLs ou logs.

Argumentos opcionais: `limit` (1–100, padrão 50), `cursor` (UUID retornado como `nextCursor`), `includeInactive` (padrão `false`), `module` (`crm`, `article`, `marketing`, `whatsapp`), `integrationProvider` (`meta`, `google_ads`, `google_analytics`, `linkedin`, `whatsapp`) e `integrationStatus` (`active`, `ready`, `missing`; exige provider).

No n8n, repita a chamada com `cursor = data.nextCursor` até receber `null`. Exemplo: `GET https://app.blimber.com.br/api/gpt/clients?module=marketing&integrationProvider=meta&integrationStatus=ready&limit=50`. O resultado contém `clients[]` com ID, nome, slug, módulos ativos e estados das integrações; não contém tokens, telefones ou configuração privada.

`active` indica integração cadastrada e ativa; `connected` exige também um token armazenado (ou instância WhatsApp em estado `connected`); `ready` exige os IDs básicos da conta/propriedade. Esses indicadores não consultam a API externa em tempo real e não garantem que o token ainda seja válido. `missing` inclui integração ausente ou sem conexão. O filtro de módulo considera o bundle `all` e não apresenta Ads como módulo comercial separado.

Se o workflow do n8n precisa agir sobre cada cliente, use o `id` retornado como `tenantId` nas ferramentas seguintes. Sempre mantenha esse ID por item; não compartilhe um `tenantId` entre itens de clientes diferentes.
