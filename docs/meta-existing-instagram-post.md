# Publicação existente do Instagram em Meta Ads

Esta etapa reutiliza `meta_create_ad` por meio de `meta_create_ad_from_instagram_post`. Antes de executar, use `meta_list_instagram_accounts` e `meta_list_instagram_media` (com `after` para paginação); `meta_get_instagram_media` aceita ID ou permalink. A integração deve vincular a ad account do tenant à Página e ao Instagram profissional. Nenhuma destas leituras retorna tokens.

O ID da mídia é o `id` retornado pela Graph. Permalink é apenas uma conveniência: o Blimber pesquisa as mídias da conta conectada e nunca converte shortcode em ID numérico. A busca por permalink cobre até 1.000 itens; para mídia antiga, use o ID.

## Matriz de compatibilidade

| Combinação | Situação nesta etapa | Evidência/limite |
| --- | --- | --- |
| `source_instagram_media_id` no `POST /act_{id}/adcreatives` | Implementado | Campo de criação presente no [SDK oficial da Meta](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adaccount.py). O Blimber envia o ID da mídia no nível do AdCreative e a identidade em `object_story_spec.page_id`/`instagram_user_id`, sem `object_id`, `video_data` ou URL de tráfego. A aceitação da combinação concreta depende da Graph/conta. |
| `INSTAGRAM_PROFILE` com adset existente, criativo acima e `POST /act_{id}/ads` PAUSED | Implementado, validação live pendente | Testes com fixtures estritas; sem afirmação de aceitação em produção. |
| `object_story_id` | Fora deste fluxo | Identificador de publicação de Página/Facebook; não substituir automaticamente o ID da mídia Instagram. |
| `effective_instagram_media_id` | Leitura/diagnóstico, não entrada de criação | [SDK oficial](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adcreative.py) o expõe como campo do AdCreative. |
| `PROFILE_VISIT` / `VISIT_INSTAGRAM_PROFILE` | Não intercambiáveis automaticamente | O fluxo existente usa `PROFILE_VISIT`; qualquer novo valor exige verificação da Graph na versão e conta-alvo. |
| Outros destinos e boost direto | Não habilitados | Precisam de evidência de compatibilidade por objetivo/adset/criativo; não inferir pela presença do campo no SDK. |

Mídias listadas recebem `advertisingEligibility.status=unknown`: a listagem comprova acesso, não aprovação para anúncio. `meta_get_instagram_media` tenta consultar separadamente `boost_eligibility_info`; quando a Meta devolve `is_eligible` e `reason`, ambos são refletidos. Se o campo não estiver disponível para o app/versão, permanece `unknown`. A elegibilidade para *boost* também não garante aceitação em todos os objetivos e destinos. O preview não faz POST e não consulta a Graph para resolver permalink; o execute valida ownership e a Meta decide elegibilidade ao criar o criativo/anúncio. Se a Graph rejeitar, código, subcódigo, mensagem e `fbtrace_id` são preservados. Se o criativo foi criado mas o anúncio falhou, a resposta identifica `orphanCreativeId` para limpeza manual; rollback automático de criativo pertence à próxima etapa de confiabilidade.

## Teste live manual (desenvolvimento somente)

`tests/live/meta-existing-instagram-post.test.ts` permanece ignorado no CI normal. Para habilitá-lo explicitamente, configure `META_LIVE_TESTS=true` e os ambientes `META_LIVE_ACCESS_TOKEN`, `META_LIVE_PAGE_TOKEN`, `META_LIVE_AD_ACCOUNT_ID`, `META_LIVE_PAGE_ID`, `META_LIVE_INSTAGRAM_ACCOUNT_ID`, `META_LIVE_ADSET_ID`, `META_LIVE_INSTAGRAM_MEDIA_ID`; `META_LIVE_GRAPH_VERSION` é opcional (default v25.0). Execute somente esse arquivo em conta de desenvolvimento, com adset pausado. O teste cria anúncio PAUSED com prefixo `[BLIMBER TEST]` e tenta apagar apenas o anúncio e criativo que criou; se a Meta impedir a limpeza, o teste informa os IDs para remoção manual. Não use conta de produção para esta suíte.
