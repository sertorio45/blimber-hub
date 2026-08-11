# Blimber — Hub de soluções

> **Stack:** Nuxt 3 · Vue 3 · TypeScript · Shadcn/ui · Supabase · UnoCSS · TanStack Table · Lucide Icons

---

## Modelo de agências (workspace)

Documentação completa: [`docs/agency-workspace.md`](docs/agency-workspace.md)

Resumo:

- **Plataforma** administra o SaaS; **organização** é a conta comercial (`agency` / `direct` / `platform`); **tenant** é a empresa operacional.
- Autorização por **cargos** (`organization_roles`) + **capabilities** — não por `app_role` hardcoded nas APIs novas.
- Marketing social: aprovação multi-etapa, comentários internal/shared, exclusão soft + remota Meta.
- Relatório SQL de saúde do backfill: `supabase/reports/agency_model_validation.sql`
- Testes RLS: `supabase/tests/workspace_rls.sql`, `supabase/tests/agency_security_rls.sql`

```bash
pnpm test          # unitários (inclui matriz de acesso)
pnpm run typecheck
pnpm run lint
pnpm run build
```

---

## 1. Visão Geral

O **Blimber** é uma plataforma SaaS e ERP multi-tenant (**Hub de soluções**) para gestão de empresas e agências. Unifica CRM, WhatsApp, artigos e autenticação via Supabase, com suporte nativo a múltiplos tenants, construído sobre Nuxt 3 com Shadcn/ui.

| Camada | Tecnologia |
|---|---|
| Framework | Nuxt 3 (SSR) |
| UI | Vue 3 + TypeScript |
| Componentes | Shadcn/ui + Lucide Icons |
| CSS | UnoCSS |
| Banco de Dados | Supabase (PostgreSQL + RLS) |
| Autenticação | Supabase Auth |
| Tabelas | TanStack Table |
| Deploy | Vercel |

---

## 2. Quick Start

```bash
# Clonar o repositório
git clone https://github.com/sertorio45/blimber-hub.git
cd blimber-hub
pnpm install
pnpm run dev
```

- [Repositório](https://github.com/sertorio45/blimber-hub)
- [Documentação Shadcn Vue](https://shadcn-vue.com/docs/introduction)

---

## 3. Sistema CRM

CRM completo com dados simulados (mock), arquitetura modular e DataTable obrigatório em todas as listagens.

### 3.1 Páginas

#### `/crm/dashboard`
- KPIs: total de leads, receita, taxa de conversão, ticket médio
- Gráficos de receita mensal (integração com Chart.js)
- Pipeline de vendas por estágio, top sources, top performers e timeline de atividades

#### `/crm/leads`
- DataTable com filtros (status, prioridade, fonte), busca e paginação
- Cards de estatísticas: total, hot leads, qualificados, valor total
- Modal de detalhes e ações CRUD com status badges coloridos

#### `/crm/pipeline`
- Interface Kanban com colunas por estágio
- Cards com prioridade visual (borda colorida) e estatísticas por coluna
- Modal de detalhes ao clicar em qualquer card

#### `/crm/companies`
- Tabela com formatação em Real brasileiro
- Estatísticas: total de empresas, contatos, leads e valor
- Ações CRUD básicas

#### `/crm/whatsapp`
- Sidebar com lista de conversas e status online
- Interface de chat estilo WhatsApp com status de mensagens (enviado/lido)
- Estatísticas: conversas totais, não lidas, online, mensagens do dia

### 3.2 Menu de Navegação

```
/crm/dashboard   → Dashboard
/crm/leads       → Leads
/crm/pipeline    → Sales Pipeline
/crm/companies   → Empresas
/crm/contacts    → Contatos
/crm/meetings    → Reuniões
/crm/whatsapp    → WhatsApp (NOVO)
/crm/reports     → Relatórios
```

### 3.3 Arquitetura

#### Tipos TypeScript — `types/crm.ts`

```ts
Lead · Contact · Company · Meeting
WhatsAppMessage · WhatsAppConversation
SalesStage · DashboardKPI · EvolutionAPI
```

#### Dados Mock — `data/crm-mock.ts`

| Entidade | Quantidade |
|---|---|
| Leads | 7 (diferentes status e prioridades) |
| Contatos | 5 (vinculados a empresas) |
| Empresas | 3 |
| Reuniões | 5 agendadas |
| Conversas WhatsApp | 3 |
| Mensagens | 8 de exemplo |

#### Componentes — `components/crm/shared/`

| Componente | Função |
|---|---|
| `DataTable.vue` | Componente principal genérico |
| `DataTableToolbar.vue` | Busca e filtros |
| `DataTablePagination.vue` | Paginação |
| `DataTableColumnHeader.vue` | Cabeçalhos ordenáveis |
| `DataTableRowActions.vue` | Ações das linhas (ver, editar, excluir) |
| `DataTableFacetedFilter.vue` | Filtros por facetas |
| `DataTableViewOptions.vue` | Visibilidade de colunas |

#### Colunas de Leads — `components/crm/leads/columns.ts`
- Definições de colunas com formatação de moeda e datas
- Filtros configurados por status, prioridade e fonte
- Callbacks para ações CRUD

### 3.4 KPIs

| Métrica | Valor |
|---|---|
| Total de leads | 7 |
| Novos no mês | 3 |
| Taxa de conversão | 28,6% |
| Receita total | R$ 480.000 |
| Receita do mês | R$ 85.000 |
| Ticket médio | R$ 68.571 |

### 3.5 Distribuição por Estágio

`New` · `Contacted` · `Qualified` · `Proposal` · `Negotiation` · `Won` · `Lost` — 1 lead cada

### 3.6 Estrutura de Pastas

```
components/crm/
├── shared/          # Componentes reutilizáveis
├── leads/           # Específicos de leads
└── ...

pages/crm/
├── dashboard.vue
├── leads.vue
├── pipeline.vue
├── companies.vue
└── whatsapp.vue

types/
└── crm.ts

data/
└── crm-mock.ts
```

---

## 4. Autenticação, RBAC e Módulos

Autenticação via Supabase Auth com controle de acesso por **perfil (role)**, **tenant** e **módulos contratados**.

### 4.1 Perfis de acesso

Os slugs abaixo são os valores no banco (`app_role`). Os rótulos na interface estão em `constants/roles.ts`.

| Slug | Nome na UI | Tenant | Seletor de empresa | Módulos | Gestão de usuários |
|---|---|---|---|---|---|
| `admin` | Superadministrador | Qualquer | Sim | Todos | `/admin/users` — qualquer perfil |
| `funcionario` | Funcionário | Qualquer | Sim | Todos | `/admin/users` — `cliente` e `atendente` |
| `cliente` | Administrador | Apenas o vinculado | Não | Conforme `tenant_modules` | `/settings/team` — apenas `atendente` |
| `atendente` | Atendente | Apenas o vinculado | Não | Conforme `tenant_modules` | Sem permissão |

**Marketing — portal do cliente vs agência**

| Superfície | Agência / staff | Administrador (`cliente`) | Atendente |
|---|---|---|---|
| Visão geral | Ops completa | Adaptada (postagem / calendário / relatórios) | Adaptada (leitura) |
| Publicações / Produção (`/marketing/posts`) | Kanban + filas ops (“Produção”) | Criar/editar e **agendar/publicar sem aprovação** (“Publicações”) | Leitura |
| Calendário (`/marketing/calendar`) | Calendário editorial completo | UX simplificada + criar/abrir posts | Leitura |
| Relatórios / Integrações | Sim | Sim | Não |
| Aprovações in-app, Pacotes, Automações, Métricas ops, Campanhas, Briefings, Filas | Sim | Não | Não |
| Revisão por link (`/review/:token`) | Envia | Aprova fora do app logado | — |

> No portal do cliente (`organization.type = direct` ou role tenant sem portfolio de agência), o agendar/publicar **auto-aprova** a versão atual (`workflow no_approval`) — não há etapa de aprovação humana. O role `cliente` recebe `marketing.social.create` / `update` / `schedule` / `publish`, mas **não** recebe `agency.clients.*` nem capabilities de ops (packages, production.move, automations).

**Onde cada perfil é armazenado:**

| Tipo | Armazenamento | Tabela / campo |
|---|---|---|
| Staff global (`admin`, `funcionario`) | Role global | `auth.users.app_metadata.role` |
| Usuário de tenant (`cliente`, `atendente`) | Vínculo por empresa | `user_tenant_role` + espelho em `app_metadata.tenant_roles` (JWT) |

> Staff **não** deve ter registro em `user_tenant_role`. Após alterar `app_metadata` no Supabase, o usuário precisa fazer **logout/login** para renovar o JWT.

### 4.2 Áreas do sistema

| Área | Rotas | Quem acessa |
|---|---|---|
| Administração da agência | `/admin/users`, `/admin/tenants` | Superadministrador e Funcionário |
| Equipe do tenant | `/settings/team` | Administrador do tenant ou staff com tenant selecionado |
| Módulos operacionais | `/crm`, `/whatsapp`, `/articles`, etc. | Conforme perfil e módulos do tenant |

### 4.3 Resolução de role

Ordem de prioridade (frontend e API):

1. `app_metadata.role` global → `admin` ou `funcionario` (staff)
2. `app_metadata.tenant_roles[tenant_id]` → `cliente` ou `atendente`
3. Implementação: `utils/resolve-user-role.ts`, `server/utils/tenant-role.ts`

O middleware `role` e o composable `useAuth` usam `resolveRoleFromSession`, que **prioriza o role global de staff** antes de `tenant_roles`.

### 4.4 Variáveis de ambiente

```env
SUPABASE_URL=
SUPABASE_KEY=
SUPABASE_SERVICE_KEY=   # apenas backend
```

### 4.5 Middlewares

| Middleware | Função |
|---|---|
| `auth` | Verifica autenticação; redireciona para `/login` se não autenticado |
| `role` | Compara `to.meta.requiredRoles` com a role resolvida do JWT; redireciona para `/403` |
| `tenant` / `tenant-check` | Garante contexto de tenant em rotas que dependem de empresa |
| `guest` | Impede autenticados de acessar páginas de visitante |

**Rotas públicas:** `/login` · `/register` · `/forgot-password` · `/403` · `/confirm`

**Exemplos de `definePageMeta`:**

```ts
// Página autenticada qualquer perfil
definePageMeta({ middleware: ['auth'] })

// Página da agência (staff)
definePageMeta({
  middleware: ['auth', 'role'],
  requiredRoles: ['admin', 'funcionario'],
})

// Página de equipe do tenant
definePageMeta({
  middleware: ['auth', 'tenant', 'role'],
  requiredRoles: ['admin', 'funcionario', 'cliente'],
})

// Página de domínio com tenant
definePageMeta({ middleware: ['auth', 'tenant'] })
```

### 4.6 Composable `useAuth`

```ts
const {
  login,
  logout,
  isAuthenticated,
  currentUser,
  currentRole,     // role resolvida (staff global ou tenant)
  checkSession,
  hasRole,
  hasAnyRole,
  updateUserRole,
} = useAuth()
```

Composables relacionados: `useTenant` (seletor e isolamento de empresa), `useModule` (seletor de módulo), `useRole`.

### 4.7 Módulos (`tenant_modules`)

O pacote **Blimber completo** usa um único registro `module_name = 'all'`. A função `is_tenant_module_active(tenant_id, module_name)` retorna `true` quando o tenant tem o módulo específico **ou** o pacote `all`.

**Módulos registrados no frontend** (`constants/modules.ts`):

| `module_name` (DB) | Título na UI | Base path |
|---|---|---|
| `crm` | CRM | `/crm` |
| `article` | Articles | `/articles` |
| `marketing` | Marketing | `/crm/marketing` |
| `whatsapp` | WhatsApp | `/whatsapp` |

| Perfil | Comportamento no frontend | Validação na API |
|---|---|---|
| Superadministrador / Funcionário | Todos os módulos em `MODULE_META` | Bypass em `module-access.ts` |
| Administrador / Atendente | Módulos do tenant (`all` expande todos acima) | `is_tenant_module_active()` |

O composable `useModule` expande `module_name = 'all'` para todos os módulos de `MODULE_META`.

**Habilitar pacote completo para um tenant:**

```sql
INSERT INTO public.tenant_modules (tenant_id, module_name, is_active, activated_at)
SELECT t.id, 'all', true, now()
FROM public.tenant t
WHERE t.slug = 'seu-tenant-slug'
ON CONFLICT (tenant_id, module_name) DO UPDATE
  SET is_active = true, activated_at = now();
```

Novos tenants criados em `/admin/users` recebem `module_name = 'all'` automaticamente via `seedTenantAllModules`.

**Adicionar um novo módulo ao sistema:**

1. Registrar em `constants/modules.ts` (`MODULE_META`)
2. Adicionar menu em `constants/menus.ts` (grupo com `title` igual ao do módulo)
3. Proteger APIs em `server/middleware/module-access.ts`
4. Habilitar no tenant via `tenant_modules` (ou manter `all`)

### 4.8 Isolamento de tenant

| Perfil | Como o tenant é definido | Seletor na sidebar |
|---|---|---|
| Superadministrador / Funcionário | Escolha livre; persiste em `localStorage` | Sim (`TenantDropdown`) |
| Administrador / Atendente | Fixo via JWT (`tenant_roles`); `useTenant.bootstrapTenantContext()` | Não |

- Staff lista tenants via `GET /api/admin/tenants` (service role).
- Usuários de tenant consultam apenas o próprio via `user_has_tenant_access` (RLS).
- Tentativas de acessar outro tenant retornam `403 Forbidden`.

### 4.9 Referência do banco

**Enum `public.app_role`:** `admin`, `funcionario`, `cliente`, `atendente`.

**Tabelas:**

| Tabela | Função |
|---|---|
| `tenant` | Empresas/clientes da plataforma |
| `tenant_modules` | Módulos habilitados (`all` = pacote Blimber) |
| `user_tenant_role` | Vínculo usuário ↔ tenant ↔ role (somente `cliente` ou `atendente`) |

**Funções RPC:**

| Função | Uso |
|---|---|
| `user_has_tenant_access(tenant_id)` | RLS — isolamento de tenant |
| `is_tenant_module_active(tenant_id, module_name)` | Valida módulo ou pacote `all` |
| `user_can_manage_tenant_team(tenant_id)` | Permissão para `/settings/team` |

---

## 5. Sistema de Usuários

Duas áreas distintas — **agência** (staff) e **tenant** (cliente):

| Área | Rotas | Quem acessa |
|---|---|---|
| Administração da agência | `/admin/users`, `/admin/tenants` | Superadministrador e Funcionário |
| Equipe do tenant | `/settings/team` | Administrador do tenant ou staff com tenant selecionado |

### 5.1 Quem cria qual perfil

| Criador | Rota | Perfis que pode criar |
|---|---|---|
| Superadministrador | `/admin/users` | `admin`, `funcionario`, `cliente`, `atendente` |
| Funcionário | `/admin/users` | `cliente`, `atendente` |
| Administrador (cliente) | `/settings/team` | `atendente` |
| Staff com tenant selecionado | `/settings/team` | `cliente`, `atendente` |

Validação no backend:
- Agência → `server/utils/admin-auth.ts` → `assertAdminCanAssignRole`
- Equipe → `server/utils/tenant-team.ts` → `resolveAssignableRoles`

### 5.2 Arquivos principais

| Arquivo | Função |
|---|---|
| `constants/roles.ts` | Slugs, labels e helpers (`isStaffRole`, `isTenantScopedRole`) |
| `utils/resolve-user-role.ts` | Resolução de role a partir do JWT |
| `server/utils/admin-auth.ts` | Guards das APIs `/api/admin/*` |
| `server/utils/tenant-team.ts` | CRUD de equipe + sync JWT |
| `components/users/UserForm.vue` | Formulário com roles dinâmicas |
| `components/tenant/TeamManagementPanel.vue` | Painel em `/settings/team` |

### 5.3 APIs

**Agência** (`requireStaffUser` — `admin` ou `funcionario`):

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/api/admin/users` | Lista usuários |
| `POST` | `/api/admin/users` | Cria usuário |
| `PUT` | `/api/admin/users/[id]` | Atualiza email/senha |
| `DELETE` | `/api/admin/users/[id]` | Remove usuário |
| `GET` | `/api/admin/tenants` | Lista tenants |

**Equipe do tenant:**

| Método | Endpoint | Descrição |
|---|---|---|
| `GET/POST` | `/api/crm/team` | Listar / criar membros |
| `PUT/DELETE` | `/api/crm/team/[id]` | Atualizar / remover membro |

---

## 6. Sistema Multi-Tenant

Suporte completo a múltiplos tenants com isolamento de dados via Row Level Security (RLS).

### 6.1 Estrutura

- Usuários de tenant possuem vínculo em `user_tenant_role`
- Staff global opera em qualquer tenant via seletor na UI
- Tabelas de domínio possuem coluna `tenant_id` com RLS

### 6.2 Sidebar e menus

| Seção no menu | Visível para |
|---|---|
| Seletor de módulo | Todos (módulos filtrados por perfil) |
| Seletor de empresa | Superadministrador e Funcionário |
| Administração (`/admin/*`) | Superadministrador e Funcionário |
| Minha empresa → Usuários (`/settings/team`) | Staff e Administrador do tenant |
| Itens de módulo (CRM, WhatsApp, etc.) | Conforme role e módulos ativos |

Configuração em `constants/menus.ts` (`navMenu`, `navMenuAdmin`, `navMenuTenant`).

### 6.3 Políticas de Segurança (RLS)

| Tabela | Comportamento |
|---|---|
| `tenant` | SELECT via `user_has_tenant_access(id)`; staff gerencia com role global |
| `tenant_modules` | SELECT via `user_has_tenant_access(tenant_id)`; staff gerencia |
| `user_tenant_role` | `user_can_manage_tenant_team` para gestão; leitura própria + equipe |
| Demais tabelas de domínio | `tenant_isolation` via `app.tenant_id` ou `user_has_tenant_access` |

A função `user_has_tenant_access` concede acesso global **apenas** quando `app_metadata.role` é `admin` ou `funcionario` — valores em `tenant_roles` não elevam permissão.

### 6.4 Criar novo tenant

Via `/admin/users` (criar empresa + administrador) ou `createAdminTenant` + `seedTenantAllModules` no backend.

```sql
INSERT INTO public.tenant (name, slug, is_active) VALUES ('Empresa', 'empresa', true);

INSERT INTO public.tenant_modules (tenant_id, module_name, is_active, activated_at)
SELECT id, 'all', true, now() FROM public.tenant WHERE slug = 'empresa'
ON CONFLICT (tenant_id, module_name) DO NOTHING;
```

### 6.5 Adicionar multi-tenant a novas tabelas

```sql
SELECT public.add_tenant_id_to_table('nome_da_tabela');
```

Em páginas que exigem tenant:

```ts
definePageMeta({
  middleware: ['auth', 'tenant'],
  requiresTenant: true,
})
```

### 6.6 Migrações

```bash
npx supabase login
npx supabase db push
npx supabase migration list
```

## 7. Próximos Passos

### Integrações Pendentes
- [ ] **Evolution API** — integração real com WhatsApp
- [ ] **Charts** — gráficos interativos (Chart.js / D3.js)
- [ ] **Supabase** — substituir mock data por banco real
- [ ] **Drag & Drop** — movimentação de leads no pipeline

### Funcionalidades Adicionais
- [ ] Página completa de Contatos
- [ ] Sistema de agendamento de Reuniões
- [ ] Relatórios e dashboards avançados
- [ ] Sistema de notificações e alertas
- [ ] Workflows automatizados

### Melhorias de UX
- [ ] CRUDs completos com formulários e validações
- [ ] Loading states e feedback de erros
- [ ] Offline support / PWA

---

## 8. Padrões de Código

- ✅ **UI em português** — labels, mensagens e textos visíveis ao usuário
- ✅ **Código em inglês** — variáveis, funções, tipos e nomes de arquivos
- ✅ **Organização modular** — estrutura por domínio de negócio
- ✅ **DataTable obrigatório** — todas as listagens usam o componente genérico
- ✅ **TypeScript strict** — tipagem completa
- ✅ **SSR** — server-side rendering habilitado
- ✅ **Cache** — `useAsyncData` com chave única por módulo

---

## Licença

MIT

---

## 9. Módulo Marketing (Google + Meta)

Analytics de mídia paga com integração backend-first para Google Ads e Meta Ads.

### 9.1 Rotas

- `/crm/marketing` — visão principal com KPIs e campanhas
- Integrações OAuth via `/api/marketing/oauth/*`

### 9.2 Banco

Tabelas com prefixo `marketing_`:

- `marketing_integrations` — credenciais por tenant
- `marketing_campaign_cache` — cache de resultados agregados

### 9.3 Regras de módulo

- Registrado em `constants/modules.ts` como `marketing`
- API protegida em `server/middleware/module-access.ts` com prefixo `/api/marketing`
- Ativo quando `tenant_modules.module_name = 'marketing'` **ou** `all`