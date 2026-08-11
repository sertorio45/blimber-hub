<script setup lang="ts">
import type {
  BrandGuideLogoAsset,
  BrandVisualDirection,
} from '~/types/brand-guide'
import {
  createEmptyVisualDirection,
  newBrandVisualStyle,
} from '~/utils/brand-guide'
import BrandAssetPicker from '~/components/marketing/brand/BrandAssetPicker.vue'
import BrandTagListEditor from '~/components/marketing/brand/BrandTagListEditor.vue'

const props = defineProps<{
  modelValue: BrandVisualDirection | undefined
  referenceAssets: BrandGuideLogoAsset[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: BrandVisualDirection]
  'update:referenceAssets': [value: BrandGuideLogoAsset[]]
  'change:references': [value: { assetIds: string[], assets: BrandGuideLogoAsset[] }]
}>()

const direction = computed({
  get: () => props.modelValue || createEmptyVisualDirection(),
  set: value => emit('update:modelValue', value),
})

function patch(partial: Partial<BrandVisualDirection>) {
  emit('update:modelValue', { ...direction.value, ...partial })
}

function onReferenceChange(selection: { assetIds: string[], assets: BrandGuideLogoAsset[] }) {
  // Single parent event avoids racing visualReferenceAssetIds vs visualReferenceAssets.
  emit('change:references', selection)
}

function patchPhotography(partial: Partial<BrandVisualDirection['photography']>) {
  patch({ photography: { ...direction.value.photography, ...partial } })
}

function patchComposition(partial: Partial<BrandVisualDirection['composition']>) {
  patch({ composition: { ...direction.value.composition, ...partial } })
}

function patchPeople(partial: Partial<BrandVisualDirection['people']>) {
  patch({ people: { ...direction.value.people, ...partial } })
}

function patchProducts(partial: Partial<BrandVisualDirection['productsInImages']>) {
  patch({ productsInImages: { ...direction.value.productsInImages, ...partial } })
}

const subTabs = [
  { id: 'styles', label: 'Estilos' },
  { id: 'photo', label: 'Fotografia' },
  { id: 'composition', label: 'Composição' },
  { id: 'people', label: 'Pessoas' },
  { id: 'products', label: 'Produtos' },
  { id: 'elements', label: 'Elementos' },
  { id: 'negative', label: 'Proibições' },
  { id: 'refs', label: 'Referências' },
] as const

type SubTab = typeof subTabs[number]['id']
const subTab = ref<SubTab>('styles')
</script>

<template>
  <div class="space-y-4">
    <Card>
      <CardContent class="space-y-4 p-6">
        <div>
          <p class="text-sm font-medium">
            Direção visual
          </p>
          <p class="text-xs text-muted-foreground">
            Estilos, fotografia e restrições visuais para briefings e contexto de IA — sem gerar imagens.
          </p>
        </div>

        <Tabs v-model="subTab">
          <TabsList class="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
            <TabsTrigger
              v-for="item in subTabs"
              :key="item.id"
              :value="item.id"
              class="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              {{ item.label }}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <!-- Styles -->
        <div
          v-if="subTab === 'styles'"
          class="space-y-4"
        >
          <div class="flex items-center justify-between gap-3">
            <p class="text-xs text-muted-foreground">
              Múltiplos estilos / moods permitidos para a marca.
            </p>
            <Button
              v-if="!disabled"
              type="button"
              size="sm"
              variant="outline"
              @click="patch({ styles: [...direction.styles, newBrandVisualStyle()] })"
            >
              <Icon
                name="lucide:plus"
                class="mr-1.5 h-4 w-4"
              />
              Estilo
            </Button>
          </div>

          <div
            v-if="!direction.styles.length"
            class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground"
          >
            Nenhum estilo visual cadastrado.
          </div>

          <div
            v-for="(style, index) in direction.styles"
            :key="style.id"
            class="space-y-2 rounded-lg border p-4"
          >
            <div class="flex gap-2">
              <Input
                :model-value="style.name"
                placeholder="Nome do estilo (ex.: minimal editorial)"
                class="flex-1"
                :disabled="disabled"
                @update:model-value="patch({
                  styles: direction.styles.map((row, i) => i === index
                    ? { ...row, name: String($event || '') }
                    : row),
                })"
              />
              <Button
                v-if="!disabled"
                type="button"
                size="icon"
                variant="ghost"
                @click="patch({ styles: direction.styles.filter((_, i) => i !== index) })"
              >
                <Icon
                  name="lucide:trash-2"
                  class="h-4 w-4"
                />
              </Button>
            </div>
            <Textarea
              :model-value="style.description"
              rows="2"
              placeholder="Descrição do look & feel"
              :disabled="disabled"
              @update:model-value="patch({
                styles: direction.styles.map((row, i) => i === index
                  ? { ...row, description: String($event || '') }
                  : row),
              })"
            />
          </div>
        </div>

        <!-- Photography -->
        <div
          v-else-if="subTab === 'photo'"
          class="space-y-4"
        >
          <div class="space-y-2">
            <Label>Abordagem fotográfica</Label>
            <Textarea
              :model-value="direction.photography.general"
              rows="3"
              placeholder="Tom geral das fotos da marca…"
              :disabled="disabled"
              @update:model-value="patchPhotography({ general: String($event || '') })"
            />
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-2">
              <Label>Iluminação</Label>
              <Textarea
                :model-value="direction.photography.lighting"
                rows="3"
                placeholder="Natural suave, high-key, dramatic…"
                :disabled="disabled"
                @update:model-value="patchPhotography({ lighting: String($event || '') })"
              />
            </div>
            <div class="space-y-2">
              <Label>Enquadramento</Label>
              <Textarea
                :model-value="direction.photography.framing"
                rows="3"
                placeholder="Close, plano médio, wide…"
                :disabled="disabled"
                @update:model-value="patchPhotography({ framing: String($event || '') })"
              />
            </div>
          </div>
          <BrandTagListEditor
            :model-value="direction.photography.environments"
            label="Ambientes"
            hint="Locais / cenários preferidos."
            :disabled="disabled"
            @update:model-value="patchPhotography({ environments: $event })"
          />
        </div>

        <!-- Composition -->
        <div
          v-else-if="subTab === 'composition'"
          class="space-y-4"
        >
          <div class="space-y-2">
            <Label>Notas de composição</Label>
            <Textarea
              :model-value="direction.composition.notes"
              rows="4"
              placeholder="Equilíbrio, espaço negativo, hierarquia visual…"
              :disabled="disabled"
              @update:model-value="patchComposition({ notes: String($event || '') })"
            />
          </div>
          <BrandTagListEditor
            :model-value="direction.composition.rules"
            label="Regras de composição"
            hint="Ex.: regra dos terços, centro limpo, margem generosa."
            :disabled="disabled"
            @update:model-value="patchComposition({ rules: $event })"
          />
        </div>

        <!-- People -->
        <div
          v-else-if="subTab === 'people'"
          class="space-y-4"
        >
          <p class="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
            Direção criativa legítima (contexto de vida, papéis, ambiência). Não use para segmentação discriminatória.
          </p>
          <div class="space-y-2">
            <Label>Direção de pessoas nas imagens</Label>
            <Textarea
              :model-value="direction.people.direction"
              rows="4"
              placeholder="Como pessoas devem aparecer: atitude, interação, cenários de uso…"
              :disabled="disabled"
              @update:model-value="patchPeople({ direction: String($event || '') })"
            />
          </div>
          <BrandTagListEditor
            :model-value="direction.people.contexts"
            label="Contextos"
            hint="Ex.: escritório, esporte, família, vida urbana."
            :disabled="disabled"
            @update:model-value="patchPeople({ contexts: $event })"
          />
          <BrandTagListEditor
            :model-value="direction.people.avoid"
            label="Evitar"
            hint="Poses, clichês ou situações a evitar — sem critérios discriminatórios."
            :disabled="disabled"
            @update:model-value="patchPeople({ avoid: $event })"
          />
        </div>

        <!-- Products in images -->
        <div
          v-else-if="subTab === 'products'"
          class="space-y-4"
        >
          <div class="space-y-2">
            <Label>Direção de produtos</Label>
            <Textarea
              :model-value="direction.productsInImages.direction"
              rows="3"
              placeholder="Como o produto deve aparecer nas imagens…"
              :disabled="disabled"
              @update:model-value="patchProducts({ direction: String($event || '') })"
            />
          </div>
          <div class="space-y-2">
            <Label>Apresentação</Label>
            <Textarea
              :model-value="direction.productsInImages.presentation"
              rows="3"
              placeholder="Packshot, in-use, lifestyle, flat lay…"
              :disabled="disabled"
              @update:model-value="patchProducts({ presentation: String($event || '') })"
            />
          </div>
          <BrandTagListEditor
            :model-value="direction.productsInImages.contexts"
            label="Contextos de uso"
            :disabled="disabled"
            @update:model-value="patchProducts({ contexts: $event })"
          />
        </div>

        <!-- Preferred / forbidden elements -->
        <div
          v-else-if="subTab === 'elements'"
          class="space-y-4"
        >
          <BrandTagListEditor
            :model-value="direction.preferredElements"
            label="Elementos preferidos"
            hint="Motivos, props, texturas, padrões desejados."
            :disabled="disabled"
            @update:model-value="patch({ preferredElements: $event })"
          />
          <BrandTagListEditor
            :model-value="direction.forbiddenElements"
            label="Elementos proibidos"
            hint="Itens que não devem aparecer."
            :disabled="disabled"
            @update:model-value="patch({ forbiddenElements: $event })"
          />
        </div>

        <!-- Negative / disallowed -->
        <div
          v-else-if="subTab === 'negative'"
          class="space-y-4"
        >
          <BrandTagListEditor
            :model-value="direction.disallowedStyles"
            label="Estilos não permitidos"
            hint="Looks que fogem da marca."
            :disabled="disabled"
            @update:model-value="patch({ disallowedStyles: $event })"
          />
          <div class="space-y-2">
            <Label>Negative guidance</Label>
            <Textarea
              :model-value="direction.negativeGuidance"
              rows="5"
              placeholder="O que evitar em composições e gerações futuras (contexto, não execução)…"
              :disabled="disabled"
              @update:model-value="patch({ negativeGuidance: String($event || '') })"
            />
          </div>
        </div>

        <!-- Visual references -->
        <div
          v-else-if="subTab === 'refs'"
          class="space-y-4"
        >
          <BrandAssetPicker
            :asset-ids="direction.visualReferenceAssetIds"
            :assets="referenceAssets"
            :disabled="disabled"
            label="Referências visuais"
            hint="IDs de media_assets — sem duplicar arquivos."
            dialog-title="Selecionar referências visuais"
            dialog-description="Escolha até 12 imagens de referência na biblioteca."
            empty-label="Nenhuma referência visual vinculada."
            :max="12"
            @change="onReferenceChange"
          />
        </div>
      </CardContent>
    </Card>
  </div>
</template>
