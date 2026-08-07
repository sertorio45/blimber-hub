<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import ColorPicker from '~/components/crm/config/ColorPicker.vue'
import CrmPageHeader from '~/components/crm/shared/CrmPageHeader.vue'
import Button from '~/components/ui/button/Button.vue'
import Card from '~/components/ui/card/Card.vue'
import CardContent from '~/components/ui/card/CardContent.vue'
import Checkbox from '~/components/ui/checkbox/Checkbox.vue'
import Input from '~/components/ui/input/Input.vue'
import Label from '~/components/ui/label/Label.vue'
import { toast } from '~/components/ui/toast/use-toast'
import { useTenant } from '~/composables/useTenant'

const router = useRouter()
const { tenantId } = useTenant()
const loading = ref(false)

const form = ref({
  name: '',
  description: '',
  is_active: true,
  priority: 0,
})

const defaultStages = ref([
  { key: 'new', label: 'Novo', name: 'Novo', color: '#3b82f6' },
  { key: 'won', label: 'Ganho', name: 'Ganho', color: '#22c55e' },
  { key: 'lost', label: 'Perdido', name: 'Perdido', color: '#ef4444' },
])

interface CustomStage {
  name: string
  color: string
  description?: string
}
const customStages = ref<CustomStage[]>([])

function randomColor() {
  const palette = ['#8b5cf6', '#ec4899', '#f97316', '#eab308', '#14b8a6', '#64748b']
  return palette[Math.floor(Math.random() * palette.length)]
}

function addStage() {
  customStages.value.unshift({ name: '', color: randomColor(), description: '' })
}

function removeStage(idx: number) {
  customStages.value.splice(idx, 1)
}

async function handleSubmit() {
  let currentTenantId = tenantId?.value
  if (!currentTenantId && typeof window !== 'undefined')
    currentTenantId = localStorage.getItem('tenantId')
  if (!currentTenantId) {
    toast({ title: 'Selecione um tenant antes de criar o funil.', variant: 'destructive' })
    return
  }

  const validCustomStages = customStages.value.filter(stage => stage.name && stage.name.trim() && stage.color)
  loading.value = true
  try {
    const data = await $fetch<{ body?: { funnel?: { id?: string } } }>('/api/crm/funnel', {
      method: 'POST',
      body: {
        name: form.value.name,
        description: form.value.description,
        is_active: form.value.is_active,
        priority: form.value.priority,
        tenant_id: currentTenantId,
        customStages: validCustomStages,
      },
    })
    if (!data?.body?.funnel?.id) {
      toast({ title: 'Erro ao criar funil', variant: 'destructive' })
      return
    }
    toast({ title: 'Funil criado com sucesso!' })
    await router.push(`/crm/config/funnel/${data.body.funnel.id}/edit`)
  }
  catch (error: any) {
    toast({
      title: 'Erro ao criar funil',
      description: error?.data?.message || error?.message || 'Tente novamente.',
      variant: 'destructive',
    })
  }
  finally {
    loading.value = false
  }
}

function goBack() {
  router.push('/crm/config/funnel')
}
</script>

<template>
  <div class="w-full flex flex-col items-stretch gap-4">
    <CrmPageHeader
      title="Novo funil"
      description="Defina o funil e as etapas personalizadas."
    >
      <template #actions>
        <Button variant="outline" @click="goBack">
          <Icon name="lucide:arrow-left" class="mr-2 h-4 w-4" />
          Voltar à lista
        </Button>
      </template>
    </CrmPageHeader>

    <Card class="p-6">
      <form class="flex flex-col gap-4" @submit.prevent="handleSubmit">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div class="w-full flex flex-col gap-1 lg:w-64">
            <Label for="funil-name">Nome *</Label>
            <Input id="funil-name" v-model="form.name" placeholder="Nome" required :disabled="loading" />
          </div>
          <div class="w-full flex flex-col gap-1 lg:w-96">
            <Label for="funil-description">Descrição</Label>
            <Input id="funil-description" v-model="form.description" placeholder="Descrição (opcional)" :disabled="loading" />
          </div>
          <Button type="submit" class="lg:ml-auto" :disabled="loading">
            <Icon name="lucide:save" class="mr-2 h-4 w-4" />
            Salvar funil
          </Button>
        </div>

        <div class="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div class="w-full flex flex-col gap-1 sm:w-64">
            <Label for="funil-priority">Prioridade</Label>
            <Input id="funil-priority" v-model="form.priority" type="number" placeholder="0" :disabled="loading" />
            <p class="mt-1 text-xs text-muted-foreground">
              Número maior = maior prioridade
            </p>
          </div>
          <div class="flex items-center space-x-2">
            <Checkbox
              id="funil-active"
              :checked="form.is_active"
              :disabled="loading"
              @update:checked="(checked: boolean) => (form.is_active = checked)"
            />
            <Label for="funil-active" class="text-sm font-medium">
              Funil ativo
            </Label>
          </div>
        </div>

        <CardContent class="mt-2 flex gap-4 overflow-x-auto px-0 pb-2">
          <template v-for="(stage, idx) in [defaultStages[0], ...customStages, ...defaultStages.slice(1)]" :key="('key' in stage && stage.key) || idx">
            <div class="min-w-[260px] flex flex-1 flex-col gap-3 border rounded-lg bg-card p-6">
              <h3 class="mb-2 text-base font-semibold">
                {{ 'label' in stage ? stage.label : 'Estágio personalizado' }}
              </h3>
              <div class="flex flex-col gap-2">
                <Label>Nome *</Label>
                <Input v-if="!('label' in stage)" v-model="stage.name" placeholder="Nome do estágio" required :disabled="loading" />
                <Input v-else :value="stage.name" disabled />
              </div>
              <div v-if="!('label' in stage)" class="flex flex-col gap-2">
                <Label>Cor</Label>
                <div class="flex items-center gap-2">
                  <ColorPicker v-model="stage.color" :disabled="loading" />
                  <span class="font-mono text-xs uppercase text-muted-foreground">{{ stage.color }}</span>
                </div>
              </div>
              <div v-else class="flex flex-col gap-2">
                <Label>Cor</Label>
                <span class="h-8 w-8 rounded-md border" :style="{ backgroundColor: stage.color }" />
              </div>
              <Button
                v-if="!('label' in stage)"
                type="button"
                variant="destructive"
                class="mt-2 w-fit self-end"
                :disabled="loading"
                @click="removeStage(idx - 1)"
              >
                Remover
              </Button>
            </div>
          </template>
          <div class="min-w-[260px] flex flex-1 flex-col items-center justify-center border rounded-lg bg-card p-6 text-center">
            <h3 class="mb-2 text-base font-semibold">
              Adicionar estágios
            </h3>
            <p class="mb-3 text-sm text-muted-foreground">
              Adicione novos estágios ao seu funil
            </p>
            <Button type="button" variant="outline" :disabled="loading" @click="addStage">
              <Icon name="lucide:plus" class="mr-2 h-4 w-4" />
              Adicionar estágio
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  </div>
</template>
