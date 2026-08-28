<script setup lang="ts">
import type { NormalizeResult } from '~/utils/tasks'
import { useGanttStore } from '~/stores/gantt'
import { useExport } from '~/composables/useExport'
import { useDatabase } from '~/composables/useDatabase'

const store = useGanttStore()
const { 
  downloadJSON, 
  parseImportJSON, 
  readFile, 
  exportProjectToMermaid, 
  exportAllToMermaid,
  downloadMermaid,
  copyToClipboard,
  generateShareURLInfo,
  exportProjectToText,
  exportProjectToMonthlySummary,
  downloadText
} = useExport()

const isExportOpen = computed(() => store.activeModal === 'export')
const isImportOpen = computed(() => store.activeModal === 'import')
const isOpen = computed(() => isExportOpen.value || isImportOpen.value)

onMounted(refreshBackupInfo)

// Export state
const mermaidCode = ref('')
const showMermaid = ref(false)
const copySuccess = ref(false)

// Text Export state
const textOutput = ref('')
const showTextOutput = ref(false)
const textCopySuccess = ref(false)

// Share state
const shareURL = ref('')
const showShareURL = ref(false)
const shareCopySuccess = ref(false)
const shareViewOnly = ref(false)

// Share uzunluk uyarisi
const shareWarning = ref('')
const shareWarningLevel = ref<'ok' | 'warn' | 'error'>('ok')

// Import state
const importError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const pendingImport = ref<NormalizeResult | null>(null)
const backupInfo = ref<{ savedAt: string; projectCount: number; taskCount: number } | null>(null)

function refreshBackupInfo() {
  backupInfo.value = useDatabase().getBackupInfo()
}

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
    shareViewOnly.value = false
    textOutput.value = ''
    showTextOutput.value = false
    textCopySuccess.value = false
    shareWarning.value = ''
    shareWarningLevel.value = 'ok'
    pendingImport.value = null
  } else {
    refreshBackupInfo()
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

// Text Export Functions
async function generateText(mode: 'detailed' | 'monthly' = 'detailed') {
  if (!store.currentProject) return
  
  const { tasks } = await store.getExportData()
  
  if (mode === 'monthly') {
    textOutput.value = exportProjectToMonthlySummary(store.currentProject, tasks)
  } else {
    textOutput.value = exportProjectToText(store.currentProject, tasks)
  }
  
  showTextOutput.value = true
}

async function copyText() {
  const success = await copyToClipboard(textOutput.value)
  if (success) {
    textCopySuccess.value = true
    setTimeout(() => {
      textCopySuccess.value = false
    }, 2000)
  }
}

function downloadTextFile() {
  downloadText(textOutput.value)
}

// Share Functions
async function createShareURL(viewOnly: boolean = false) {
  if (!store.currentProject) return
  
  shareViewOnly.value = viewOnly
  const { tasks } = await store.getExportData()
  const projectTasks = tasks.filter(t => t.projectId === store.currentProjectId)
  
  const info = generateShareURLInfo(store.currentProject, projectTasks, viewOnly)
  shareURL.value = info.url
  shareWarning.value = info.message
  shareWarningLevel.value = info.level
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
      importError.value = 'Geçersiz JSON formatı. Dosya bu uygulamadan dışa aktarılmış olmalı.'
      return
    }

    if (data.projects.length === 0) {
      importError.value = 'Dosyada okunabilir proje bulunamadı.'
      return
    }

    // Doğrudan uygulamak yerine önce özet gösterilir:
    // kullanıcı birleştirme ile üzerine yazma arasında seçim yapar.
    importError.value = ''
    pendingImport.value = data
  } catch (error) {
    importError.value = 'Dosya okunamadı'
  }

  // Reset input
  input.value = ''
}

// Özet uyarıları: normalizasyonda düzeltilen şeyler
const importNotes = computed(() => {
  const data = pendingImport.value
  if (!data) return []

  const notes: string[] = []
  if (data.droppedProjects > 0) notes.push(`${data.droppedProjects} okunamayan proje atlandı`)
  if (data.droppedTasks > 0) notes.push(`${data.droppedTasks} okunamayan görev atlandı`)
  if (data.orphanTasks > 0) notes.push(`${data.orphanTasks} sahipsiz görev atlandı`)
  if (data.brokenParents > 0) notes.push(`${data.brokenParents} geçersiz üst görev bağlantısı temizlendi`)
  if (data.brokenDependencies > 0) notes.push(`${data.brokenDependencies} geçersiz bağımlılık temizlendi`)
  return notes
})

// Mevcut veriyi koruyarak ekle
async function confirmMerge() {
  const data = pendingImport.value
  if (!data) return
  await store.mergeData(data.projects, data.tasks)
  pendingImport.value = null
  store.closeModal()
}

// Mevcut veriyi değiştir. Öncesinde otomatik yedek alınır.
async function confirmReplace() {
  const data = pendingImport.value
  if (!data) return

  const message = store.projects.length > 0
    ? `Mevcut ${store.projects.length} proje silinecek ve yerine ${data.projects.length} proje gelecek.\n\nSilinmeden önce otomatik yedek alınacak, bu ekrandan geri yükleyebilirsiniz.\n\nDevam edilsin mi?`
    : `${data.projects.length} proje ve ${data.tasks.length} görev içe aktarılacak. Devam edilsin mi?`

  if (confirm(message)) {
    await store.importData(data.projects, data.tasks)
    pendingImport.value = null
    store.closeModal()
  }
}

function cancelImport() {
  pendingImport.value = null
}

// Son otomatik yedeği geri yükle
async function restoreBackup() {
  if (!backupInfo.value) return
  const when = new Date(backupInfo.value.savedAt).toLocaleString('tr-TR')
  if (confirm(`${when} tarihli yedek geri yüklenecek (${backupInfo.value.projectCount} proje). Mevcut veriler bununla değiştirilecek. Devam edilsin mi?`)) {
    await store.restoreBackup()
    store.closeModal()
  }
}

async function clearAllData() {
  if (confirm('Tüm projeler ve görevler silinecek.\n\nSilinmeden önce otomatik yedek alınacak, bu ekrandan geri yükleyebilirsiniz.\n\nDevam edilsin mi?')) {
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
          <div class="px-6 py-4 border-b border-surface-200 flex items-center justify-between bg-surface-50">
            <h3 class="text-lg font-semibold text-surface-900">
              {{ isExportOpen ? 'Dışa Aktar' : 'İçe Aktar' }}
            </h3>
            <button
              @click="store.closeModal"
              class="p-2 rounded-lg hover:bg-surface-200 text-surface-400 hover:text-surface-600 transition-colors"
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
                  <h4 class="font-semibold text-surface-900">URL ile Paylaş</h4>
                  <p class="text-sm text-surface-500 mt-1">
                    Aktif projeyi URL olarak paylaşın. 
                    Alıcı linki açtığında proje otomatik yüklenecektir.
                  </p>
                  <div class="flex flex-wrap gap-2 mt-3">
                    <button
                      @click="createShareURL(false)"
                      class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-blue-600 rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center disabled:opacity-50"
                      :disabled="!store.currentProject"
                    >
                      <Icon name="ph:link" class="w-4 h-4 mr-2" />
                      Düzenlenebilir Link
                    </button>
                    <button
                      @click="createShareURL(true)"
                      class="px-4 py-2 text-sm font-medium text-amber-700 bg-amber-100 border border-amber-300 rounded-lg hover:bg-amber-200 transition-colors inline-flex items-center disabled:opacity-50"
                      :disabled="!store.currentProject"
                    >
                      <Icon name="ph:eye" class="w-4 h-4 mr-2" />
                      Salt Okunur Link
                    </button>
                  </div>
                </div>
              </div>
              
              <!-- Share URL Output -->
              <div v-if="showShareURL" class="mt-4 pt-4 border-t border-blue-200">
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-surface-700">Paylaşım Linki</span>
                    <span 
                      v-if="shareViewOnly"
                      class="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full"
                    >
                      Salt Okunur
                    </span>
                  </div>
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
                    class="w-full px-3 py-2 pr-10 bg-white border border-blue-200 rounded-lg text-sm text-surface-700 font-mono"
                  />
                </div>
                <p class="text-xs text-surface-500 mt-2">
                  <Icon name="ph:info" class="w-3 h-3 inline mr-1" />
                  URL uzunluğu: {{ shareURL.length.toLocaleString('tr-TR') }} karakter
                  <template v-if="shareViewOnly">
                    • Alıcı projeyi sadece görüntüleyebilir
                  </template>
                </p>

                <!-- Uzun linkler bazı sunucularda sessizce kesiliyor -->
                <p
                  v-if="shareWarning"
                  class="text-xs mt-2 p-2 rounded-lg flex items-start gap-1.5"
                  :class="shareWarningLevel === 'error'
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'"
                >
                  <Icon name="ph:warning" class="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{{ shareWarning }}</span>
                </p>
              </div>
            </div>
            
            <!-- JSON Export -->
            <div class="p-4 border border-surface-200 rounded-xl bg-surface-50">
              <div class="flex items-start gap-4">
                <div class="w-12 h-12 rounded-xl bg-white border border-surface-200 flex items-center justify-center shrink-0">
                  <Icon name="ph:file-json" class="w-6 h-6 text-surface-600" />
                </div>
                <div class="flex-1">
                  <h4 class="font-semibold text-surface-900">JSON Export</h4>
                  <p class="text-sm text-surface-500 mt-1">
                    Tüm projeler ve görevler JSON formatında dışa aktarılır. 
                    Daha sonra içe aktarabilirsiniz.
                  </p>
                  <button
                    @click="exportJSON"
                    class="mt-3 px-4 py-2 text-sm font-medium text-surface-700 bg-white border border-surface-300 rounded-lg hover:bg-surface-50 transition-colors inline-flex items-center"
                  >
                    <Icon name="ph:download-simple" class="w-4 h-4 mr-2" />
                    JSON İndir
                  </button>
                </div>
              </div>
            </div>
            
            <!-- Mermaid Export -->
            <div class="p-4 border border-surface-200 rounded-xl bg-surface-50">
              <div class="flex items-start gap-4">
                <div class="w-12 h-12 rounded-xl bg-white border border-surface-200 flex items-center justify-center shrink-0">
                  <Icon name="ph:code" class="w-6 h-6 text-surface-600" />
                </div>
                <div class="flex-1">
                  <h4 class="font-semibold text-surface-900">Mermaid Diagram</h4>
                  <p class="text-sm text-surface-500 mt-1">
                    Gantt chart'ı Mermaid syntax'ına dönüştürün. 
                    Markdown veya dökümantasyonda kullanabilirsiniz.
                  </p>
                  <div class="flex gap-2 mt-3">
                    <button
                      @click="generateMermaid(false)"
                      class="px-4 py-2 text-sm font-medium text-surface-700 bg-white border border-surface-300 rounded-lg hover:bg-surface-50 transition-colors disabled:opacity-50"
                      :disabled="!store.currentProject"
                    >
                      Aktif Proje
                    </button>
                    <button
                      @click="generateMermaid(true)"
                      class="px-4 py-2 text-sm font-medium text-surface-700 bg-white border border-surface-300 rounded-lg hover:bg-surface-50 transition-colors"
                    >
                      Tüm Projeler
                    </button>
                  </div>
                </div>
              </div>
              
              <!-- Mermaid Output -->
              <div v-if="showMermaid" class="mt-4 pt-4 border-t border-surface-200">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-sm font-medium text-surface-700">Mermaid Kodu</span>
                  <div class="flex gap-3">
                    <button
                      @click="copyMermaid"
                      class="text-sm text-surface-600 hover:text-surface-900 flex items-center gap-1 transition-colors"
                    >
                      <Icon :name="copySuccess ? 'ph:check' : 'ph:copy'" class="w-4 h-4" />
                      {{ copySuccess ? 'Kopyalandı!' : 'Kopyala' }}
                    </button>
                    <button
                      @click="downloadMermaidFile"
                      class="text-sm text-surface-600 hover:text-surface-900 flex items-center gap-1 transition-colors"
                    >
                      <Icon name="ph:download-simple" class="w-4 h-4" />
                      İndir
                    </button>
                  </div>
                </div>
                <pre class="bg-surface-900 text-surface-100 p-4 rounded-lg text-xs overflow-x-auto max-h-48 font-mono">{{ mermaidCode }}</pre>
              </div>
            </div>
            
            <!-- Text Export -->
            <div class="p-4 border border-surface-200 rounded-xl bg-surface-50">
              <div class="flex items-start gap-4">
                <div class="w-12 h-12 rounded-xl bg-white border border-surface-200 flex items-center justify-center shrink-0">
                  <Icon name="ph:text-align-left" class="w-6 h-6 text-surface-600" />
                </div>
                <div class="flex-1">
                  <h4 class="font-semibold text-surface-900">Metin Export</h4>
                  <p class="text-sm text-surface-500 mt-1">
                    Görevleri düz metin olarak export edin.
                  </p>
                  <div class="flex flex-wrap gap-2 mt-3">
                    <button
                      @click="generateText('detailed')"
                      class="px-4 py-2 text-sm font-medium text-surface-700 bg-white border border-surface-300 rounded-lg hover:bg-surface-50 transition-colors disabled:opacity-50"
                      :disabled="!store.currentProject"
                    >
                      Tarih Detaylı
                    </button>
                    <button
                      @click="generateText('monthly')"
                      class="px-4 py-2 text-sm font-medium text-surface-700 bg-white border border-surface-300 rounded-lg hover:bg-surface-50 transition-colors disabled:opacity-50"
                      :disabled="!store.currentProject"
                    >
                      Ay Özeti
                    </button>
                  </div>
                </div>
              </div>
              
              <!-- Text Output -->
              <div v-if="showTextOutput" class="mt-4 pt-4 border-t border-surface-200">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-sm font-medium text-surface-700">Metin Çıktısı</span>
                  <div class="flex gap-3">
                    <button
                      @click="copyText"
                      class="text-sm text-surface-600 hover:text-surface-900 flex items-center gap-1 transition-colors"
                    >
                      <Icon :name="textCopySuccess ? 'ph:check' : 'ph:copy'" class="w-4 h-4" />
                      {{ textCopySuccess ? 'Kopyalandı!' : 'Kopyala' }}
                    </button>
                    <button
                      @click="downloadTextFile"
                      class="text-sm text-surface-600 hover:text-surface-900 flex items-center gap-1 transition-colors"
                    >
                      <Icon name="ph:download-simple" class="w-4 h-4" />
                      İndir
                    </button>
                  </div>
                </div>
                <pre class="bg-surface-900 text-surface-100 p-4 rounded-lg text-xs overflow-x-auto max-h-48 font-mono whitespace-pre-wrap">{{ textOutput }}</pre>
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
            <div class="p-4 border border-surface-200 rounded-xl bg-surface-50">
              <div class="flex items-start gap-4">
                <div class="w-12 h-12 rounded-xl bg-white border border-surface-200 flex items-center justify-center shrink-0">
                  <Icon name="ph:upload-simple" class="w-6 h-6 text-surface-600" />
                </div>
                <div class="flex-1 min-w-0">
                  <h4 class="font-semibold text-surface-900">JSON İçe Aktar</h4>
                  <p class="text-sm text-surface-500 mt-1">
                    Daha önce dışa aktarılmış bir JSON dosyasını yükleyin.
                    Eski sürümlerde alınan dışa aktarmalar da desteklenir.
                  </p>

                  <button
                    v-if="!pendingImport"
                    @click="triggerFileInput"
                    class="mt-3 px-4 py-2 text-sm font-medium text-surface-700 bg-white border border-surface-300 rounded-lg hover:bg-surface-50 transition-colors inline-flex items-center"
                  >
                    <Icon name="ph:file-arrow-up" class="w-4 h-4 mr-2" />
                    Dosya Seç
                  </button>

                  <!-- Önizleme: kullanıcı uygulamadan önce ne olacağını görür -->
                  <div v-else class="mt-3 p-3 bg-white border border-surface-200 rounded-lg">
                    <p class="text-sm text-surface-800 font-medium">
                      {{ pendingImport.projects.length }} proje,
                      {{ pendingImport.tasks.length }} görev okundu.
                    </p>

                    <ul v-if="importNotes.length > 0" class="mt-2 space-y-1">
                      <li
                        v-for="note in importNotes"
                        :key="note"
                        class="text-xs text-amber-700 flex items-start gap-1.5"
                      >
                        <Icon name="ph:warning-circle" class="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{{ note }}</span>
                      </li>
                    </ul>

                    <div class="mt-3 flex flex-wrap gap-2">
                      <button
                        @click="confirmMerge"
                        class="px-3 py-2 text-sm font-medium text-white bg-surface-900 rounded-lg hover:bg-surface-800 transition-colors inline-flex items-center"
                      >
                        <Icon name="ph:plus-circle" class="w-4 h-4 mr-1.5" />
                        Mevcuda Ekle
                      </button>
                      <button
                        @click="confirmReplace"
                        class="px-3 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        Üzerine Yaz
                      </button>
                      <button
                        @click="cancelImport"
                        class="px-3 py-2 text-sm font-medium text-surface-600 hover:bg-surface-100 rounded-lg transition-colors"
                      >
                        Vazgeç
                      </button>
                    </div>

                    <p class="mt-2 text-xs text-surface-500">
                      "Mevcuda Ekle" hiçbir şeyi silmez, projeler yeni kimlikle eklenir.
                    </p>
                  </div>

                  <p v-if="importError" class="text-sm text-red-600 mt-2 font-medium">
                    {{ importError }}
                  </p>
                </div>
              </div>
            </div>
            
            <!-- Otomatik yedek -->
            <div v-if="backupInfo" class="p-4 border border-surface-200 rounded-xl bg-surface-50">
              <div class="flex items-start gap-4">
                <div class="w-12 h-12 rounded-xl bg-white border border-surface-200 flex items-center justify-center shrink-0">
                  <Icon name="ph:clock-counter-clockwise" class="w-6 h-6 text-surface-600" />
                </div>
                <div class="flex-1 min-w-0">
                  <h4 class="font-semibold text-surface-900">Son Yedek</h4>
                  <p class="text-sm text-surface-500 mt-1">
                    Üzerine yazan içe aktarma ve tümünü silme işlemlerinden önce
                    otomatik alınır.
                    <br />
                    {{ new Date(backupInfo.savedAt).toLocaleString('tr-TR') }} •
                    {{ backupInfo.projectCount }} proje, {{ backupInfo.taskCount }} görev
                  </p>
                  <button
                    @click="restoreBackup"
                    class="mt-3 px-4 py-2 text-sm font-medium text-surface-700 bg-white border border-surface-300 rounded-lg hover:bg-surface-50 transition-colors inline-flex items-center"
                  >
                    <Icon name="ph:arrow-counter-clockwise" class="w-4 h-4 mr-2" />
                    Yedeği Geri Yükle
                  </button>
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
                    Tüm projeler ve görevler silinir. Silmeden önce otomatik yedek alınır.
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
          <div class="px-6 py-4 border-t border-surface-200 flex justify-end bg-surface-50">
            <button
              @click="store.closeModal"
              class="px-4 py-2 text-sm font-medium text-surface-700 bg-white border border-surface-300 rounded-lg hover:bg-surface-50 transition-colors"
            >
              Kapat
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
