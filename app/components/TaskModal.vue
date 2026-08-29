<script setup lang="ts">
import type { GanttColor, TaskStatus } from '~/types'
import { GANTT_COLORS, GANTT_COLOR_MAP } from '~/types'
import { useGanttStore } from '~/stores/gantt'
import { getDefaultTaskDates, daysDiff, formatDate } from '~/utils/dates'
import { getDependencyOptions, collectDescendantIds, canReparent } from '~/utils/tasks'

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
  dependencies: [] as string[],
  status: 'active' as TaskStatus
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
      dependencies: [...task.dependencies],
      status: task.status || 'active'
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
      dependencies: [],
      status: 'active'
    }
  }
})

// Doğrulama: bitiş tarihi başlangıçtan önce olamaz.
// Eskiden kontrol yoktu, ters aralık negatif bar genişliğine ve
// Mermaid çıktısında geçersiz süreye yol açıyordu.
const dateError = computed(() => {
  if (!form.value.startDate || !form.value.endDate) return 'Başlangıç ve bitiş tarihi zorunlu.'
  if (daysDiff(form.value.startDate, form.value.endDate) < 0) {
    return 'Bitiş tarihi başlangıçtan önce olamaz.'
  }
  return ''
})

const canSave = computed(() => Boolean(form.value.name.trim()) && !dateError.value)

const durationText = computed(() => {
  if (dateError.value) return ''
  const days = daysDiff(form.value.startDate, form.value.endDate) + 1
  return `${days} gün`
})

// Durum seçenekleri birbirini dışlar. Seçili olana tekrar basmak
// görevi devam eder duruma döndürür, ayrı bir "devam ediyor" düğmesi
// koymaya gerek kalmasın diye.
function selectStatus(status: TaskStatus) {
  form.value.status = form.value.status === status ? 'active' : status
  // Bitti işareti ilerlemeyi de tamamlar; listedeki hızlı işaretlemeyle
  // aynı davranış. İptal ilerlemeye dokunmaz: işin ne kadarının yapıldığı
  // bilgisi, iptal geri alındığında da dursun.
  if (form.value.status === 'completed') form.value.progress = 100
}

// Kaydet
async function save() {
  if (!canSave.value) return
  
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
        dependencies: form.value.dependencies,
        status: form.value.status
      })

      // Üst görev ayrı ele alınır: sıra değeri de yeniden hesaplanmalı
      // ve görev kendi alt ağacına taşınamaz.
      await store.setTaskParent(store.editingTaskId, form.value.parentId || undefined)
    } else {
      await store.createTask({
        name: form.value.name.trim(),
        description: form.value.description.trim() || undefined,
        notes: form.value.notes.trim() || undefined,
        startDate: form.value.startDate,
        endDate: form.value.endDate,
        color: form.value.color,
        parentId: form.value.parentId || undefined,
        dependencies: form.value.dependencies,
        progress: form.value.progress,
        status: form.value.status
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

// Bağımlılık seçenekleri: kendisi, alt görevleri ve döngü oluşturacak
// görevler hariç. Önceden yalnızca ilk ikisi eleniyordu, bu yüzden
// A -> B ve B -> A kurulabiliyordu.
const dependencyOptions = computed(() => {
  if (!store.editingTaskId) return store.currentTasks
  return getDependencyOptions(store.currentTasks, store.editingTaskId)
})

// Üst görev seçenekleri: kendisi ve alt ağacı hariç
const parentOptions = computed(() => {
  if (!store.editingTaskId) return store.currentTasks
  const excluded = collectDescendantIds(store.currentTasks, store.editingTaskId)
  return store.currentTasks.filter(
    t => t.id !== store.editingTaskId && !excluded.has(t.id)
  )
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
          <div class="px-6 py-4 border-b border-surface-200 flex items-center justify-between bg-surface-50">
            <h3 class="text-lg font-semibold text-surface-900">
              {{ isEditing ? 'Görevi Düzenle' : 'Yeni Görev' }}
            </h3>
            <button
              @click="store.closeModal"
              class="p-2 rounded-lg hover:bg-surface-200 text-surface-400 hover:text-surface-600 transition-colors"
              v-tip="'Kapat'"
              aria-label="Kapat"
            >
              <Icon name="ph:x" class="w-5 h-5" />
            </button>
          </div>
          
          <!-- Body -->
          <div class="flex-1 overflow-y-auto p-6 space-y-5 bg-white">
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
            <div>
              <div class="grid grid-cols-2 gap-4">
                <div class="form-group">
                  <label class="label">Başlangıç</label>
                  <input
                    v-model="form.startDate"
                    type="date"
                    class="input"
                    :class="{ 'border-red-400': dateError }"
                  />
                </div>
                <div class="form-group">
                  <label class="label">Bitiş</label>
                  <input
                    v-model="form.endDate"
                    type="date"
                    class="input"
                    :class="{ 'border-red-400': dateError }"
                    :min="form.startDate || undefined"
                  />
                </div>
              </div>

              <p v-if="dateError" class="mt-2 text-xs text-red-600 flex items-center gap-1">
                <Icon name="ph:warning-circle" class="w-3.5 h-3.5 shrink-0" />
                {{ dateError }}
              </p>
              <p v-else class="mt-2 text-xs text-surface-500">
                Süre: {{ durationText }}
              </p>
            </div>

            <!-- Üst görev -->
            <div v-if="isEditing && parentOptions.length > 0" class="form-group">
              <label class="label">Üst Görev</label>
              <select v-model="form.parentId" class="input">
                <option value="">Yok (ana görev)</option>
                <option v-for="option in parentOptions" :key="option.id" :value="option.id">
                  {{ option.name }}
                </option>
              </select>
              <p class="mt-1 text-xs text-surface-400">
                Görev kendi alt görevlerinin altına taşınamaz.
              </p>
            </div>
            
            <!-- Durum. Seçili olana tekrar basmak görevi devam eder
                 duruma döndürür. -->
            <div class="space-y-2" role="radiogroup" aria-label="Görev durumu">
              <button
                type="button"
                @click="selectStatus('completed')"
                class="w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left"
                :class="form.status === 'completed'
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-surface-200 bg-surface-50 hover:bg-surface-100'"
                role="radio"
                :aria-checked="form.status === 'completed'"
              >
                <span
                  class="w-5 h-5 rounded-full flex items-center justify-center shrink-0 border"
                  :class="form.status === 'completed'
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : 'border-surface-300 bg-white text-transparent'"
                >
                  <Icon name="ph:check-bold" class="w-3 h-3" />
                </span>
                <span
                  class="text-sm font-medium"
                  :class="form.status === 'completed' ? 'text-emerald-700' : 'text-surface-700'"
                >
                  {{ form.status === 'completed' ? 'Bitti olarak işaretlendi' : 'Bitti olarak işaretle' }}
                </span>
              </button>

              <button
                type="button"
                @click="selectStatus('cancelled')"
                class="w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left"
                :class="form.status === 'cancelled'
                  ? 'border-surface-500 bg-surface-100'
                  : 'border-surface-200 bg-surface-50 hover:bg-surface-100'"
                role="radio"
                :aria-checked="form.status === 'cancelled'"
              >
                <span
                  class="w-5 h-5 rounded-full flex items-center justify-center shrink-0 border"
                  :class="form.status === 'cancelled'
                    ? 'bg-surface-500 border-surface-500 text-white'
                    : 'border-surface-300 bg-white text-transparent'"
                >
                  <Icon name="ph:x-bold" class="w-3 h-3" />
                </span>
                <span
                  class="text-sm font-medium"
                  :class="form.status === 'cancelled' ? 'text-surface-800' : 'text-surface-700'"
                >
                  {{ form.status === 'cancelled' ? 'İptal edildi' : 'İptal edildi olarak işaretle' }}
                </span>
              </button>

              <p v-if="form.status !== 'active'" class="text-xs text-surface-400">
                Görevi tekrar devam eder duruma almak için seçili seçeneğe basın.
              </p>
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
                class="w-full h-2 bg-surface-200 rounded-lg appearance-none cursor-pointer accent-surface-600"
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
              <div class="max-h-32 overflow-y-auto border border-surface-200 rounded-lg p-2 bg-surface-50 space-y-1">
                <label
                  v-for="task in dependencyOptions"
                  :key="task.id"
                  class="flex items-center gap-3 p-2 rounded-lg hover:bg-white cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    :checked="form.dependencies.includes(task.id)"
                    @change="toggleDependency(task.id)"
                    class="w-4 h-4 rounded border-surface-300 text-surface-600 focus:ring-surface-500"
                  />
                  <div 
                    class="w-3 h-3 rounded-full shrink-0"
                    :style="{ backgroundColor: GANTT_COLOR_MAP[task.color] }"
                  />
                  <span class="text-sm text-surface-700">{{ task.name }}</span>
                </label>
              </div>
            </div>
          </div>
          
          <!-- Footer -->
          <div class="px-6 py-4 border-t border-surface-200 flex items-center justify-between bg-surface-50">
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
                class="btn-secondary text-sm"
              >
                İptal
              </button>
              <button
                @click="save"
                class="px-4 py-2 text-sm font-medium text-white bg-surface-900 rounded-lg hover:bg-surface-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="!canSave"
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
