<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import CmsEmptyState from '~/components/cms/CmsEmptyState.vue'
import CmsGate from '~/components/cms/CmsGate.vue'
import CmsPageHeader from '~/components/cms/CmsPageHeader.vue'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { cmsFieldErrors, cmsRoutePrefixes } from '~/composables/cms/cmsDisplay'
import { useCmsAccess } from '~/composables/cms/useCmsAccess'
import { normalizeCmsError } from '~/composables/cms/useCmsApi'
import { useCmsSites } from '~/composables/cms/useCmsSites'
import { CMS_DEFAULT_LOCALE, CMS_DEFAULT_TIMEZONE } from '~/lib/cms/contracts'

definePageMeta({
  middleware: ['auth'],
  title: 'Configurações do site',
})

const access = useCmsAccess()
const sites = useCmsSites()

const nameId = useId()
const localeId = useId()
const timezoneId = useId()
const articlePrefixId = useId()
const newsPrefixId = useId()

const form = reactive({
  name: '',
  locale: CMS_DEFAULT_LOCALE,
  timezone: CMS_DEFAULT_TIMEZONE,
  articlePrefix: 'artigos',
  newsPrefix: 'noticias',
})
const fieldErrors = ref<Record<string, string>>({})
const saving = ref(false)
const copied = ref(false)

const site = computed(() => sites.currentSite.value)
const gateError = computed(() => sites.loadError.value)

function applySite(value: NonNullable<typeof site.value>) {
  const prefixes = cmsRoutePrefixes(value)
  form.name = value.name
  form.locale = value.defaultLocale || CMS_DEFAULT_LOCALE
  form.timezone = value.timezone || CMS_DEFAULT_TIMEZONE
  form.articlePrefix = prefixes.article
  form.newsPrefix = prefixes.news
  fieldErrors.value = {}
}

watch(() => site.value?.id, (id) => {
  if (!id || !site.value)
    return
  applySite(site.value)
}, { immediate: true })

async function copySiteKey() {
  if (!site.value?.siteKey || !import.meta.client)
    return
  try {
    await navigator.clipboard.writeText(site.value.siteKey)
    copied.value = true
    toast.success('Chave pública copiada.')
    setTimeout(() => {
      copied.value = false
    }, 2000)
  }
  catch {
    toast.error('Não foi possível copiar a chave.')
  }
}

async function save() {
  if (!site.value || saving.value || !access.canManageSettings.value)
    return
  saving.value = true
  fieldErrors.value = {}
  try {
    const currentRoutes = site.value.settings?.routes
    const routes = currentRoutes && typeof currentRoutes === 'object'
      ? { ...(currentRoutes as Record<string, unknown>) }
      : {}
    await sites.updateSite(site.value.id, {
      name: form.name.trim(),
      defaultLocale: form.locale.trim() || CMS_DEFAULT_LOCALE,
      timezone: form.timezone.trim() || CMS_DEFAULT_TIMEZONE,
      settings: {
        ...(site.value.settings || {}),
        routes: {
          ...routes,
          article: form.articlePrefix.trim().replace(/^\/+|\/+$/g, '') || 'artigos',
          news: form.newsPrefix.trim().replace(/^\/+|\/+$/g, '') || 'noticias',
        },
      },
    })
    toast.success('Configurações salvas.')
  }
  catch (error: unknown) {
    const normalized = normalizeCmsError(error)
    fieldErrors.value = cmsFieldErrors(normalized.details)
    toast.error(normalized.message)
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-6">
    <CmsPageHeader
      title="Configurações"
      description="Dados do site, idioma e prefixos de endereço."
      :sites="sites.sites.value"
      :current-site-id="sites.currentSite.value?.id"
      @select-site="sites.selectSite"
    />

    <CmsGate :allowed="access.canManageSettings.value" :error="gateError" @retry="sites.refresh()">
      <div v-if="sites.showSkeleton.value" class="h-64 animate-pulse rounded-xl bg-muted" />

      <CmsEmptyState
        v-else-if="!site"
        icon="lucide:globe"
        title="Nenhum site ainda"
        description="Crie o site na visão geral antes de configurar."
      >
        <Button as-child>
          <NuxtLink to="/cms">
            Ir para a visão geral
          </NuxtLink>
        </Button>
      </CmsEmptyState>

      <form
        v-else
        class="border rounded-xl p-5 space-y-6"
        @submit.prevent="save"
      >
        <div class="space-y-2">
          <Label :for="nameId">Nome do site</Label>
          <Input :id="nameId" v-model="form.name" required maxlength="160" />
          <p v-if="fieldErrors.name" class="text-xs text-destructive">
            {{ fieldErrors.name }}
          </p>
        </div>

        <div class="space-y-2">
          <Label>Chave pública</Label>
          <div class="flex gap-2">
            <Input :model-value="site.siteKey" readonly class="text-sm font-mono" />
            <Button type="button" variant="outline" @click="copySiteKey">
              <Icon :name="copied ? 'lucide:check' : 'lucide:copy'" class="size-4" aria-hidden="true" />
              <span class="sr-only">Copiar chave pública</span>
            </Button>
          </div>
          <p class="text-xs text-muted-foreground">
            Identificador público usado pelo site. Não autoriza acesso a rascunhos.
          </p>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-2">
            <Label :for="localeId">Idioma padrão</Label>
            <Input :id="localeId" v-model="form.locale" placeholder="pt-BR" />
          </div>
          <div class="space-y-2">
            <Label :for="timezoneId">Fuso horário</Label>
            <Input :id="timezoneId" v-model="form.timezone" placeholder="America/Sao_Paulo" />
          </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-2">
            <Label :for="articlePrefixId">Prefixo de artigos</Label>
            <div class="flex items-center gap-1">
              <span class="text-sm text-muted-foreground">/</span>
              <Input :id="articlePrefixId" v-model="form.articlePrefix" />
            </div>
          </div>
          <div class="space-y-2">
            <Label :for="newsPrefixId">Prefixo de notícias</Label>
            <div class="flex items-center gap-1">
              <span class="text-sm text-muted-foreground">/</span>
              <Input :id="newsPrefixId" v-model="form.newsPrefix" />
            </div>
          </div>
        </div>

        <div class="flex justify-end">
          <Button type="submit" :disabled="saving">
            {{ saving ? 'Salvando…' : 'Salvar' }}
          </Button>
        </div>
      </form>
    </CmsGate>
  </div>
</template>
