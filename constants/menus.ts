import type { NavMenu, NavMenuItems } from '~/types/nav'

export const navMenu: NavMenu[] = [
  {
    heading: '',
    items: [
      {
        title: 'CRM',
        icon: '/icons/modules/crm/crm.svg',
        roles: ['admin', 'funcionario', 'cliente', 'atendente'],
        children: [
          { title: 'Painel', icon: 'i-lucide-layout-dashboard', link: '/crm/dashboard' },
          { title: 'Funil de Vendas', icon: 'i-lucide-trending-up', link: '/crm/funnel' },
          { title: 'Empresas', icon: 'i-lucide-building', link: '/crm/company' },
          { title: 'Contatos', icon: 'i-lucide-contact', link: '/crm/contacts' },
          { title: 'Reuniões', icon: 'i-lucide-calendar', link: '/crm/meetings' },
          { title: 'Produtos & Serviços', icon: 'i-lucide-package', link: '/crm/products' },
          {
            title: 'Configurações do CRM',
            icon: 'i-lucide-settings-2',
            link: '/crm/config',
          },
        ],
      },
    ],
  },
  {
    heading: '',
    items: [
      {
        title: 'Marketing',
        icon: 'i-lucide-megaphone',
        roles: ['admin', 'funcionario', 'cliente', 'atendente'],
        /**
         * Organic / editorial product tree, plus Ads submenu (ETAPA 2)
         * pointing at `/marketing/ads*`. Ads is not a commercial sibling
         * in the product selector (ETAPA 6); `/ads*` pages remain until
         * the ETAPA 7 redirects.
         * Campaigns here are editorial (`social_campaigns`); paid campaigns
         * live under Ads → Campanhas (`/marketing/ads/campaigns`).
         * Advanced items (packages, automations, ops-metrics, logs,
         * notifications) stay reachable by URL but hidden from the main path.
         * Planejamento flattens in the sidebar; Ads and Configurações
         * keep collapsible groups (keepGroup), collapsed unless the
         * current route is inside the group.
         */
        children: [
          {
            title: 'Visão Geral',
            icon: 'i-lucide-layout-dashboard',
            link: '/marketing',
            capability: 'marketing.social.read',
          },
          {
            title: 'Planejamento',
            icon: 'i-lucide-calendar-range',
            link: '/marketing/calendar',
            children: [
              {
                title: 'Calendário',
                icon: 'i-lucide-calendar-days',
                link: '/marketing/calendar',
                capability: 'marketing.social.read',
              },
              {
                // Editorial campaigns (social_campaigns) — paid lives in Ads.
                title: 'Campanhas editoriais',
                icon: 'i-lucide-megaphone',
                link: '/marketing/campaigns',
                capability: 'marketing.social.campaigns.read',
              },
              {
                title: 'Briefings',
                icon: 'i-lucide-clipboard-list',
                link: '/marketing/briefings',
                capability: 'marketing.social.briefing.create',
                audience: 'agency',
              },
            ],
          },
          {
            title: 'Conteúdos',
            clientTitle: 'Publicações',
            icon: 'i-lucide-panels-top-left',
            link: '/marketing/content',
            capability: 'marketing.social.create',
          },
          {
            title: 'Produção',
            icon: 'i-lucide-kanban',
            link: '/marketing/production',
            capability: 'marketing.social.read',
            audience: 'agency',
          },
          {
            title: 'Aprovações',
            icon: 'i-lucide-badge-check',
            link: '/marketing/approvals',
            capability: 'marketing.social.read',
            audience: 'agency',
          },
          {
            title: 'Biblioteca',
            icon: 'i-lucide-images',
            link: '/marketing/media',
            capability: 'marketing.social.read',
          },
          {
            title: 'Publicações',
            icon: 'i-lucide-send',
            link: '/marketing/publishing',
            capability: 'marketing.social.read',
            // Agency queue (scheduled / live / errors). Client portal uses
            // Conteúdos as "Publicações" via clientTitle — avoid duplicate labels.
            audience: 'agency',
          },
          {
            /**
             * Unified reports hub. Ads submenu must not duplicate Relatórios.
             * Editorial campaigns stay under Planejamento, not here.
             */
            title: 'Relatórios',
            icon: 'i-lucide-bar-chart-3',
            link: '/marketing/reports',
            keepGroup: true,
            defaultExpanded: false,
            roles: ['admin', 'funcionario', 'cliente'],
            capability: 'marketing.social.reports',
            children: [
              {
                title: 'Anúncios',
                icon: 'i-lucide-circle-dollar-sign',
                link: '/marketing/reports/ads',
                capability: 'marketing.social.reports',
              },
              {
                title: 'Google Analytics',
                icon: 'i-lucide-line-chart',
                link: '/marketing/reports/analytics',
                capability: 'marketing.social.reports',
              },
              {
                title: 'Redes sociais',
                icon: 'i-lucide-share-2',
                link: '/marketing/reports/social',
                capability: 'marketing.social.reports',
              },
            ],
          },
          {
            /**
             * Ads stays a collapsible under Marketing so flattened
             * siblings do not show two "Campanhas". Relatórios lives in its own group.
             * Canonical paid UI is `/marketing/ads*` (ETAPA 6: no Ads product tile).
             */
            title: 'Ads',
            icon: 'i-lucide-circle-dollar-sign',
            link: '/marketing/ads',
            keepGroup: true,
            defaultExpanded: false,
            children: [
              {
                title: 'Visão Geral',
                icon: 'i-lucide-layout-dashboard',
                link: '/marketing/ads',
                capability: 'marketing.social.reports',
              },
              {
                title: 'Campanhas',
                icon: 'i-lucide-megaphone',
                link: '/marketing/ads/campaigns',
                capability: 'marketing.social.reports',
              },
              {
                // Architecture placeholder — keep the route; label incompleteness.
                title: 'Criativos',
                icon: 'i-lucide-sparkles',
                link: '/marketing/ads/creatives',
                capability: 'marketing.social.brand_guide.read',
                badge: 'Em evolução',
              },
            ],
          },
          {
            /**
             * Brand Center only. OAuth stays at /settings/integrations —
             * do not duplicate Contas sociais / Integrações here.
             */
            title: 'Configurações',
            icon: 'i-lucide-settings',
            link: '/marketing/settings',
            keepGroup: true,
            defaultExpanded: false,
            children: [
              {
                title: 'Marca',
                icon: 'i-lucide-book-open',
                link: '/marketing/brand',
                capability: 'marketing.social.brand_guide.read',
                audience: 'agency',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    heading: '',
    items: [
      {
        title: 'WhatsApp',
        icon: 'i-lucide-message-circle',
        roles: ['admin', 'funcionario', 'cliente', 'atendente'],
        children: [
          { title: 'Painel', icon: 'i-lucide-layout-dashboard', link: '/whatsapp/dashboard' },
          { title: 'Conversas', icon: 'i-lucide-messages-square', link: '/whatsapp/conversations' },
          { title: 'Contatos', icon: 'i-lucide-contact', link: '/whatsapp/contacts' },
          { title: 'Campanhas', icon: 'i-lucide-megaphone', link: '/whatsapp/campaigns' },
          { title: 'Agentes IA', icon: 'i-lucide-bot', link: '/whatsapp/agents', new: true },
          { title: 'Flows', icon: 'i-lucide-workflow', link: '/whatsapp/flows', new: true },
          { title: 'Templates', icon: 'i-lucide-file-text', link: '/whatsapp/templates' },
          { title: 'Integrações', icon: 'i-lucide-plug', link: '/whatsapp/integrations' },
          { title: 'Relatórios', icon: 'i-lucide-bar-chart-3', link: '/whatsapp/reports' },
          { title: 'Configurações', icon: 'i-lucide-settings', link: '/whatsapp/settings' },
        ],
      },
    ],
  },
  {
    heading: '',
    items: [
      {
        title: 'Articles',
        icon: 'i-lucide-book-a',
        roles: ['admin', 'funcionario', 'cliente', 'atendente'],
        children: [
          { title: 'View articles', icon: 'i-lucide-file-text', link: '/articles' },
          { title: 'Create', icon: 'i-lucide-plus-circle', link: '/articles/new' },
          { title: 'Categories', icon: 'i-lucide-folder', link: '/articles/category' },
          { title: 'Tags', icon: 'i-lucide-tags', link: '/articles/tag' },
        ],
      },
    ],
  },
  {
    heading: 'General',
    items: [
      {
        title: 'Início',
        icon: 'i-lucide-home',
        link: '/',
      },
      {
        title: 'Email',
        icon: 'i-lucide-mail',
        link: '/email',
      },
      {
        title: 'Tasks',
        icon: 'i-lucide-calendar-check-2',
        link: '/tasks',
        new: true,
      },
    ],
  },
  {
    heading: 'Pages',
    items: [
      {
        title: 'Authentication',
        icon: 'i-lucide-lock-keyhole-open',
        children: [
          {
            title: 'Login',
            icon: 'i-lucide-circle',
            link: '/login',
          },
          {
            title: 'Login Basic',
            icon: 'i-lucide-circle',
            link: '/login-basic',
          },
          {
            title: 'Register',
            icon: 'i-lucide-circle',
            link: '/register',
          },
          {
            title: 'Forgot Password',
            icon: 'i-lucide-circle',
            link: '/forgot-password',
          },
        ],
      },
      {
        title: 'Errors',
        icon: 'i-lucide-triangle-alert',
        children: [
          {
            title: '401 - Unauthorized',
            icon: 'i-lucide-circle',
            link: '/401',
          },
          {
            title: '403 - Forbidden',
            icon: 'i-lucide-circle',
            link: '/403',
          },
          {
            title: '404 - Not Found',
            icon: 'i-lucide-circle',
            link: '/404',
          },
          {
            title: '500 - Internal Server Error',
            icon: 'i-lucide-circle',
            link: '/500',
          },
          {
            title: '503 - Service Unavailable',
            icon: 'i-lucide-circle',
            link: '/503',
          },
        ],
      },
      {
        title: 'Settings',
        icon: 'i-lucide-settings',
        new: true,
        children: [
          {
            title: 'Profile',
            icon: 'i-lucide-circle',
            link: '/settings/profile',
          },
          {
            title: 'Account',
            icon: 'i-lucide-circle',
            link: '/settings/account',
          },
          {
            title: 'Appearance',
            icon: 'i-lucide-circle',
            link: '/settings/appearance',
          },
          {
            title: 'Notifications',
            icon: 'i-lucide-circle',
            link: '/settings/notifications',
          },
          {
            title: 'Display',
            icon: 'i-lucide-circle',
            link: '/settings/display',
          },
        ],
      },
    ],
  },
  {
    heading: 'Components',
    items: [
      {
        title: 'Components',
        icon: 'i-lucide-component',
        children: [
          {
            title: 'Accordion',
            icon: 'i-lucide-circle',
            link: '/components/accordion',
          },
          {
            title: 'Alert',
            icon: 'i-lucide-circle',
            link: '/components/alert',
          },
          {
            title: 'Alert Dialog',
            icon: 'i-lucide-circle',
            link: '/components/alert-dialog',
          },
          {
            title: 'Aspect Ratio',
            icon: 'i-lucide-circle',
            link: '/components/aspect-ratio',
          },
          {
            title: 'Avatar',
            icon: 'i-lucide-circle',
            link: '/components/avatar',
          },
          {
            title: 'Badge',
            icon: 'i-lucide-circle',
            link: '/components/badge',
          },
          {
            title: 'Breadcrumb',
            icon: 'i-lucide-circle',
            link: '/components/breadcrumb',
          },
          {
            title: 'Button',
            icon: 'i-lucide-circle',
            link: '/components/button',
          },
          {
            title: 'Calendar',
            icon: 'i-lucide-circle',
            link: '/components/calendar',
          },
          {
            title: 'Card',
            icon: 'i-lucide-circle',
            link: '/components/card',
          },
          {
            title: 'Carousel',
            icon: 'i-lucide-circle',
            link: '/components/carousel',
          },
          {
            title: 'Checkbox',
            icon: 'i-lucide-circle',
            link: '/components/checkbox',
          },
          {
            title: 'Collapsible',
            icon: 'i-lucide-circle',
            link: '/components/collapsible',
          },
          {
            title: 'Combobox',
            icon: 'i-lucide-circle',
            link: '/components/combobox',
          },
          {
            title: 'Command',
            icon: 'i-lucide-circle',
            link: '/components/command',
          },
          {
            title: 'Context Menu',
            icon: 'i-lucide-circle',
            link: '/components/context-menu',
          },
          {
            title: 'Dialog',
            icon: 'i-lucide-circle',
            link: '/components/dialog',
          },
          {
            title: 'Drawer',
            icon: 'i-lucide-circle',
            link: '/components/drawer',
          },
          {
            title: 'Dropdown Menu',
            icon: 'i-lucide-circle',
            link: '/components/dropdown-menu',
          },
          {
            title: 'Form',
            icon: 'i-lucide-circle',
            link: '/components/form',
          },
          {
            title: 'Hover Card',
            icon: 'i-lucide-circle',
            link: '/components/hover-card',
          },
          {
            title: 'Input',
            icon: 'i-lucide-circle',
            link: '/components/input',
          },
          {
            title: 'Label',
            icon: 'i-lucide-circle',
            link: '/components/label',
          },
          {
            title: 'Menubar',
            icon: 'i-lucide-circle',
            link: '/components/menubar',
          },
          {
            title: 'Navigation Menu',
            icon: 'i-lucide-circle',
            link: '/components/navigation-menu',
          },
          {
            title: 'Number Field',
            icon: 'i-lucide-circle',
            link: '/components/number-field',
          },
          {
            title: 'Pagination',
            icon: 'i-lucide-circle',
            link: '/components/pagination',
          },
          {
            title: 'PIN Input',
            icon: 'i-lucide-circle',
            link: '/components/pin-input',
          },
          {
            title: 'Popover',
            icon: 'i-lucide-circle',
            link: '/components/popover',
          },
          {
            title: 'Progress',
            icon: 'i-lucide-circle',
            link: '/components/progress',
          },
          {
            title: 'Radio Group',
            icon: 'i-lucide-circle',
            link: '/components/radio-group',
          },
          {
            title: 'Range Calendar',
            icon: 'i-lucide-circle',
            link: '/components/range-calendar',
          },
          {
            title: 'Resizable',
            icon: 'i-lucide-circle',
            link: '/components/resizable',
          },
          {
            title: 'Scroll Area',
            icon: 'i-lucide-circle',
            link: '/components/scroll-area',
          },
          {
            title: 'Select',
            icon: 'i-lucide-circle',
            link: '/components/select',
          },
          {
            title: 'Separator',
            icon: 'i-lucide-circle',
            link: '/components/separator',
          },
          {
            title: 'Sheet',
            icon: 'i-lucide-circle',
            link: '/components/sheet',
          },
          {
            title: 'Skeleton',
            icon: 'i-lucide-circle',
            link: '/components/skeleton',
          },
          {
            title: 'Slider',
            icon: 'i-lucide-circle',
            link: '/components/slider',
          },
          {
            title: 'Sonner',
            icon: 'i-lucide-circle',
            link: '/components/sonner',
          },
          {
            title: 'Stepper',
            icon: 'i-lucide-circle',
            link: '/components/stepper',
            new: true,
          },
          {
            title: 'Switch',
            icon: 'i-lucide-circle',
            link: '/components/switch',
          },
          {
            title: 'Table',
            icon: 'i-lucide-circle',
            link: '/components/table',
          },
          {
            title: 'Tabs',
            icon: 'i-lucide-circle',
            link: '/components/tabs',
          },
          {
            title: 'Tags Input',
            icon: 'i-lucide-circle',
            link: '/components/tags-input',
          },
          {
            title: 'Textarea',
            icon: 'i-lucide-circle',
            link: '/components/textarea',
          },
          {
            title: 'Toast',
            icon: 'i-lucide-circle',
            link: '/components/toast',
          },
          {
            title: 'Toggle',
            icon: 'i-lucide-circle',
            link: '/components/toggle',
          },
          {
            title: 'Toggle Group',
            icon: 'i-lucide-circle',
            link: '/components/toggle-group',
          },
          {
            title: 'Tooltip',
            icon: 'i-lucide-circle',
            link: '/components/tooltip',
          },
        ],
      },
    ],
  },
]

/** Administration: platform staff only — separate from agency ops. */
export const navMenuAdmin: NavMenu[] = [
  {
    heading: 'Plataforma',
    items: [
      {
        title: 'Plataforma',
        icon: 'i-lucide-shield',
        roles: ['admin', 'funcionario'],
        children: [
          { title: 'Usuários', icon: 'i-lucide-users', link: '/admin/users' },
          { title: 'Empresas', icon: 'i-lucide-building-2', link: '/admin/tenants' },
          { title: 'Agências', icon: 'i-lucide-network', link: '/admin/agencies' },
        ],
      },
    ],
  },
]

/**
 * Agency / organization scope — MVP agency nav (PDF §2) + kept org admin links.
 * Canonical paths are `/agency/*`; `/organization/*` remains as alias/redirect.
 */
export const navMenuOrganization: NavMenu[] = [
  {
    heading: 'Agência',
    items: [
      {
        title: 'Agência',
        icon: 'i-lucide-building-2',
        children: [
          {
            title: 'Visão geral',
            icon: 'i-lucide-layout-dashboard',
            link: '/agency',
            capability: 'agency.clients.read',
            organizationTypes: ['agency'],
          },
          {
            title: 'Clientes',
            icon: 'i-lucide-network',
            link: '/agency/clients',
            capability: 'agency.clients.read',
            organizationTypes: ['agency'],
          },
          {
            title: 'Produção geral',
            icon: 'i-lucide-kanban',
            link: '/agency/production',
            capability: 'agency.clients.read',
            organizationTypes: ['agency'],
          },
          {
            title: 'Calendário consolidado',
            icon: 'i-lucide-calendar-days',
            link: '/agency/calendar',
            capability: 'agency.clients.read',
            organizationTypes: ['agency'],
          },
          {
            title: 'Aprovações pendentes',
            icon: 'i-lucide-badge-check',
            link: '/agency/approvals',
            capability: 'agency.clients.read',
            organizationTypes: ['agency'],
          },
          {
            title: 'Equipe',
            icon: 'i-lucide-users-round',
            link: '/agency/team',
            capability: 'organization.team.manage',
          },
          {
            title: 'Cargos e permissões',
            icon: 'i-lucide-shield',
            link: '/organization/roles',
            capability: 'organization.roles.read',
          },
          {
            title: 'Configurações',
            icon: 'i-lucide-settings',
            link: '/organization/settings',
            capability: 'organization.manage',
            organizationTypes: ['agency'],
          },
        ],
      },
      {
        title: 'Organização',
        icon: 'i-lucide-building',
        children: [
          {
            title: 'Equipe',
            icon: 'i-lucide-users-round',
            link: '/organization/team',
            capability: 'organization.team.manage',
          },
          {
            title: 'Cargos e permissões',
            icon: 'i-lucide-shield',
            link: '/organization/roles',
            capability: 'organization.roles.read',
          },
        ],
      },
    ],
  },
]

/**
 * Cross-module settings — always visible below the active module menu.
 * Integrations and team live here so CRM-only tenants do not need Marketing.
 * Tenant user management (/settings/team) has a single entry: Configurações > Usuários.
 */
export const navMenuGlobal: NavMenu[] = [
  {
    heading: 'Configurações',
    items: [
      {
        title: 'Integrações',
        icon: 'i-lucide-plug',
        link: '/settings/integrations',
        roles: ['admin', 'funcionario', 'cliente'],
      },
      {
        title: 'Usuários',
        icon: 'i-lucide-users',
        link: '/settings/team',
        roles: ['admin', 'funcionario', 'cliente'],
      },
    ],
  },
]

export const navMenuBottom: NavMenuItems = []
