# Adset Meta: Vendas no site / Purchase

`meta_create_adset` exige `pixelId` e `customEventType` explícitos para `WEBSITE + OFFSITE_CONVERSIONS`. Não usa o pixel padrão salvo na integração. O Pixel deve aparecer em `GET act_{adAccountId}/adspixels`; o dry-run faz somente essa leitura, sem POST. O contrato MCP usa os mesmos campos do endpoint REST `POST /api/gpt/meta/adsets` e do OpenAPI de Ads.

Exemplo de entrada de prévia (ajuste `name` e a segmentação antes de executar):

```json
{
  "tenantId": "e18dda57-ec27-4c42-9dd1-f7222b8d9383",
  "adAccountId": "1520081329440494",
  "campaignId": "52566307185569",
  "name": "Campanha 01 | Website Purchase",
  "targetingTemplate": "BR_18_65",
  "campaignObjective": "OUTCOME_SALES",
  "destinationType": "WEBSITE",
  "optimizationGoal": "OFFSITE_CONVERSIONS",
  "billingEvent": "IMPRESSIONS",
  "pixelId": "1282443063972836",
  "customEventType": "PURCHASE",
  "dailyBudget": 2000,
  "status": "PAUSED",
  "confirmTenantId": "e18dda57-ec27-4c42-9dd1-f7222b8d9383",
  "confirm": true,
  "dryRun": true
}
```

O `targetingTemplate` acima é apenas exemplo porque a solicitação original não especificou segmentação. O código não foi usado para criar adset real. Para conferir depois de uma criação autorizada, use `meta_get_adset` ou `meta_list_adsets`; ambos expõem `destination_type` e `promoted_object` quando a Graph os retornar.

Corpo completo esperado no `preview.body` com esse template (validado por teste com Graph mockada):

```json
{
  "name": "Campanha 01 | Website Purchase",
  "campaign_id": "52566307185569",
  "billing_event": "IMPRESSIONS",
  "optimization_goal": "OFFSITE_CONVERSIONS",
  "bid_strategy": "LOWEST_COST_WITHOUT_CAP",
  "targeting": {
    "geo_locations": { "countries": ["BR"] },
    "age_min": 18,
    "age_max": 65,
    "targeting_automation": { "advantage_audience": 0 }
  },
  "status": "PAUSED",
  "destination_type": "WEBSITE",
  "promoted_object": {
    "pixel_id": "1282443063972836",
    "custom_event_type": "PURCHASE"
  },
  "daily_budget": 2000
}
```

O dry-run real ainda depende de a integração do tenant ter acesso à conta e de o pixel constar em `act_{adAccountId}/adspixels`; esta documentação não equivale a uma confirmação da Meta para o tenant de exemplo.
