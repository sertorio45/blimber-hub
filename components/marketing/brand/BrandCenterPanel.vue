<script setup lang="ts">
import type {
  BrandCenterTab,
  BrandCompleteness,
  BrandGuide,
  BrandGuideLogoAsset,
  BrandGuideMetadata,
} from '~/types/brand-guide'
import {
  applyBrandLogoSelection,
  createEmptyAudienceProfile,
  createEmptyVisualDirection,
  newBrandCompetitor,
  newBrandFont,
  newBrandProduct,
  newBrandReference,
} from '~/utils/brand-guide'
import BrandAiPreferencesEditor from '~/components/marketing/brand/BrandAiPreferencesEditor.vue'
import BrandColorEditor from '~/components/marketing/brand/BrandColorEditor.vue'
import BrandLogoPicker from '~/components/marketing/brand/BrandLogoPicker.vue'
import BrandTagListEditor from '~/components/marketing/brand/BrandTagListEditor.vue'
import BrandVisualDirectionEditor from '~/components/marketing/brand/BrandVisualDirectionEditor.vue'

const props = defineProps<{
  modelValue: BrandGuide
  completeness: BrandCompleteness
  canManage: boolean
  saving: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: BrandGuide]
  save: []
}>()

const tab = ref<BrandCenterTab>('overview')

const tabs: Array<{ id: BrandCenterTab, label: string, icon: string }> = [
  { id: 'overview', label: 'Visão geral', icon: 'lucide:layout-dashboard' },
  { id: 'identity', label: 'Identidade visual', icon: 'lucide:palette' },
  { id: 'visual', label: 'Direção visual', icon: 'lucide:aperture' },
  { id: 'communication', label: 'Comunicação', icon: 'lucide:message-square' },
  { id: 'audience', label: 'Público', icon: 'lucide:users' },
  { id: 'products', label: 'Produtos', icon: 'lucide:package' },
  { id: 'competitors', label: 'Concorrentes', icon: 'lucide:compass' },
  { id: 'restrictions', label: 'Restrições', icon: 'lucide:shield' },
  { id: 'ai', label: 'IA', icon: 'lucide:sparkles' },
]

const guide = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

function patch(partial: Partial<BrandGuide>) {
  emit('update:modelValue', { ...props.modelValue, ...partial })
}

function ensureAudienceProfile() {
  return props.modelValue.metadata.audienceProfile || createEmptyAudienceProfile(props.modelValue.audience)
}

function patchAudience(partial: Partial<ReturnType<typeof createEmptyAudienceProfile>>) {
  const audienceProfile = { ...ensureAudienceProfile(), ...partial }
  patch({
    audience: audienceProfile.summary,
    metadata: {
      ...props.modelValue.metadata,
      audienceProfile,
    },
  })
}

function patchMetadata(partial: Partial<BrandGuideMetadata>) {
  patch({
    metadata: {
      ...props.modelValue.metadata,
      ...partial,
    },
  })
}

/** Atomic logo patch — sequential ids/assets emits used to wipe logoAssetIds. */
function onLogosChange(selection: { logoAssetIds: string[], logoAssets: BrandGuideLogoAsset[] }) {
  emit('update:modelValue', applyBrandLogoSelection(props.modelValue, selection))
}

async function onLogosUploaded(selection: { logoAssetIds: string[], logoAssets: BrandGuideLogoAsset[] }) {
  onLogosChange(selection)
  if (!props.canManage || props.saving)
    return
  await nextTick()
  emit('save')
}

/** Atomic visual refs — ids live in metadata, assets on the guide root. */
function onVisualRefsChange(selection: { assetIds: string[], assets: BrandGuideLogoAsset[] }) {
  const visualDirection = {
    ...(props.modelValue.metadata.visualDirection || createEmptyVisualDirection()),
    visualReferenceAssetIds: selection.assetIds,
  }
  patch({
    visualReferenceAssets: selection.assets,
    metadata: {
      ...props.modelValue.metadata,
      visualDirection,
    },
  })
}

const fontRoles = [
  { value: 'heading', label: 'Títulos' },
  { value: 'body', label: 'Corpo' },
  { value: 'accent', label: 'Destaque' },
  { value: 'other', label: 'Outra' },
] as const

const refKinds = [
  { value: 'inspiration', label: 'Inspiração' },
  { value: 'style', label: 'Estilo' },
  { value: 'other', label: 'Outra' },
] as const

function tonePreview(): string {
  const tone = guide.value.toneOfVoice.trim()
  if (!tone)
    return 'Sem tom definido'
  return tone.length > 120 ? `${tone.slice(0, 117)}…` : tone
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">
          Marca
        </h1>
        <p class="mt-1 text-muted-foreground">
          Brand Center do cliente ativo — identidade, direção visual, comunicação e IA.
        </p>
      </div>
      <div class="flex items-center gap-3">
        <div class="min-w-32">
          <div class="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Completude</span>
            <span>{{ completeness.percent }}%</span>
          </div>
          <Progress :model-value="completeness.percent" class="h-2" />
        </div>
        <Button
          v-if="canManage"
          :disabled="saving"
          @click="emit('save')"
        >
          <Icon
            v-if="saving"
            name="lucide:loader-2"
            class="mr-1.5 h-4 w-4 animate-spin"
          />
          Salvar
        </Button>
      </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav class="hidden lg:block">
        <div class="sticky top-4 space-y-1 rounded-xl border p-2">
          <button
            v-for="item in tabs"
            :key="item.id"
            type="button"
            class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition"
            :class="tab === item.id
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'"
            @click="tab = item.id"
          >
            <Icon
              :name="item.icon"
              class="h-4 w-4 shrink-0"
            />
            {{ item.label }}
          </button>
        </div>
      </nav>

      <div class="space-y-4">
        <Tabs
          v-model="tab"
          class="lg:hidden"
        >
          <TabsList class="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
            <TabsTrigger
              v-for="item in tabs"
              :key="item.id"
              :value="item.id"
              class="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              {{ item.label }}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <!-- Overview -->
        <div
          v-if="tab === 'overview'"
          class="space-y-4"
        >
          <Card>
            <CardContent class="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p class="text-sm text-muted-foreground">
                  Completude do Brand Center
                </p>
                <p class="text-3xl font-semibold tracking-tight">
                  {{ completeness.percent }}%
                </p>
                <p class="mt-1 text-xs text-muted-foreground">
                  Indicador apenas — não bloqueia salvar nem usar a marca.
                </p>
              </div>
              <Progress
                :model-value="completeness.percent"
                class="h-3 w-full sm:w-48"
              />
            </CardContent>
          </Card>

          <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader class="pb-2">
                <CardTitle class="text-sm font-medium">
                  Logo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  v-if="guide.logoAssets[0]?.previewUrl"
                  class="mb-2 h-14 w-14 overflow-hidden rounded-md border bg-white"
                >
                  <img
                    :src="guide.logoAssets[0].previewUrl"
                    :alt="guide.logoAssets[0].name"
                    class="h-full w-full object-contain p-1"
                  >
                </div>
                <p class="text-sm text-muted-foreground">
                  {{ guide.logoAssetIds.length
                    ? `${guide.logoAssetIds.length} arquivo(s)`
                    : 'Não definido' }}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader class="pb-2">
                <CardTitle class="text-sm font-medium">
                  Cores
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  v-if="guide.colors.length"
                  class="mb-2 flex gap-1"
                >
                  <span
                    v-for="color in guide.colors.slice(0, 5)"
                    :key="color.id"
                    class="h-6 w-6 rounded-md border"
                    :style="{ backgroundColor: color.hex }"
                  />
                </div>
                <p class="text-sm text-muted-foreground">
                  {{ guide.colors.length ? `${guide.colors.length} cor(es)` : 'Não definido' }}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader class="pb-2">
                <CardTitle class="text-sm font-medium">
                  Tom
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p class="text-sm text-muted-foreground">
                  {{ tonePreview() }}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader class="pb-2">
                <CardTitle class="text-sm font-medium">
                  Público
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p class="text-sm text-muted-foreground">
                  {{
                    guide.audience?.trim()
                      || (guide.metadata.audienceProfile?.segments?.length
                        ? `${guide.metadata.audienceProfile.segments.length} segmento(s)`
                        : 'Não definido')
                  }}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle class="text-base">
                Seções
              </CardTitle>
            </CardHeader>
            <CardContent class="grid gap-2 sm:grid-cols-2">
              <button
                v-for="section in completeness.sections"
                :key="section.id"
                type="button"
                class="flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition hover:bg-muted/40"
                @click="tab = (['audience', 'products', 'competitors', 'restrictions', 'visual', 'ai'].includes(section.id)
                  ? section.id
                  : section.id === 'tone' || section.id === 'words'
                    ? 'communication'
                    : section.id === 'logos' || section.id === 'colors' || section.id === 'fonts'
                      ? 'identity'
                      : 'overview') as BrandCenterTab"
              >
                <span>{{ section.label }}</span>
                <Badge :variant="section.filled ? 'default' : 'outline'">
                  {{ section.filled ? 'Preenchido' : 'Pendente' }}
                </Badge>
              </button>
            </CardContent>
          </Card>
        </div>

        <!-- Identity -->
        <div
          v-else-if="tab === 'identity'"
          class="space-y-4"
        >
          <Card>
            <CardContent class="space-y-6 p-6">
              <BrandLogoPicker
                :logo-asset-ids="guide.logoAssetIds"
                :logo-assets="guide.logoAssets"
                :disabled="!canManage"
                @change="onLogosChange"
                @uploaded="onLogosUploaded"
              />

              <Separator />

              <BrandColorEditor
                :model-value="guide.colors"
                :disabled="!canManage"
                @update:model-value="patch({ colors: $event })"
              />

              <Separator />

              <div class="space-y-4">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="text-sm font-medium">
                      Tipografia
                    </p>
                    <p class="text-xs text-muted-foreground">
                      Famílias e papéis tipográficos da marca.
                    </p>
                  </div>
                  <Button
                    v-if="canManage"
                    type="button"
                    size="sm"
                    variant="outline"
                    @click="patch({ fonts: [...guide.fonts, newBrandFont()] })"
                  >
                    <Icon
                      name="lucide:plus"
                      class="mr-1.5 h-4 w-4"
                    />
                    Fonte
                  </Button>
                </div>

                <div
                  v-if="!guide.fonts.length"
                  class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground"
                >
                  Nenhuma fonte cadastrada.
                </div>

                <div
                  v-for="(font, index) in guide.fonts"
                  :key="font.id"
                  class="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_160px_auto]"
                >
                  <Input
                    :model-value="font.family"
                    placeholder="Família tipográfica"
                    :disabled="!canManage"
                    @update:model-value="patch({
                      fonts: guide.fonts.map((item, i) => i === index
                        ? { ...item, family: String($event || '') }
                        : item),
                    })"
                  />
                  <Select
                    :model-value="font.role"
                    :disabled="!canManage"
                    @update:model-value="patch({
                      fonts: guide.fonts.map((item, i) => i === index
                        ? { ...item, role: $event as typeof font.role }
                        : item),
                    })"
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Papel" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        v-for="role in fontRoles"
                        :key="role.value"
                        :value="role.value"
                      >
                        {{ role.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    v-if="canManage"
                    type="button"
                    size="icon"
                    variant="ghost"
                    @click="patch({ fonts: guide.fonts.filter((_, i) => i !== index) })"
                  >
                    <Icon
                      name="lucide:trash-2"
                      class="h-4 w-4"
                    />
                  </Button>
                  <Input
                    class="sm:col-span-3"
                    :model-value="font.notes"
                    placeholder="Notas (pesos, uso…)"
                    :disabled="!canManage"
                    @update:model-value="patch({
                      fonts: guide.fonts.map((item, i) => i === index
                        ? { ...item, notes: String($event || '') }
                        : item),
                    })"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <!-- Communication -->
        <div
          v-else-if="tab === 'communication'"
          class="space-y-4"
        >
          <Card>
            <CardContent class="space-y-4 p-6">
              <div class="space-y-2">
                <Label>Tom de voz</Label>
                <Textarea
                  :model-value="guide.toneOfVoice"
                  rows="4"
                  :disabled="!canManage"
                  placeholder="Como a marca deve soar…"
                  @update:model-value="patch({ toneOfVoice: String($event || '') })"
                />
              </div>
              <div class="space-y-2">
                <Label>Estilo de comunicação</Label>
                <Textarea
                  :model-value="guide.metadata.communicationStyle || ''"
                  rows="3"
                  :disabled="!canManage"
                  placeholder="Formalidade, ritmo, emojis, estrutura de frases…"
                  @update:model-value="patchMetadata({ communicationStyle: String($event || '') })"
                />
              </div>
              <BrandTagListEditor
                :model-value="guide.allowedWords"
                label="Palavras permitidas"
                hint="Termos que reforçam a marca."
                separator-hint="Separe por vírgula ou Enter."
                :disabled="!canManage"
                @update:model-value="patch({ allowedWords: $event })"
              />
              <BrandTagListEditor
                :model-value="guide.forbiddenWords"
                label="Palavras proibidas"
                hint="Evitar em textos e criativos."
                :disabled="!canManage"
                @update:model-value="patch({ forbiddenWords: $event })"
              />
              <BrandTagListEditor
                :model-value="guide.ctas"
                label="CTAs"
                hint="Chamadas para ação preferenciais."
                :disabled="!canManage"
                @update:model-value="patch({ ctas: $event })"
              />
              <BrandTagListEditor
                :model-value="guide.hashtags"
                label="Hashtags"
                :disabled="!canManage"
                @update:model-value="patch({ hashtags: $event })"
              />
            </CardContent>
          </Card>
        </div>

        <!-- Audience -->
        <div
          v-else-if="tab === 'audience'"
          class="space-y-4"
        >
          <Card>
            <CardContent class="space-y-4 p-6">
              <p class="text-sm text-muted-foreground">
                Perfil estruturado para briefing — não substitui o CRM.
              </p>
              <div class="space-y-2">
                <Label>Resumo do público</Label>
                <Textarea
                  :model-value="ensureAudienceProfile().summary"
                  rows="3"
                  :disabled="!canManage"
                  @update:model-value="patchAudience({ summary: String($event || '') })"
                />
              </div>
              <div class="space-y-2">
                <Label>Demografia / contexto</Label>
                <Textarea
                  :model-value="ensureAudienceProfile().demographics"
                  rows="3"
                  :disabled="!canManage"
                  placeholder="Faixa etária, localização, ocupação…"
                  @update:model-value="patchAudience({ demographics: String($event || '') })"
                />
              </div>
              <BrandTagListEditor
                :model-value="ensureAudienceProfile().segments"
                label="Segmentos"
                :disabled="!canManage"
                @update:model-value="patchAudience({ segments: $event })"
              />
              <BrandTagListEditor
                :model-value="ensureAudienceProfile().pains"
                label="Dores"
                :disabled="!canManage"
                @update:model-value="patchAudience({ pains: $event })"
              />
              <BrandTagListEditor
                :model-value="ensureAudienceProfile().motivations"
                label="Motivações"
                :disabled="!canManage"
                @update:model-value="patchAudience({ motivations: $event })"
              />
              <BrandTagListEditor
                :model-value="ensureAudienceProfile().preferredChannels"
                label="Canais preferidos"
                :disabled="!canManage"
                @update:model-value="patchAudience({ preferredChannels: $event })"
              />
            </CardContent>
          </Card>
        </div>

        <!-- Products -->
        <div
          v-else-if="tab === 'products'"
          class="space-y-4"
        >
          <Card>
            <CardContent class="space-y-4 p-6">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-sm font-medium">
                    Produtos e serviços
                  </p>
                  <p class="text-xs text-muted-foreground">
                    Catálogo leve para contexto de conteúdo.
                  </p>
                </div>
                <Button
                  v-if="canManage"
                  type="button"
                  size="sm"
                  variant="outline"
                  @click="patch({ products: [...guide.products, newBrandProduct()] })"
                >
                  <Icon
                    name="lucide:plus"
                    class="mr-1.5 h-4 w-4"
                  />
                  Produto
                </Button>
              </div>

              <div
                v-if="!guide.products.length"
                class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground"
              >
                Nenhum produto cadastrado.
              </div>

              <div
                v-for="(product, index) in guide.products"
                :key="product.id"
                class="space-y-2 rounded-lg border p-4"
              >
                <div class="flex gap-2">
                  <Input
                    :model-value="product.name"
                    placeholder="Nome do produto"
                    class="flex-1"
                    :disabled="!canManage"
                    @update:model-value="patch({
                      products: guide.products.map((item, i) => i === index
                        ? { ...item, name: String($event || '') }
                        : item),
                    })"
                  />
                  <Button
                    v-if="canManage"
                    type="button"
                    size="icon"
                    variant="ghost"
                    @click="patch({ products: guide.products.filter((_, i) => i !== index) })"
                  >
                    <Icon
                      name="lucide:trash-2"
                      class="h-4 w-4"
                    />
                  </Button>
                </div>
                <Textarea
                  :model-value="product.description"
                  rows="2"
                  placeholder="Descrição"
                  :disabled="!canManage"
                  @update:model-value="patch({
                    products: guide.products.map((item, i) => i === index
                      ? { ...item, description: String($event || '') }
                      : item),
                  })"
                />
                <Input
                  :model-value="product.url"
                  placeholder="URL (opcional)"
                  :disabled="!canManage"
                  @update:model-value="patch({
                    products: guide.products.map((item, i) => i === index
                      ? { ...item, url: String($event || '') }
                      : item),
                  })"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <!-- Competitors / References -->
        <div
          v-else-if="tab === 'competitors'"
          class="space-y-4"
        >
          <Card>
            <CardContent class="space-y-4 p-6">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-sm font-medium">
                    Concorrentes
                  </p>
                  <p class="text-xs text-muted-foreground">
                    Persistidos em `competitors` (JSONB).
                  </p>
                </div>
                <Button
                  v-if="canManage"
                  type="button"
                  size="sm"
                  variant="outline"
                  @click="patch({ competitors: [...guide.competitors, newBrandCompetitor()] })"
                >
                  <Icon
                    name="lucide:plus"
                    class="mr-1.5 h-4 w-4"
                  />
                  Concorrente
                </Button>
              </div>

              <div
                v-if="!guide.competitors.length"
                class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground"
              >
                Nenhum concorrente cadastrado.
              </div>

              <div
                v-for="(item, index) in guide.competitors"
                :key="item.id"
                class="space-y-2 rounded-lg border p-4"
              >
                <div class="flex gap-2">
                  <Input
                    :model-value="item.name"
                    placeholder="Nome"
                    class="flex-1"
                    :disabled="!canManage"
                    @update:model-value="patch({
                      competitors: guide.competitors.map((row, i) => i === index
                        ? { ...row, name: String($event || '') }
                        : row),
                    })"
                  />
                  <Button
                    v-if="canManage"
                    type="button"
                    size="icon"
                    variant="ghost"
                    @click="patch({ competitors: guide.competitors.filter((_, i) => i !== index) })"
                  >
                    <Icon
                      name="lucide:trash-2"
                      class="h-4 w-4"
                    />
                  </Button>
                </div>
                <Input
                  :model-value="item.url"
                  placeholder="URL"
                  :disabled="!canManage"
                  @update:model-value="patch({
                    competitors: guide.competitors.map((row, i) => i === index
                      ? { ...row, url: String($event || '') }
                      : row),
                  })"
                />
                <div class="grid gap-2 sm:grid-cols-2">
                  <Textarea
                    :model-value="item.strengths"
                    rows="2"
                    placeholder="Pontos fortes"
                    :disabled="!canManage"
                    @update:model-value="patch({
                      competitors: guide.competitors.map((row, i) => i === index
                        ? { ...row, strengths: String($event || '') }
                        : row),
                    })"
                  />
                  <Textarea
                    :model-value="item.weaknesses"
                    rows="2"
                    placeholder="Pontos fracos"
                    :disabled="!canManage"
                    @update:model-value="patch({
                      competitors: guide.competitors.map((row, i) => i === index
                        ? { ...row, weaknesses: String($event || '') }
                        : row),
                    })"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent class="space-y-4 p-6">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-sm font-medium">
                    Referências
                  </p>
                  <p class="text-xs text-muted-foreground">
                    Separadas dos concorrentes em `metadata.references`.
                  </p>
                </div>
                <Button
                  v-if="canManage"
                  type="button"
                  size="sm"
                  variant="outline"
                  @click="patchMetadata({
                    references: [...(guide.metadata.references || []), newBrandReference()],
                  })"
                >
                  <Icon
                    name="lucide:plus"
                    class="mr-1.5 h-4 w-4"
                  />
                  Referência
                </Button>
              </div>

              <div
                v-if="!(guide.metadata.references || []).length"
                class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground"
              >
                Nenhuma referência cadastrada.
              </div>

              <div
                v-for="(item, index) in (guide.metadata.references || [])"
                :key="item.id"
                class="space-y-2 rounded-lg border p-4"
              >
                <div class="flex gap-2">
                  <Input
                    :model-value="item.name"
                    placeholder="Nome"
                    class="flex-1"
                    :disabled="!canManage"
                    @update:model-value="patchMetadata({
                      references: (guide.metadata.references || []).map((row, i) => i === index
                        ? { ...row, name: String($event || '') }
                        : row),
                    })"
                  />
                  <Select
                    :model-value="item.kind"
                    :disabled="!canManage"
                    @update:model-value="patchMetadata({
                      references: (guide.metadata.references || []).map((row, i) => i === index
                        ? { ...row, kind: $event }
                        : row),
                    })"
                  >
                    <SelectTrigger class="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        v-for="kind in refKinds"
                        :key="kind.value"
                        :value="kind.value"
                      >
                        {{ kind.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    v-if="canManage"
                    type="button"
                    size="icon"
                    variant="ghost"
                    @click="patchMetadata({
                      references: (guide.metadata.references || []).filter((_, i) => i !== index),
                    })"
                  >
                    <Icon
                      name="lucide:trash-2"
                      class="h-4 w-4"
                    />
                  </Button>
                </div>
                <Input
                  :model-value="item.url"
                  placeholder="URL"
                  :disabled="!canManage"
                  @update:model-value="patchMetadata({
                    references: (guide.metadata.references || []).map((row, i) => i === index
                      ? { ...row, url: String($event || '') }
                      : row),
                  })"
                />
                <Textarea
                  :model-value="item.notes"
                  rows="2"
                  placeholder="Notas"
                  :disabled="!canManage"
                  @update:model-value="patchMetadata({
                    references: (guide.metadata.references || []).map((row, i) => i === index
                      ? { ...row, notes: String($event || '') }
                      : row),
                  })"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <!-- Restrictions -->
        <div
          v-else-if="tab === 'restrictions'"
          class="space-y-4"
        >
          <Card>
            <CardContent class="space-y-4 p-6">
              <div class="space-y-2">
                <Label>Restrições</Label>
                <Textarea
                  :model-value="guide.restrictions"
                  rows="5"
                  :disabled="!canManage"
                  placeholder="O que a marca não pode fazer ou comunicar…"
                  @update:model-value="patch({ restrictions: String($event || '') })"
                />
              </div>
              <div class="space-y-2">
                <Label>Observações legais</Label>
                <Textarea
                  :model-value="guide.legalNotes"
                  rows="5"
                  :disabled="!canManage"
                  placeholder="Disclaimers, claims regulados, créditos obrigatórios…"
                  @update:model-value="patch({ legalNotes: String($event || '') })"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <!-- Visual Direction -->
        <div
          v-else-if="tab === 'visual'"
          class="space-y-4"
        >
          <BrandVisualDirectionEditor
            :model-value="guide.metadata.visualDirection"
            :reference-assets="guide.visualReferenceAssets"
            :disabled="!canManage"
            @update:model-value="patchMetadata({ visualDirection: $event })"
            @update:reference-assets="patch({ visualReferenceAssets: $event })"
            @change:references="onVisualRefsChange"
          />
        </div>

        <!-- AI preferences -->
        <div
          v-else-if="tab === 'ai'"
          class="space-y-4"
        >
          <BrandAiPreferencesEditor
            :model-value="guide.metadata.aiPreferences"
            :disabled="!canManage"
            @update:model-value="patchMetadata({ aiPreferences: $event })"
          />
        </div>
      </div>
    </div>
  </div>
</template>
