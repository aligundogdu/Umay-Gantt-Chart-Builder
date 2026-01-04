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
  copyToClipboard,
  generateShareURL
} = useExport()

const isExportOpen = computed(() => store.activeModal === 'export')
const isImportOpen = computed(() => store.activeModal === 'import')
const isOpen = computed(() => isExportOpen.value || isImportOpen.value)

// Export state
const mermaidCode = ref('')
const showMermaid = ref(false)
const copySuccess = ref(false)

// Share state
const shareURL = ref('')
const showShareURL = ref(false)
const shareCopySuccess = ref(false)

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
    shareURL.value = ''
    showShareURL.value = false
    shareCopySuccess.value = false
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

// Share Functions
async function createShareURL() {
  if (!store.currentProject) return
  
  const { tasks } = await store.getExportData()
  const projectTasks = tasks.filter(t => t.projectId === store.currentProjectId)
  
  shareURL.value = generateShareURL(store.currentProject, projectTasks)
  showShareURL.value = true
}

async function copyShareURL() {
  const success = await copyToClipboard(shareURL.value)
  if (success) {
    shareCopySuccess.value = true
    setTimeout(() => {
      shareCopySuccess.value = false
    }, 2000)
  }
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
              {{ isExportOpen ? 'Dışa Aktar' : 'İçe Aktar' }}
            </h3>
            <button
              @click="store.closeModal"
              class="p-2 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <Icon name="ph:x" class="w-5 h-5" />
            </button>
          </div>
          
          <!-- Export Content -->
          <div v-if="isExportOpen" class="flex-1 overflow-y-auto p-6 space-y-4 bg-white">
            <!-- URL Share -->
            <div class="p-4 border border-blue-200 rounded-xl bg-blue-50">
              <div class="flex items-start gap-4">
                <div class="w-12 h-12 rounded-xl bg-white border border-blue-200 flex items-center justify-center shrink-0">
                  <Icon name="ph:share-network" class="w-6 h-6 text-blue-600" />
                </div>
                <div class="flex-1">
                  <h4 class="font-semibold text-gray-900">URL ile Paylaş</h4>
                  <p class="text-sm text-gray-500 mt-1">
                    Aktif projeyi URL olarak paylaşın. 
                    Alıcı linki açtığında proje otomatik yüklenecektir.
                  </p>
                  <button
                    @click="createShareURL"
                    class="mt-3 px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-blue-600 rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center disabled:opacity-50"
                    :disabled="!store.currentProject"
                  >
                    <Icon name="ph:link" class="w-4 h-4 mr-2" />
                    Paylaşım Linki Oluştur
                  </button>
                </div>
              </div>
              
              <!-- Share URL Output -->
              <div v-if="showShareURL" class="mt-4 pt-4 border-t border-blue-200">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-sm font-medium text-gray-700">Paylaşım Linki</span>
                  <button
                    @click="copyShareURL"
                    class="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
                  >
                    <Icon :name="shareCopySuccess ? 'ph:check' : 'ph:copy'" class="w-4 h-4" />
                    {{ shareCopySuccess ? 'Kopyalandı!' : 'Kopyala' }}
                  </button>
                </div>
                <div class="relative">
                  <input
                    type="text"
                    :value="shareURL"
                    readonly
                    class="w-full px-3 py-2 pr-10 bg-white border border-blue-200 rounded-lg text-sm text-gray-700 font-mono"
                  />
                </div>
                <p class="text-xs text-gray-500 mt-2">
                  <Icon name="ph:info" class="w-3 h-3 inline mr-1" />
                  URL uzunluğu: {{ shareURL.length }} karakter
                </p>
              </div>
            </div>
            
            <!-- JSON Export -->
            <div class="p-4 border border-gray-200 rounded-xl bg-gray-50">
              <div class="flex items-start gap-4">
                <div class="w-12 h-12 rounded-xl bg-white border border-gray-200 flex items-center justify-center shrink-0">
                  <Icon name="ph:file-json" class="w-6 h-6 text-gray-600" />
                </div>
                <div class="flex-1">
                  <h4 class="font-semibold text-gray-900">JSON Export</h4>
                  <p class="text-sm text-gray-500 mt-1">
                    Tüm projeler ve görevler JSON formatında dışa aktarılır. 
                    Daha sonra içe aktarabilirsiniz.
                  </p>
                  <button
                    @click="exportJSON"
                    class="mt-3 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors inline-flex items-center"
                  >
                    <Icon name="ph:download-simple" class="w-4 h-4 mr-2" />
                    JSON İndir
                  </button>
                </div>
              </div>
            </div>
            
            <!-- Mermaid Export -->
            <div class="p-4 border border-gray-200 rounded-xl bg-gray-50">
              <div class="flex items-start gap-4">
                <div class="w-12 h-12 rounded-xl bg-white border border-gray-200 flex items-center justify-center shrink-0">
                  <Icon name="ph:code" class="w-6 h-6 text-gray-600" />
                </div>
                <div class="flex-1">
                  <h4 class="font-semibold text-gray-900">Mermaid Diagram</h4>
                  <p class="text-sm text-gray-500 mt-1">
                    Gantt chart'ı Mermaid syntax'ına dönüştürün. 
                    Markdown veya dökümantasyonda kullanabilirsiniz.
                  </p>
                  <div class="flex gap-2 mt-3">
                    <button
                      @click="generateMermaid(false)"
                      class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                      :disabled="!store.currentProject"
                    >
                      Aktif Proje
                    </button>
                    <button
                      @click="generateMermaid(true)"
                      class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Tüm Projeler
                    </button>
                  </div>
                </div>
              </div>
              
              <!-- Mermaid Output -->
              <div v-if="showMermaid" class="mt-4 pt-4 border-t border-gray-200">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-sm font-medium text-gray-700">Mermaid Kodu</span>
                  <div class="flex gap-3">
                    <button
                      @click="copyMermaid"
                      class="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1 transition-colors"
                    >
                      <Icon :name="copySuccess ? 'ph:check' : 'ph:copy'" class="w-4 h-4" />
                      {{ copySuccess ? 'Kopyalandı!' : 'Kopyala' }}
                    </button>
                    <button
                      @click="downloadMermaidFile"
                      class="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1 transition-colors"
                    >
                      <Icon name="ph:download-simple" class="w-4 h-4" />
                      İndir
                    </button>
                  </div>
                </div>
                <pre class="bg-gray-900 text-gray-100 p-4 rounded-lg text-xs overflow-x-auto max-h-48 font-mono">{{ mermaidCode }}</pre>
              </div>
            </div>
          </div>
          
          <!-- Import Content -->
          <div v-if="isImportOpen" class="flex-1 overflow-y-auto p-6 space-y-4 bg-white">
            <!-- File Input (hidden) -->
            <input
              ref="fileInput"
              type="file"
              accept=".json"
              class="hidden"
              @change="handleFileSelect"
            />
            
            <!-- JSON Import -->
            <div class="p-4 border border-gray-200 rounded-xl bg-gray-50">
              <div class="flex items-start gap-4">
                <div class="w-12 h-12 rounded-xl bg-white border border-gray-200 flex items-center justify-center shrink-0">
                  <Icon name="ph:upload-simple" class="w-6 h-6 text-gray-600" />
                </div>
                <div class="flex-1">
                  <h4 class="font-semibold text-gray-900">JSON İçe Aktar</h4>
                  <p class="text-sm text-gray-500 mt-1">
                    Daha önce dışa aktarılmış bir JSON dosyasını yükleyin.
                    <strong class="text-gray-700">Dikkat:</strong> Mevcut veriler silinecektir.
                  </p>
                  <button
                    @click="triggerFileInput"
                    class="mt-3 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors inline-flex items-center"
                  >
                    <Icon name="ph:file-arrow-up" class="w-4 h-4 mr-2" />
                    Dosya Seç
                  </button>
                  
                  <p v-if="importError" class="text-sm text-red-600 mt-2 font-medium">
                    {{ importError }}
                  </p>
                </div>
              </div>
            </div>
            
            <!-- Clear Data -->
            <div class="p-4 border border-red-200 rounded-xl bg-red-50">
              <div class="flex items-start gap-4">
                <div class="w-12 h-12 rounded-xl bg-white border border-red-200 flex items-center justify-center shrink-0">
                  <Icon name="ph:trash" class="w-6 h-6 text-red-500" />
                </div>
                <div class="flex-1">
                  <h4 class="font-semibold text-red-900">Tüm Verileri Sil</h4>
                  <p class="text-sm text-red-700 mt-1">
                    Tüm projeler ve görevler kalıcı olarak silinir. Bu işlem geri alınamaz.
                  </p>
                  <button
                    @click="clearAllData"
                    class="mt-3 px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    Tümünü Sil
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Footer -->
          <div class="px-6 py-4 border-t border-gray-200 flex justify-end bg-gray-50">
            <button
              @click="store.closeModal"
              class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Kapat
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
