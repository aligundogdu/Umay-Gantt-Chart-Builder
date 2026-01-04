<script setup lang="ts">
import { useGanttStore } from '~/stores/gantt'
import { useExport } from '~/composables/useExport'

const store = useGanttStore()
const { 
  downloadJSON, 
  parseImportJSON, 
  readFile, 
  exportProjectToMermaid, 
  exportAllToMermaid,
  downloadMermaid,
  copyToClipboard 
} = useExport()

const isExportOpen = computed(() => store.activeModal === 'export')
const isImportOpen = computed(() => store.activeModal === 'import')
const isOpen = computed(() => isExportOpen.value || isImportOpen.value)

// Export state
const mermaidCode = ref('')
const showMermaid = ref(false)
const copySuccess = ref(false)

// Import state
const importError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

// Modal açıldığında reset
watch(isOpen, (open) => {
  if (!open) {
    mermaidCode.value = ''
    showMermaid.value = false
    copySuccess.value = false
    importError.value = ''
  }
})

// Export Functions
async function exportJSON() {
  const { projects, tasks } = await store.getExportData()
  downloadJSON(projects, tasks)
}

async function generateMermaid(allProjects: boolean) {
  const { projects, tasks } = await store.getExportData()
  
  if (allProjects) {
    mermaidCode.value = exportAllToMermaid(projects, tasks)
  } else if (store.currentProject) {
    mermaidCode.value = exportProjectToMermaid(store.currentProject, tasks)
  }
  
  showMermaid.value = true
}

async function copyMermaid() {
  const success = await copyToClipboard(mermaidCode.value)
  if (success) {
    copySuccess.value = true
    setTimeout(() => {
      copySuccess.value = false
    }, 2000)
  }
}

function downloadMermaidFile() {
  downloadMermaid(mermaidCode.value)
}

// Import Functions
function triggerFileInput() {
  fileInput.value?.click()
}

async function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  
  if (!file) return
  
  try {
    const content = await readFile(file)
    const data = parseImportJSON(content)
    
    if (!data) {
      importError.value = 'Geçersiz JSON formatı'
      return
    }
    
    if (confirm(`${data.projects.length} proje ve ${data.tasks.length} görev içe aktarılacak. Mevcut veriler silinecek. Devam etmek istiyor musunuz?`)) {
      await store.importData(data.projects, data.tasks)
      store.closeModal()
    }
  } catch (error) {
    importError.value = 'Dosya okunamadı'
  }
  
  // Reset input
  input.value = ''
}

async function clearAllData() {
  if (confirm('Tüm projeler ve görevler silinecek. Bu işlem geri alınamaz. Devam etmek istiyor musunuz?')) {
    await store.clearAllData()
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
            class="card w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
          >
            <!-- Header -->
            <div class="p-4 border-b border-surface-200 flex items-center justify-between">
              <h3 class="font-semibold text-surface-900">
                {{ isExportOpen ? 'Dışa Aktar' : 'İçe Aktar' }}
              </h3>
              <button
                @click="store.closeModal"
                class="p-1 rounded hover:bg-surface-100 text-surface-400 hover:text-surface-600"
              >
                <Icon name="ph:x" class="w-5 h-5" />
              </button>
            </div>
            
            <!-- Export Content -->
            <div v-if="isExportOpen" class="flex-1 overflow-y-auto p-4 space-y-4">
              <!-- JSON Export -->
              <div class="p-4 border border-surface-200 rounded-lg">
                <div class="flex items-start gap-3">
                  <div class="w-10 h-10 rounded-lg bg-surface-100 flex items-center justify-center shrink-0">
                    <Icon name="ph:file-json" class="w-5 h-5 text-surface-600" />
                  </div>
                  <div class="flex-1">
                    <h4 class="font-medium text-surface-900">JSON Export</h4>
                    <p class="text-sm text-surface-500 mt-1">
                      Tüm projeler ve görevler JSON formatında dışa aktarılır. 
                      Daha sonra içe aktarabilirsiniz.
                    </p>
                    <button
                      @click="exportJSON"
                      class="btn-secondary text-sm mt-3"
                    >
                      <Icon name="ph:download-simple" class="w-4 h-4 mr-1" />
                      JSON İndir
                    </button>
                  </div>
                </div>
              </div>
              
              <!-- Mermaid Export -->
              <div class="p-4 border border-surface-200 rounded-lg">
                <div class="flex items-start gap-3">
                  <div class="w-10 h-10 rounded-lg bg-surface-100 flex items-center justify-center shrink-0">
                    <Icon name="ph:code" class="w-5 h-5 text-surface-600" />
                  </div>
                  <div class="flex-1">
                    <h4 class="font-medium text-surface-900">Mermaid Diagram</h4>
                    <p class="text-sm text-surface-500 mt-1">
                      Gantt chart'ı Mermaid syntax'ına dönüştürün. 
                      Markdown veya dökümantasyonda kullanabilirsiniz.
                    </p>
                    <div class="flex gap-2 mt-3">
                      <button
                        @click="generateMermaid(false)"
                        class="btn-secondary text-sm"
                        :disabled="!store.currentProject"
                      >
                        Aktif Proje
                      </button>
                      <button
                        @click="generateMermaid(true)"
                        class="btn-secondary text-sm"
                      >
                        Tüm Projeler
                      </button>
                    </div>
                  </div>
                </div>
                
                <!-- Mermaid Output -->
                <div v-if="showMermaid" class="mt-4">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-sm font-medium text-surface-600">Mermaid Kodu</span>
                    <div class="flex gap-2">
                      <button
                        @click="copyMermaid"
                        class="text-sm text-surface-600 hover:text-surface-900 flex items-center gap-1"
                      >
                        <Icon :name="copySuccess ? 'ph:check' : 'ph:copy'" class="w-4 h-4" />
                        {{ copySuccess ? 'Kopyalandı!' : 'Kopyala' }}
                      </button>
                      <button
                        @click="downloadMermaidFile"
                        class="text-sm text-surface-600 hover:text-surface-900 flex items-center gap-1"
                      >
                        <Icon name="ph:download-simple" class="w-4 h-4" />
                        İndir
                      </button>
                    </div>
                  </div>
                  <pre class="bg-surface-900 text-surface-100 p-3 rounded-lg text-xs overflow-x-auto max-h-48 font-mono">{{ mermaidCode }}</pre>
                </div>
              </div>
            </div>
            
            <!-- Import Content -->
            <div v-if="isImportOpen" class="flex-1 overflow-y-auto p-4 space-y-4">
              <!-- File Input (hidden) -->
              <input
                ref="fileInput"
                type="file"
                accept=".json"
                class="hidden"
                @change="handleFileSelect"
              />
              
              <!-- JSON Import -->
              <div class="p-4 border border-surface-200 rounded-lg">
                <div class="flex items-start gap-3">
                  <div class="w-10 h-10 rounded-lg bg-surface-100 flex items-center justify-center shrink-0">
                    <Icon name="ph:upload-simple" class="w-5 h-5 text-surface-600" />
                  </div>
                  <div class="flex-1">
                    <h4 class="font-medium text-surface-900">JSON İçe Aktar</h4>
                    <p class="text-sm text-surface-500 mt-1">
                      Daha önce dışa aktarılmış bir JSON dosyasını yükleyin.
                      <strong class="text-surface-700">Dikkat:</strong> Mevcut veriler silinecektir.
                    </p>
                    <button
                      @click="triggerFileInput"
                      class="btn-secondary text-sm mt-3"
                    >
                      <Icon name="ph:file-arrow-up" class="w-4 h-4 mr-1" />
                      Dosya Seç
                    </button>
                    
                    <p v-if="importError" class="text-sm text-red-600 mt-2">
                      {{ importError }}
                    </p>
                  </div>
                </div>
              </div>
              
              <!-- Clear Data -->
              <div class="p-4 border border-red-200 rounded-lg bg-red-50">
                <div class="flex items-start gap-3">
                  <div class="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                    <Icon name="ph:trash" class="w-5 h-5 text-red-600" />
                  </div>
                  <div class="flex-1">
                    <h4 class="font-medium text-red-900">Tüm Verileri Sil</h4>
                    <p class="text-sm text-red-700 mt-1">
                      Tüm projeler ve görevler kalıcı olarak silinir. Bu işlem geri alınamaz.
                    </p>
                    <button
                      @click="clearAllData"
                      class="px-3 py-1.5 text-sm font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-100 mt-3"
                    >
                      Tümünü Sil
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Footer -->
            <div class="p-4 border-t border-surface-200">
              <button
                @click="store.closeModal"
                class="btn-secondary w-full"
              >
                Kapat
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

