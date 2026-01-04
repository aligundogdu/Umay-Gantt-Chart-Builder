<script setup lang="ts">
import type { GanttColor } from '~/types'
import { getDefaultProjectDates } from '~/utils/dates'
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

// Kaydet
async function save() {
  if (!form.value.name.trim()) return
  
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
            class="card w-full max-w-md overflow-hidden"
          >
            <!-- Header -->
            <div class="p-4 border-b border-surface-200 flex items-center justify-between">
              <h3 class="font-semibold text-surface-900">
                {{ isEditing ? 'Proje Ayarları' : 'Yeni Proje' }}
              </h3>
              <button
                @click="store.closeModal"
                class="p-1 rounded hover:bg-surface-100 text-surface-400 hover:text-surface-600"
              >
                <Icon name="ph:x" class="w-5 h-5" />
              </button>
            </div>
            
            <!-- Body -->
            <div class="p-4 space-y-4">
              <!-- Name -->
              <div>
                <label class="label">Proje Adı *</label>
                <input
                  v-model="form.name"
                  type="text"
                  class="input"
                  placeholder="Proje adını girin..."
                />
              </div>
              
              <!-- Description -->
              <div>
                <label class="label">Açıklama</label>
                <textarea
                  v-model="form.description"
                  rows="2"
                  class="input resize-none"
                  placeholder="Proje açıklaması..."
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
              
              <!-- Color -->
              <div>
                <label class="label">Renk</label>
                <ColorPicker v-model="form.color" />
              </div>
            </div>
            
            <!-- Footer -->
            <div class="p-4 border-t border-surface-200 flex items-center justify-between">
              <div>
                <button
                  v-if="isEditing"
                  @click="deleteProject"
                  class="text-sm text-red-600 hover:text-red-700"
                >
                  Projeyi Sil
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

