<script setup lang="ts">
import { GANTT_COLOR_MAP } from '~/types'
import { useGanttStore } from '~/stores/gantt'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'collapse'): void
}>()

// Gantt başlık şeridinin yüksekliği (app.vue ölçüp geçer).
// Aşağıdaki eylem şeridi bu yüksekliği alır ki iki ayırıcı çizgi
// aynı hizada dursun.
const props = defineProps<{ headerHeight?: number }>()

const actionBarStyle = computed(() => {
  return props.headerHeight ? { height: `${props.headerHeight}px` } : undefined
})

const store = useGanttStore()

const showNewProjectInput = ref(false)
const newProjectName = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

function startNewProject() {
  showNewProjectInput.value = true
  newProjectName.value = ''
  nextTick(() => {
    inputRef.value?.focus()
  })
}

async function createProject() {
  if (!newProjectName.value.trim()) {
    showNewProjectInput.value = false
    return
  }
  
  await store.createProject({
    name: newProjectName.value.trim(),
    color: store.nextColor
  })
  
  showNewProjectInput.value = false
  newProjectName.value = ''
}

function cancelNewProject() {
  showNewProjectInput.value = false
  newProjectName.value = ''
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    createProject()
  } else if (e.key === 'Escape') {
    cancelNewProject()
  }
}
</script>

<template>
  <div class="w-64 bg-white border-r border-surface-200 flex flex-col h-full">
    <!-- Marka şeridi. Yüksekliği sağdaki üst çubukla (h-14) aynı,
         böylece iki ayırıcı çizgi tek bir hat gibi görünür. -->
    <div class="h-14 shrink-0 px-4 border-b border-surface-200 flex items-center justify-between">
      <div class="flex items-center gap-2 min-w-0">
        <div class="w-8 h-8 shrink-0 bg-surface-900 rounded-lg flex items-center justify-center">
          <Icon name="ph:chart-bar-horizontal-bold" class="w-5 h-5 text-white" />
        </div>
        <div class="min-w-0">
          <h1 class="font-semibold text-surface-900 leading-tight truncate">Umay Gantt</h1>
          <p class="text-[10px] text-surface-400 tracking-wide leading-tight">BUILDER</p>
        </div>
      </div>
      <!-- Close button (Mobile) -->
      <button
        @click="emit('close')"
        class="p-1.5 rounded-lg hover:bg-surface-100 md:hidden shrink-0"
        v-tip="'Kapat'"
        aria-label="Kapat"
      >
        <Icon name="ph:x" class="w-5 h-5 text-surface-500" />
      </button>

      <!-- Paneli kapat (masaüstü). Kapanınca marka ve proje listesi
           üst çubuğa geçer, bu yüzden hiçbir şeye erişim kaybolmaz. -->
      <button
        @click="emit('collapse')"
        class="hidden md:flex p-1.5 rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100 transition-colors shrink-0"
        v-tip="'Paneli kapat  ( ⌘B )'"
        aria-label="Proje panelini kapat"
      >
        <Icon name="ph:sidebar-simple" class="w-4 h-4" />
      </button>
    </div>

    <!-- Eylem şeridi. Yüksekliği gantt başlık şeridinden gelir; ölçü
         henüz yoksa doğal yüksekliğiyle durur. -->
    <div
      class="shrink-0 px-3 border-b border-surface-200 flex items-center"
      :style="actionBarStyle"
    >
      <button
        v-if="!store.isViewOnly"
        @click="startNewProject"
        class="w-full btn-secondary text-sm py-1.5 flex items-center justify-center gap-2"
      >
        <Icon name="ph:plus" class="w-4 h-4" />
        Yeni Proje
      </button>

      <!-- View Only Mode Indicator -->
      <div 
        v-if="store.isViewOnly"
        class="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg border border-amber-200"
      >
        <Icon name="ph:eye" class="w-4 h-4" />
        <span class="text-xs font-medium">Görüntüleme Modu</span>
      </div>
    </div>
    
    <!-- Project List -->
    <div class="flex-1 overflow-y-auto scrollbar-thin p-2">
      <!-- New Project Input -->
      <div v-if="showNewProjectInput" class="mb-2 p-2 bg-surface-50 rounded-lg">
        <input
          ref="inputRef"
          v-model="newProjectName"
          @keydown="handleKeydown"
          @blur="createProject"
          type="text"
          placeholder="Proje adı..."
          class="input text-sm"
        />
      </div>
      
      <!-- Projects -->
      <div class="space-y-1">
        <div
          v-for="project in store.projects"
          :key="project.id"
          class="relative group"
        >
          <button
            @click="store.selectProject(project.id)"
            class="w-full p-3 rounded-lg text-left transition-all duration-150 pr-10"
            :class="[
              store.currentProjectId === project.id
                ? 'bg-surface-100'
                : 'hover:bg-surface-50'
            ]"
          >
            <div class="flex items-center gap-3">
              <div 
                class="w-3 h-3 rounded-full shrink-0"
                :style="{ backgroundColor: GANTT_COLOR_MAP[project.color] }"
              />
              <span class="text-sm font-medium text-surface-800 truncate">
                {{ project.name }}
              </span>
            </div>
            
            <div v-if="project.description" class="mt-1 ml-6 text-xs text-surface-500 truncate">
              {{ project.description }}
            </div>
          </button>
          
          <!-- Edit Button (only in edit mode) -->
          <button
            v-if="!store.isViewOnly"
            @click.stop="store.openModal('project', { projectId: project.id })"
            class="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md 
                   opacity-0 group-hover:opacity-100 
                   text-surface-400 hover:text-surface-600 hover:bg-surface-200
                   transition-all duration-150"
            v-tip="'Proje ayarları'"
            aria-label="Proje ayarları"
          >
            <Icon name="ph:gear-six" class="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <!-- Empty State -->
      <div 
        v-if="store.projects.length === 0 && !showNewProjectInput" 
        class="text-center py-8 text-surface-400"
      >
        <Icon name="ph:folder-simple-dashed" class="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p class="text-sm">Henüz proje yok</p>
      </div>
    </div>
    
    <!-- Footer Actions (hidden in view only mode) -->
    <div v-if="!store.isViewOnly" class="p-4 border-t border-surface-200 space-y-2">
      <button
        @click="store.openModal('export')"
        class="w-full btn-ghost text-sm flex items-center gap-2"
      >
        <Icon name="ph:export" class="w-4 h-4" />
        Dışa Aktar
      </button>
      <button
        @click="store.openModal('import')"
        class="w-full btn-ghost text-sm flex items-center gap-2"
      >
        <Icon name="ph:download-simple" class="w-4 h-4" />
        İçe Aktar
      </button>
    </div>
  </div>
</template>

