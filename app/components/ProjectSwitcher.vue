<script setup lang="ts">
import { GANTT_COLOR_MAP } from '~/types'
import { useGanttStore } from '~/stores/gantt'

// Kenar çubuğu kapalıyken üst çubukta duran marka + proje seçici.
// Kenar çubuğundaki proje listesinin yerini tutar, bu yüzden proje
// oluşturma da burada var: kullanıcı sırf yeni proje açmak için
// paneli geri açmak zorunda kalmasın.

const emit = defineEmits<{
  (e: 'expand'): void
}>()

const store = useGanttStore()

const isOpen = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const showNewProjectInput = ref(false)
const newProjectName = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

const currentColor = computed(() => {
  const project = store.currentProject
  return project ? GANTT_COLOR_MAP[project.color] : GANTT_COLOR_MAP.slate
})

function toggle() {
  isOpen.value = !isOpen.value
  if (!isOpen.value) cancelNewProject()
}

function close() {
  isOpen.value = false
  cancelNewProject()
}

async function selectProject(id: string) {
  await store.selectProject(id)
  close()
}

function startNewProject() {
  showNewProjectInput.value = true
  newProjectName.value = ''
  nextTick(() => inputRef.value?.focus())
}

function cancelNewProject() {
  showNewProjectInput.value = false
  newProjectName.value = ''
}

async function createProject() {
  const name = newProjectName.value.trim()
  if (!name) {
    cancelNewProject()
    return
  }

  await store.createProject({ name, color: store.nextColor })
  cancelNewProject()
  isOpen.value = false
}

function onInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') createProject()
  else if (e.key === 'Escape') cancelNewProject()
}

// Dışarı tıklama ve Escape menüyü kapatır
function onDocumentPointerDown(e: PointerEvent) {
  if (!isOpen.value) return
  const target = e.target as Node | null
  if (target && rootRef.value?.contains(target)) return
  close()
}

function onDocumentKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isOpen.value) {
    e.stopPropagation()
    close()
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  document.addEventListener('keydown', onDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onDocumentKeydown)
})
</script>

<template>
  <div ref="rootRef" class="flex items-center gap-1.5 min-w-0">
    <!-- Marka. Kenar çubuğundaki işaretin aynısı: panel kapansa da
         kimlik ekranda kalır. -->
    <div class="w-8 h-8 shrink-0 bg-surface-900 rounded-lg flex items-center justify-center">
      <Icon name="ph:chart-bar-horizontal-bold" class="w-5 h-5 text-white" />
    </div>

    <!-- Paneli geri aç -->
    <button
      @click="emit('expand')"
      class="p-1.5 rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100 transition-colors shrink-0"
      v-tip="'Proje panelini aç  ( ⌘B )'"
      aria-label="Proje panelini aç"
    >
      <Icon name="ph:sidebar-simple" class="w-4 h-4" />
    </button>

    <!-- Proje seçici -->
    <div class="relative min-w-0">
      <button
        @click="toggle"
        class="flex items-center gap-2 min-w-0 pl-2 pr-1.5 py-1.5 rounded-lg hover:bg-surface-100 transition-colors"
        :aria-expanded="isOpen"
        aria-haspopup="listbox"
      >
        <span
          class="w-2.5 h-2.5 rounded-full shrink-0"
          :style="{ backgroundColor: currentColor }"
        />
        <span class="font-medium text-surface-900 text-sm md:text-base truncate max-w-[160px] lg:max-w-[280px]">
          {{ store.currentProject ? store.currentProject.name : 'Proje seçin' }}
        </span>
        <Icon
          name="ph:caret-down"
          class="w-3.5 h-3.5 text-surface-400 shrink-0 transition-transform"
          :class="isOpen ? 'rotate-180' : ''"
        />
      </button>

      <Transition
        enter-active-class="transition-all duration-150 ease-out"
        enter-from-class="opacity-0 -translate-y-1"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition-all duration-100 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-1"
      >
        <div
          v-if="isOpen"
          class="absolute left-0 top-full mt-1.5 w-72 max-h-[70vh] overflow-y-auto scrollbar-thin card p-1.5 z-50"
          role="listbox"
        >
          <button
            v-for="project in store.projects"
            :key="project.id"
            @click="selectProject(project.id)"
            class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors"
            :class="project.id === store.currentProjectId
              ? 'bg-surface-100 text-surface-900'
              : 'text-surface-700 hover:bg-surface-50'"
            role="option"
            :aria-selected="project.id === store.currentProjectId"
          >
            <span
              class="w-2.5 h-2.5 rounded-full shrink-0"
              :style="{ backgroundColor: GANTT_COLOR_MAP[project.color] }"
            />
            <span class="text-sm truncate flex-1">{{ project.name }}</span>
            <Icon
              v-if="project.id === store.currentProjectId"
              name="ph:check-bold"
              class="w-3 h-3 shrink-0 text-surface-500"
            />
          </button>

          <p v-if="store.projects.length === 0" class="px-2.5 py-3 text-sm text-surface-400 text-center">
            Henüz proje yok
          </p>

          <template v-if="!store.isViewOnly">
            <div class="my-1.5 h-px bg-surface-200" />

            <div v-if="showNewProjectInput" class="p-1">
              <input
                ref="inputRef"
                v-model="newProjectName"
                @keydown="onInputKeydown"
                @blur="createProject"
                type="text"
                placeholder="Proje adı..."
                class="input text-sm py-1.5"
              />
            </div>
            <button
              v-else
              @click="startNewProject"
              class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-surface-600 hover:bg-surface-50 transition-colors"
            >
              <Icon name="ph:plus" class="w-4 h-4 shrink-0" />
              <span class="text-sm">Yeni Proje</span>
            </button>
          </template>
        </div>
      </Transition>
    </div>
  </div>
</template>
