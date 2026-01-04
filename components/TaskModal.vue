<script setup lang="ts">
import type { GanttColor } from '~/types'
import { GANTT_COLORS, GANTT_COLOR_MAP } from '~/types'
import { useGanttStore } from '~/stores/gantt'

const store = useGanttStore()

const isOpen = computed(() => store.activeModal === 'task')
const isEditing = computed(() => !!store.editingTask)

// Form state
const form = ref({
  name: '',
  description: '',
  notes: '',
  startDate: '',
  endDate: '',
  progress: 0,
  color: 'mint' as GanttColor,
  parentId: '',
  dependencies: [] as string[]
})

// Modal açıldığında form'u doldur
watch(isOpen, (open) => {
  if (open && store.editingTask) {
    const task = store.editingTask
    form.value = {
      name: task.name,
      description: task.description || '',
      notes: task.notes || '',
      startDate: task.startDate,
      endDate: task.endDate,
      progress: task.progress,
      color: task.color,
      parentId: task.parentId || '',
      dependencies: [...task.dependencies]
    }
  } else if (open) {
    // Yeni görev
    const { startDate, endDate } = getDefaultTaskDates()
    form.value = {
      name: '',
      description: '',
      notes: '',
      startDate,
      endDate,
      progress: 0,
      color: store.nextColor,
      parentId: '',
      dependencies: []
    }
  }
})

// Kaydet
async function save() {
  if (!form.value.name.trim()) return
  
  if (isEditing.value && store.editingTaskId) {
    await store.updateTask(store.editingTaskId, {
      name: form.value.name.trim(),
      description: form.value.description.trim() || undefined,
      notes: form.value.notes.trim() || undefined,
      startDate: form.value.startDate,
      endDate: form.value.endDate,
      progress: form.value.progress,
      color: form.value.color,
      dependencies: form.value.dependencies
    })
  } else {
    await store.createTask({
      name: form.value.name.trim(),
      description: form.value.description.trim() || undefined,
      notes: form.value.notes.trim() || undefined,
      startDate: form.value.startDate,
      endDate: form.value.endDate,
      color: form.value.color,
      parentId: form.value.parentId || undefined,
      dependencies: form.value.dependencies
    })
  }
  
  store.closeModal()
}

// Sil
async function deleteTask() {
  if (!store.editingTaskId) return
  
  if (confirm('Bu görevi silmek istediğinizden emin misiniz? Alt görevler de silinecektir.')) {
    await store.deleteTask(store.editingTaskId)
    store.closeModal()
  }
}

// Bağımlılık seçenekleri (kendisi ve alt görevleri hariç)
const dependencyOptions = computed(() => {
  if (!store.editingTaskId) return store.currentTasks
  
  const excludeIds = new Set<string>()
  excludeIds.add(store.editingTaskId)
  
  // Alt görevleri bul
  function findDescendants(parentId: string) {
    store.currentTasks
      .filter(t => t.parentId === parentId)
      .forEach(t => {
        excludeIds.add(t.id)
        findDescendants(t.id)
      })
  }
  findDescendants(store.editingTaskId)
  
  return store.currentTasks.filter(t => !excludeIds.has(t.id))
})

function toggleDependency(taskId: string) {
  const index = form.value.dependencies.indexOf(taskId)
  if (index === -1) {
    form.value.dependencies.push(taskId)
  } else {
    form.value.dependencies.splice(index, 1)
  }
}

// Tarih yardımcıları
import { getDefaultTaskDates } from '~/utils/dates'
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div 
        v-if="isOpen"
        class="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
        @click.self="store.closeModal"
      >
        <Transition
          enter-active-class="transition duration-200 ease-out"
          enter-from-class="opacity-0 scale-95"
          enter-to-class="opacity-100 scale-100"
          leave-active-class="transition duration-150 ease-in"
          leave-from-class="opacity-100 scale-100"
          leave-to-class="opacity-0 scale-95"
        >
          <div 
            v-if="isOpen"
            class="card w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
          >
            <!-- Header -->
            <div class="p-4 border-b border-surface-200 flex items-center justify-between">
              <h3 class="font-semibold text-surface-900">
                {{ isEditing ? 'Görevi Düzenle' : 'Yeni Görev' }}
              </h3>
              <button
                @click="store.closeModal"
                class="p-1 rounded hover:bg-surface-100 text-surface-400 hover:text-surface-600"
              >
                <Icon name="ph:x" class="w-5 h-5" />
              </button>
            </div>
            
            <!-- Body -->
            <div class="flex-1 overflow-y-auto p-4 space-y-4">
              <!-- Name -->
              <div>
                <label class="label">Görev Adı *</label>
                <input
                  v-model="form.name"
                  type="text"
                  class="input"
                  placeholder="Görev adını girin..."
                />
              </div>
              
              <!-- Dates -->
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="label">Başlangıç</label>
                  <input
                    v-model="form.startDate"
                    type="date"
                    class="input"
                  />
                </div>
                <div>
                  <label class="label">Bitiş</label>
                  <input
                    v-model="form.endDate"
                    type="date"
                    class="input"
                  />
                </div>
              </div>
              
              <!-- Progress -->
              <div>
                <label class="label">İlerleme: {{ form.progress }}%</label>
                <input
                  v-model.number="form.progress"
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  class="w-full h-2 bg-surface-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>
              
              <!-- Color -->
              <div>
                <label class="label">Renk</label>
                <ColorPicker v-model="form.color" />
              </div>
              
              <!-- Description -->
              <div>
                <label class="label">Açıklama</label>
                <textarea
                  v-model="form.description"
                  rows="2"
                  class="input resize-none"
                  placeholder="Kısa açıklama..."
                />
              </div>
              
              <!-- Notes -->
              <div>
                <label class="label">Notlar</label>
                <textarea
                  v-model="form.notes"
                  rows="3"
                  class="input resize-none"
                  placeholder="Ek notlar, detaylar..."
                />
              </div>
              
              <!-- Dependencies -->
              <div v-if="dependencyOptions.length > 0">
                <label class="label">Bağımlılıklar</label>
                <p class="text-xs text-surface-500 mb-2">
                  Bu görev hangi görevlerin bitmesine bağlı?
                </p>
                <div class="space-y-1 max-h-32 overflow-y-auto">
                  <label
                    v-for="task in dependencyOptions"
                    :key="task.id"
                    class="flex items-center gap-2 p-2 rounded hover:bg-surface-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      :checked="form.dependencies.includes(task.id)"
                      @change="toggleDependency(task.id)"
                      class="rounded border-surface-300 text-surface-600 focus:ring-surface-500"
                    />
                    <div 
                      class="w-2.5 h-2.5 rounded-full"
                      :style="{ backgroundColor: GANTT_COLOR_MAP[task.color] }"
                    />
                    <span class="text-sm text-surface-700">{{ task.name }}</span>
                  </label>
                </div>
              </div>
            </div>
            
            <!-- Footer -->
            <div class="p-4 border-t border-surface-200 flex items-center justify-between">
              <div>
                <button
                  v-if="isEditing"
                  @click="deleteTask"
                  class="text-sm text-red-600 hover:text-red-700"
                >
                  Görevi Sil
                </button>
              </div>
              
              <div class="flex items-center gap-2">
                <button
                  @click="store.closeModal"
                  class="btn-secondary"
                >
                  İptal
                </button>
                <button
                  @click="save"
                  class="btn-primary"
                  :disabled="!form.name.trim()"
                >
                  {{ isEditing ? 'Kaydet' : 'Oluştur' }}
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

