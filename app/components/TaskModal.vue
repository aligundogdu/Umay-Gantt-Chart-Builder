<script setup lang="ts">
import type { GanttColor } from '~/types'
import { GANTT_COLORS, GANTT_COLOR_MAP } from '~/types'
import { useGanttStore } from '~/stores/gantt'
import { getDefaultTaskDates } from '~/utils/dates'

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
  
  try {
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
  } catch (error) {
    console.error('Görev kaydedilirken hata:', error)
    alert('Görev kaydedilemedi. Lütfen tekrar deneyin.')
  }
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
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="fixed inset-0 z-[100]">
      <!-- Backdrop -->
      <div 
        class="fixed inset-0 bg-black/60"
        @click="store.closeModal"
      />
      
      <!-- Modal -->
      <div class="fixed inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div 
          class="pointer-events-auto bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
          @click.stop
        >
          <!-- Header -->
          <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
            <h3 class="text-lg font-semibold text-gray-900">
              {{ isEditing ? 'Görevi Düzenle' : 'Yeni Görev' }}
            </h3>
            <button
              @click="store.closeModal"
              class="p-2 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <Icon name="ph:x" class="w-5 h-5" />
            </button>
          </div>
          
          <!-- Body -->
          <div class="flex-1 overflow-y-auto p-6 space-y-5 bg-white">
            <!-- Name -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Görev Adı *</label>
              <input
                v-model="form.name"
                type="text"
                class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-transparent bg-white"
                placeholder="Görev adını girin..."
              />
            </div>
            
            <!-- Dates -->
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Başlangıç</label>
                <input
                  v-model="form.startDate"
                  type="date"
                  class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-transparent bg-white"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Bitiş</label>
                <input
                  v-model="form.endDate"
                  type="date"
                  class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-transparent bg-white"
                />
              </div>
            </div>
            
            <!-- Progress -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">İlerleme: {{ form.progress }}%</label>
              <input
                v-model.number="form.progress"
                type="range"
                min="0"
                max="100"
                step="5"
                class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-600"
              />
            </div>
            
            <!-- Color -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Renk</label>
              <ColorPicker v-model="form.color" />
            </div>
            
            <!-- Description -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Açıklama</label>
              <textarea
                v-model="form.description"
                rows="2"
                class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-transparent bg-white resize-none"
                placeholder="Kısa açıklama..."
              />
            </div>
            
            <!-- Notes -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Notlar</label>
              <textarea
                v-model="form.notes"
                rows="3"
                class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-transparent bg-white resize-none"
                placeholder="Ek notlar, detaylar..."
              />
            </div>
            
            <!-- Dependencies -->
            <div v-if="dependencyOptions.length > 0">
              <label class="block text-sm font-medium text-gray-700 mb-2">Bağımlılıklar</label>
              <p class="text-xs text-gray-500 mb-2">
                Bu görev hangi görevlerin bitmesine bağlı?
              </p>
              <div class="max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-2 bg-gray-50 space-y-1">
                <label
                  v-for="task in dependencyOptions"
                  :key="task.id"
                  class="flex items-center gap-3 p-2 rounded-lg hover:bg-white cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    :checked="form.dependencies.includes(task.id)"
                    @change="toggleDependency(task.id)"
                    class="w-4 h-4 rounded border-gray-300 text-gray-600 focus:ring-gray-500"
                  />
                  <div 
                    class="w-3 h-3 rounded-full shrink-0"
                    :style="{ backgroundColor: GANTT_COLOR_MAP[task.color] }"
                  />
                  <span class="text-sm text-gray-700">{{ task.name }}</span>
                </label>
              </div>
            </div>
          </div>
          
          <!-- Footer -->
          <div class="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
            <div>
              <button
                v-if="isEditing"
                @click="deleteTask"
                class="text-sm text-red-600 hover:text-red-700 font-medium"
              >
                Görevi Sil
              </button>
            </div>
            
            <div class="flex items-center gap-3">
              <button
                @click="store.closeModal"
                class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                İptal
              </button>
              <button
                @click="save"
                class="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="!form.name.trim()"
              >
                {{ isEditing ? 'Kaydet' : 'Oluştur' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
