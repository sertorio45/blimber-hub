<script setup lang="ts">
import type { CmsSite } from '~/lib/cms/contracts'

import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import CmsCreateSiteDialog from '~/components/cms/CmsCreateSiteDialog.vue'
import CmsEmptyState from '~/components/cms/CmsEmptyState.vue'
import CmsGate from '~/components/cms/CmsGate.vue'
import CmsPageHeader from '~/components/cms/CmsPageHeader.vue'
import { cmsFieldErrors, cmsRoutePrefixes, cmsSlugify } from '~/composables/cms/cmsDisplay'
import { useCmsAccess } from '~/composables/cms/useCmsAccess'
import { normalizeCmsError } from '~/composables/cms/useCmsApi'
import { useCmsSites } from '~/composables/cms/useCmsSites'
import { useTenantPage } from '~/composables/useTenantPage'
import { cmsSlugSchema } from '~/lib/cms/contracts'

definePageMeta({
  middleware: ['auth'],
  title: 'Configurações do site',
})

useTenantPage()

const access = useCmsAccess()
const {
  sites,
  currentSite,
  showSkeleton,
  loadError,
  refresh,
  selectSite,
  createSite,
  updateSite,
} = useCmsSites()

const createOpen = ref(false)
const saving = ref(false)
const copied = ref(false)
const name = ref('')
const locale = ref('pt-BR')
const timezone = ref('America/Sao_Paulo')
const articlePrefix = ref('artigos')
const newsPrefix = ref('noticias')
const errors = ref<Record<string, string>>({})
const boundSiteId = ref<string | null>(null)

const LOCALES = [
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'pt-PT', label: 'Português (Portugal)' },
  { value: 'en-US', label: 'English (United States)' },
  { value: 'es-ES', label: 'Español' },
]

const TIMEZONES = [
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Recife',
  'America/Fortaleza',
  'America/Belem',
  'America/Cuiaba',
  'America/Rio_Branco',
  'America/Noronha',
  'America/New_York',
  'Europe/Lisbon',
  'UTC',
]

const localeOptions = computed(() => {
  if (LOCALES.some(item => item.value === locale.value))
    return LOCALES
  return [{ value: locale.value, label: locale.value }, ...LOCALES]
})

const timezoneOptions = computed(() => {
  if (TIMEZONES.includes(timezone.value))
    return TIMEZONES
  return [timezone.value, ...TIMEZONES]
})

function applySite(site: CmsSite) {
  boundSiteId.value = site.id
  name.value = site.name
  locale.value = site.defaultLocale || 'pt-BR'
  timezone.value = site.timezone || 'America/Sao_Paulo'
  const prefixes = cmsRoutePrefixes(site)
  articlePrefix.value = prefixes.article
  newsPrefix.value = prefixes.news
  errors.value = {}
}

watch(currentSite, (site) => {
  if (!site) {
    boundSiteId.value = null
    return
  }
  if (site.id !== boundSiteId.value)
    applySite(site)
}, { immediate: true })

async function copySiteKey() {
  const key = currentSite.value?.siteKey
  if (!key)
    return
  try {
    await navigator.clipboard.writeText(key)
    copied.value = true
    toast.success('Chave copiada')
    window.setTimeout(() => {
      copied.value = false
    }, 2000)
  }
  catch {
    toast.error('Não foi possível copiar a chave')
  }
}

async function save() {
  const site = currentSite.value
  if (!site || saving.value)
    return

  const nextErrors: Record<string, string> = {}
  if (!name.value.trim())
    nextErrors.name = 'Informe o nome do site.'
  const article = cmsSlugify(articlePrefix.value)
  const news = cmsSlugify(newsPrefix.value)
  if (!cmsSlugSchema.safeParse(article).success)
    nextErrors.articlePrefix = 'Use letras minúsculas, números e hífens.'
  if (!cmsSlugSchema.safeParse(news).success)
    nextErrors.newsPrefix = 'Use letras minúsculas, números e hífens.'
  errors.value = nextErrors
  if (Object.keys(nextErrors).length)
    return

  saving.value = true
  try {
    const currentRoutes = site.settings?.routes
    const preserved = currentRoutes && typeof currentRoutes === 'object' && !Array.isArray(currentRoutes)
      ? { ...(currentRoutes as Record<string, unknown>) }
      : {}
    const updated = await updateSite(site.id, {
      name: name.value.trim(),
      defaultLocale: locale.value.trim() || 'pt-BR',
      timezone: timezone.value,
      settings: {
        routes: { ...preserved, article, news },
      },
    })
    applySite(updated)
    toast.success('Configurações salvas')
  }
  catch (error: unknown) {
    const normalized = normalizeCmsError(error)
    if (normalized.code === 'aborted')
      return
    const fields = cmsFieldErrors(normalized.details, normalized.message)
    errors.value = Object.keys(fields).length ? fields : { form: normalized.message }
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <CmsGate :allowed="access.canManageSettings.value" :error="loadError" @retry="refresh()">
    <div class="mx-auto max-w-2xl space-y-6">
      <CmsPageHeader
        title="Configurações"
        description="Nome, idioma e os endereços de artigos e notícias."
        :sites="sites"
        :current-site-id="currentSite?.id"
        @select-site="selectSite"
      />

      <div v-if="!access.ready.value || showSkeleton" class="space-y-3" aria-busy="true">
        <Skeleton class="h-10 w-full" />
        <Skeleton class="h-10 w-full" />
        <Skeleton class="h-10 w-2/3" />
      </div>

      <CmsEmptyState
        v-else-if="!currentSite"
        icon="lucide:globe"
        title="Nenhum site ainda"
        description="Crie o site desta empresa para definir idioma, fuso e endereços."
      >
        <Button @click="createOpen = true">
          <Icon name="lucide:plus" class="mr-2 size-4" aria-hidden="true" />
          Criar site
        </Button>
      </CmsEmptyState>

      <form v-else class="border rounded-xl bg-card p-5 space-y-5" novalidate @submit.prevent="save">
        <div class="space-y-1.5">
          <Label for="cms-site-name">Nome</Label>
          <Input id="cms-site-name" v-model="name" maxlength="160" autocomplete="off" :aria-invalid="Boolean(errors.name) || undefined" />
          <p v-if="errors.name" class="text-xs text-destructive">
            {{ errors.name }}
          </p>
        </div>

        <div class="space-y-1.5">
          <Label for="cms-site-key">Chave pública</Label>
          <div class="flex gap-2">
            <Input id="cms-site-key" :model-value="currentSite.siteKey" readonly class="font-mono" />
            <Button type="button" variant="outline" :aria-label="copied ? 'Chave copiada' : 'Copiar chave'" @click="copySiteKey">
              <Icon :name="copied ? 'lucide:check' : 'lucide:copy'" class="size-4" aria-hidden="true" />
            </Button>
          </div>
          <p class="text-xs text-muted-foreground">
            O front-end usa esta chave para buscar o conteúdo. Ela não pode ser alterada.
          </p>
          <p v-if="errors.siteKey" class="text-xs text-destructive">
            {{ errors.siteKey }}
          </p>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-1.5">
            <Label for="cms-locale">Idioma</Label>
            <Select :model-value="locale" @update:model-value="value => (locale = String(value))">
              <SelectTrigger id="cms-locale" aria-label="Idioma">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="option in localeOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-1.5">
            <Label for="cms-timezone">Fuso horário</Label>
            <Select :model-value="timezone" @update:model-value="value => (timezone = String(value))">
              <SelectTrigger id="cms-timezone" aria-label="Fuso horário">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="zone in timezoneOptions" :key="zone" :value="zone">
                  {{ zone }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <fieldset class="space-y-4">
          <legend class="text-sm font-medium">
            Endereços
          </legend>
          <p class="text-xs text-muted-foreground">
            Prefixo antes do slug. Uma notícia em <span class="font-mono">lancamento</span> fica em <span class="font-mono">/{{ newsPrefix || 'noticias' }}/lancamento</span>.
          </p>
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-1.5">
              <Label for="cms-route-article">Artigos</Label>
              <Input id="cms-route-article" v-model="articlePrefix" maxlength="80" class="font-mono" autocomplete="off" spellcheck="false" />
              <p v-if="errors.articlePrefix" class="text-xs text-destructive">
                {{ errors.articlePrefix }}
              </p>
            </div>
            <div class="space-y-1.5">
              <Label for="cms-route-news">Notícias</Label>
              <Input id="cms-route-news" v-model="newsPrefix" maxlength="80" class="font-mono" autocomplete="off" spellcheck="false" />
              <p v-if="errors.newsPrefix" class="text-xs text-destructive">
                {{ errors.newsPrefix }}
              </p>
            </div>
          </div>
        </fieldset>

        <p v-if="errors.form" role="alert" class="border border-destructive/30 rounded-md bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {{ errors.form }}
        </p>

        <div class="flex justify-end">
          <Button type="submit" :disabled="saving || !name.trim()">
            <Icon v-if="saving" name="lucide:loader-circle" class="mr-2 size-4 animate-spin" aria-hidden="true" />
            {{ saving ? 'Salvando…' : 'Salvar' }}
          </Button>
        </div>
      </form>
    </div>

    <CmsCreateSiteDialog v-model:open="createOpen" :create="createSite" />
  </CmsGate>
</template>
