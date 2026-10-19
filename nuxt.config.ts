import process from 'node:process'

// https://nuxt.com/docs/api/configuration/nuxt-config
import { ADS_LEGACY_REDIRECTS, MARKETING_REPORTS_REDIRECTS, MARKETING_SETTINGS_REDIRECTS } from './constants/ads-domain'
import { APP_DESCRIPTION, APP_FULL_NAME, APP_NAME } from './constants/app'

const redirectRouteRules = Object.fromEntries(
  Object.entries({ ...ADS_LEGACY_REDIRECTS, ...MARKETING_SETTINGS_REDIRECTS, ...MARKETING_REPORTS_REDIRECTS }).map(([from, to]) => [
    from,
    { redirect: { to, statusCode: 301 as const } },
  ]),
)

export default defineNuxtConfig({
  devtools: { enabled: false },
  ssr: true,

  app: {
    head: {
      title: APP_FULL_NAME,
      titleTemplate: `%s · ${APP_NAME}`,
      htmlAttrs: { lang: 'pt-BR' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: APP_DESCRIPTION },
        { name: 'application-name', content: APP_FULL_NAME },
      ],
      link: [{ rel: 'icon', href: '/favicon.ico' }],
    },
  },

  modules: [
    '@unocss/nuxt',
    'shadcn-nuxt',
    '@vueuse/nuxt',
    '@nuxt/eslint',
    '@nuxt/icon',
    '@pinia/nuxt',
    '@nuxtjs/color-mode',
    '@nuxtjs/supabase',
    '@nuxt/image',
  ],

  css: [
    '@unocss/reset/tailwind.css',
    '~/assets/css/vue-flow-overrides.css',
  ],

  colorMode: {
    classSuffix: '',
  },

  features: {
    // For UnoCSS
    inlineStyles: false,
  },

  eslint: {
    config: {
      standalone: false,
    },
  },

  nitro: {
    // Native modules must stay external; trace platform binaries for Vercel linux-x64.
    serverExternalPackages: ['sharp', '@img/sharp-linux-x64', '@img/sharp-libvips-linux-x64', '@modelcontextprotocol/sdk'],
    externals: {
      external: ['sharp', '@img/sharp-linux-x64', '@img/sharp-libvips-linux-x64', '@modelcontextprotocol/sdk'],
      traceInclude: [
        'node_modules/sharp/**',
        'node_modules/@img/**',
        'node_modules/@img/sharp-linux-x64/**',
        'node_modules/@img/sharp-libvips-linux-x64/**',
      ],
    },
    routeRules: {
      // Phone photos can exceed the default Nitro body limit; align with bucket max (100MB).
      '/api/marketing/social/upload-asset': {
        bodySizeLimit: 104857600,
      },
      '/api/gpt/marketing/assets/upload': {
        bodySizeLimit: 12582912,
      },
      '/api/mcp': {
        headers: { 'Cache-Control': 'no-store' },
      },
      '/api/mcp/oauth/**': {
        headers: { 'Cache-Control': 'no-store' },
      },
      '/.well-known/oauth-protected-resource/**': {
        headers: { 'Cache-Control': 'public, max-age=300' },
      },
      '/.well-known/oauth-authorization-server/**': {
        headers: { 'Cache-Control': 'public, max-age=300' },
      },
    },
  },

  routeRules: {
    // Marketing MVP canonical routes — keep old bookmarks working.
    '/marketing/posts': { redirect: { to: '/marketing/content', statusCode: 301 } },
    '/marketing/posts/new': { redirect: { to: '/marketing/content/new', statusCode: 301 } },
    '/marketing/posts/tasks': { redirect: { to: '/marketing/production/tasks', statusCode: 301 } },
    '/marketing/posts/**': { redirect: { to: '/marketing/content/**', statusCode: 301 } },
    '/marketing/library': { redirect: { to: '/marketing/media', statusCode: 301 } },
    '/marketing/brand-guide': { redirect: { to: '/marketing/brand', statusCode: 301 } },
    // Agency MVP aliases stay as page aliases; keep SSR headers for both trees.
    // Authenticated app: keep SSR (project rule) but never share/cache across users.
    '/crm/**': {
      headers: { 'Cache-Control': 'private, no-store' },
    },
    '/settings/**': {
      headers: { 'Cache-Control': 'private, no-store' },
    },
    '/organization/**': {
      headers: { 'Cache-Control': 'private, no-store' },
    },
    '/agency': { ssr: true, headers: { 'Cache-Control': 'private, no-store' } },
    '/agency/**': { ssr: true, headers: { 'Cache-Control': 'private, no-store' } },
    '/admin/**': {
      headers: { 'Cache-Control': 'private, no-store' },
    },
    '/marketing': { ssr: true, headers: { 'Cache-Control': 'private, no-store' } },
    '/marketing/**': { ssr: true, headers: { 'Cache-Control': 'private, no-store' } },
    ...redirectRouteRules,
    '/whatsapp': { ssr: true, headers: { 'Cache-Control': 'private, no-store' } },
    '/whatsapp/**': { ssr: true, headers: { 'Cache-Control': 'private, no-store' } },
    // Inbox usa realtime e componentes client-only; evita erro de vnode no SSR.
    '/whatsapp/conversations': { ssr: false },
    '/whatsapp/conversations/**': { ssr: false },
    '/whatsapp/flows/**': { ssr: false },
    // Auth pages can be prerendered shells.
    '/login': { prerender: true },
    '/forgot-password': { prerender: true },
    '/confirm': { headers: { 'Cache-Control': 'private, no-store' } },
    '/invite': { headers: { 'Cache-Control': 'private, no-store' } },
  },

  experimental: {
    // Prefer view transitions / payload reuse on client navigations when available.
    payloadExtraction: false,
  },

  imports: {
    dirs: [
      './lib',
      './composables/marketing',
      './composables/whatsapp',
    ],
  },

  pinia: {
    storesDirs: ['./stores/**'],
  },

  compatibilityDate: '2024-12-14',

  runtimeConfig: {
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'https://ollama.gsstudio.com.br',
    ollamaDefaultModel: process.env.OLLAMA_DEFAULT_MODEL || 'qwen',
    ollamaCfAccessClientId: process.env.OLLAMA_CF_ACCESS_CLIENT_ID || '',
    ollamaCfAccessClientSecret: process.env.OLLAMA_CF_ACCESS_CLIENT_SECRET || '',
    /** HMAC key for public preview tokens. `NUXT_CMS_PREVIEW_SECRET` overrides this. */
    cmsPreviewSecret: process.env.CMS_PREVIEW_SECRET || '',

    public: {
      // Required by the WhatsApp Embedded Signup popup, which runs in the browser.
      metaAppId: process.env.META_APP_ID || '',
      metaWhatsappConfigId: process.env.META_WHATSAPP_CONFIG_ID || '',
      metaGraphVersion: process.env.META_GRAPH_VERSION || 'v21.0',
    },
  },

  supabase: {
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      exclude: [
        '/login',
        '/login-basic',
        '/register',
        '/forgot-password',
        '/reset-password',
        '/confirm',
        '/invite',
        '/403',
        '/404',
        '/401',
        '/500',
        '/503',
        '/api/**',
      ],
    },
  },
})
