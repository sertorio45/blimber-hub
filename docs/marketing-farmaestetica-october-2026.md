# Farmaestética — publicações de outubro de 2026

Planejamento executado em 06/10/2026 (horário de Brasília). Os dez posts já aprovados em agosto, mas ainda sem fila de publicação, foram reagendados em dias úteis, na sequência editorial existente. Os horários de 10h e 19h foram preservados conforme cada peça.

| Data e hora (America/Sao_Paulo) | Peça | Post ID |
| --- | --- | --- |
| 07/10, 19h | POST 12 — Recuperação também faz parte da performance | `4fcfa4f1-9095-4e9f-8f3f-a909c4206668` |
| 08/10, 19h | POST 02 — Da receita à fórmula | `9beadbcd-a8a0-4f02-91bb-9e27e35a634a` |
| 09/10, 10h | POST 01 — Muito além de cápsulas | `e9869154-a37a-4b61-bcb2-d85baf00aa4d` |
| 12/10, 19h | POST 03 — Saúde capilar | `07986923-7371-4ec5-ac21-1f2a8ea43bf5` |
| 14/10, 10h | POST 04 — Pele: o básico bem feito | `ef3ddb6e-bd69-4d1b-8800-bbc07f47b13b` |
| 16/10, 19h | POST 05 — Emagrecimento saudável | `09f2ac02-c0af-45f1-9d12-1edc3c56c46c` |
| 19/10, 19h | POST 06 — Foco e concentração | `a82b1ca6-af3f-4b10-950a-7a0e755ac988` |
| 21/10, 10h | POST 07 — Academia: resultado não acontece só durante o treino | `401aa4b4-25dc-411f-b00b-9e3619701354` |
| 23/10, 19h | POST 08 — Fórmula personalizada | `0632b47f-529f-4218-bfc3-3fcea43cf00f` |
| 26/10, 19h | POST 09 — Mitos e verdades sobre manipulação | `da1a490b-bccc-4d46-a58f-7f187a5e3636` |
| 28/10, 10h | POST 10 — Mais ativos não significa uma fórmula melhor | `466e0737-07e1-42ad-92e8-9754f8c1946f` |

Os agendamentos foram feitos pela operação `marketing_schedule_post`, não por edição direta de `scheduled_at`. A leitura posterior no Supabase confirmou `editorial_status = approved`, `publication_status = scheduled`, dois `publication_jobs` pendentes (Facebook e Instagram) e um slot `queued` em `marketing_post_schedules` por peça. Isso confirma o agendamento, não a publicação futura nas redes; o processamento e eventuais erros devem ser acompanhados nas datas previstas.

**Atualização em 06/10/2026:** O responsável informou que o cliente aprovou a versão 2 do POST 02 pelo WhatsApp. Como a solicitação no painel já estava cancelada, a aprovação foi registrada administrativamente com essa justificativa; não foi atribuída falsamente uma decisão ao cliente dentro do painel. O post foi agendado para 08/10 às 19h. O Supabase confirmou a versão aprovada, dois jobs pendentes (Facebook e Instagram) e um slot `queued` no calendário. O lote agora tem 11 peças agendadas.
