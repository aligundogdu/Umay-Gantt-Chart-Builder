<script setup lang="ts">
import type { GanttColor } from '~/types'
import { getDefaultProjectDates, daysDiff } from '~/utils/dates'
import { useGanttStore } from '~/stores/gantt'

const store = useGanttStore()

const isOpen = computed(() => store.activeModal === 'project')
const isEditing = computed(() => !!store.editingProject)

// Form state
const form = ref({
  name: '',
  description: '',
  startDate: '',
  endDate: '',
  color: 'blue' as GanttColor
})

// Modal açıldığında form'u doldur
watch(isOpen, (open) => {
  if (open && store.editingProject) {
    const project = store.editingProject
    form.value = {
      name: project.name,
      description: project.description || '',
      startDate: project.startDate,
      endDate: project.endDate,
      color: project.color
    }
  } else if (open) {
    // Yeni proje
    const { startDate, endDate } = getDefaultProjectDates()
    form.value = {
      name: '',
      description: '',
      startDate,
      endDate,
      color: 'blue'
    }
  }
})

// Proje tarihleri de görev tarihleri gibi doğrulanır
const dateError = computed(() => {
  if (!form.value.startDate || !form.value.endDate) return 'Başlangıç ve bitiş tarihi zorunlu.'
  if (daysDiff(form.value.startDate, form.value.endDate) < 0) {
    return 'Bitiş tarihi başlangıçtan önce olamaz.'
  }
  return ''
})

const canSave = computed(() => Boolean(form.value.name.trim()) && !dateError.value)

// Kaydet
async function save() {
  if (!canSave.value) return
  
  if (isEditing.value && store.editingProjectId) {
    await store.updateProject(store.editingProjectId, {
      name: form.value.name.trim(),
      description: form.value.description.trim() || undefined,
      startDate: form.value.startDate,
      endDate: form.value.endDate,
      color: form.value.color
    })
  } else {
    await store.createProject({
      name: form.value.name.trim(),
      description: form.value.description.trim() || undefined,
      color: form.value.color
    })
  }
  
  store.closeModal()
}

// Sil
async function deleteProject() {
  if (!store.editingProjectId) return
  
  if (confirm('Bu projeyi ve tüm görevlerini silmek istediğinizden emin misiniz?')) {
    await store.deleteProject(store.editingProjectId)
    store.closeModal()
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
          class="pointer-events-auto bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col"
          @click.stop
        >
          <!-- Header -->
          <div class="px-6 py-4 border-b border-surface-200 flex items-center justify-between bg-surface-50">
            <h3 class="text-lg font-semibold text-surface-900">
              {{ isEditing ? 'Proje Ayarları' : 'Yeni Proje' }}
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
          <div class="p-6 space-y-5 bg-white">
            <!-- Name -->
            <div>
              <label class="block text-sm font-medium text-surface-700 mb-2">Proje Adı *</label>
              <input
                v-model="form.name"
                type="text"
                class="w-full px-4 py-2.5 border border-surface-300 rounded-lg focus:ring-2 focus:ring-surface-400 focus:border-transparent bg-white"
                placeholder="Proje adını girin..."
              />
            </div>
            
            <!-- Description -->
            <div>
              <label class="block text-sm font-medium text-surface-700 mb-2">Açıklama</label>
              <textarea
                v-model="form.description"
                rows="2"
                class="w-full px-4 py-2.5 border border-surface-300 rounded-lg focus:ring-2 focus:ring-surface-400 focus:border-transparent bg-white resize-none"
                placeholder="Proje açıklaması..."
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
            </div>
            
            <!-- Color -->
            <div>
              <label class="block text-sm font-medium text-surface-700 mb-2">Renk</label>
              <ColorPicker v-model="form.color" />
            </div>
          </div>
          
          <!-- Footer -->
          <div class="px-6 py-4 border-t border-surface-200 flex items-center justify-between bg-surface-50">
            <div>
              <button
                v-if="isEditing"
                @click="deleteProject"
                class="text-sm text-red-600 hover:text-red-700 font-medium"
              >
                Projeyi Sil
              </button>
            </div>
            
            <div class="flex items-center gap-3">
              <button
                @click="store.closeModal"
                class="px-4 py-2 text-sm font-medium text-surface-700 bg-white border border-surface-300 rounded-lg hover:bg-surface-50 transition-colors"
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
