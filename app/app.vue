<script setup lang="ts">
import { useGanttStore } from '~/stores/gantt'
import { useExport } from '~/composables/useExport'
import { STORAGE_KEYS, isEchoOfOwnWrite } from '~/composables/useDatabase'

const store = useGanttStore()
const { checkCurrentURLForShare, clearShareFromURL } = useExport()

const isReady = ref(false)
const shareImportMessage = ref('')
const externalChangeMessage = ref('')

// Mobile sidebar state
const isSidebarOpen = ref(false)

function toggleSidebar() {
  isSidebarOpen.value = !isSidebarOpen.value
}

function closeSidebar() {
  isSidebarOpen.value = false
}

// Proje seçildiğinde sidebar'ı kapat (mobilde)
watch(() => store.currentProjectId, () => {
  if (typeof window !== 'undefined' && window.innerWidth < 768) {
    closeSidebar()
  }
})

// Salt okunur moddan çık ve kullanıcının kendi verisine dön.
// Önceden bu moda girilince çıkış yolu yoktu, adres çubuğunu elle
// temizlemek gerekiyordu.
async function leaveViewOnly() {
  clearShareFromURL()
  await store.exitViewOnly()
  shareImportMessage.value = 'Kendi projelerinize dönüldü'
  setTimeout(() => { shareImportMessage.value = '' }, 3000)
}

// Escape ile açık modalı kapat
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && store.activeModal) {
    e.preventDefault()
    store.closeModal()
  }
}

// Uyarı mesajını tek bir zamanlayıcıyla göster.
// Üst üste binen setTimeout'lar mesajı erken siliyor veya uzatıyordu.
let externalChangeTimer: ReturnType<typeof setTimeout> | null = null
let externalReloadTimer: ReturnType<typeof setTimeout> | null = null

function showExternalChange(message: string) {
  externalChangeMessage.value = message
  if (externalChangeTimer) clearTimeout(externalChangeTimer)
  externalChangeTimer = setTimeout(() => {
    externalChangeMessage.value = ''
    externalChangeTimer = null
  }, 5000)
}

// Başka bir sekmede veri değiştiyse haber ver.
// İki sekme açıkken biri diğerinin yazdığını sessizce eziyordu.
function onStorage(e: StorageEvent) {
  if (store.isViewOnly) return
  if (e.key !== STORAGE_KEYS.projects && e.key !== STORAGE_KEYS.tasks) return
  // İçerik değişmediyse haber verilecek bir şey yok
  if (e.newValue === e.oldValue) return
  // Kendi yazdığımızın yankısı. İki sekme birbirinin yazmasına yeniden
  // yükleyerek yanıt verince uyarı sonsuza kadar tekrarlanıyordu.
  if (isEchoOfOwnWrite(e.key, e.newValue)) return

  // Düzenleme yarıda kalmasın: modal açıkken sadece bildir
  if (store.activeModal) {
    showExternalChange('Veriler başka bir sekmede değişti. Bu sekmeyi yenileyin.')
    return
  }

  // Projeler ve görevler ayrı anahtarlara yazıldığı için tek bir
  // değişiklik iki olay üretir; ikisi tek yeniden yüklemede toplanır.
  if (externalReloadTimer) clearTimeout(externalReloadTimer)
  externalReloadTimer = setTimeout(() => {
    externalReloadTimer = null
    store.loadProjects()
    showExternalChange('Veriler başka bir sekmede değişti, yeniden yüklendi.')
  }, 150)
}

// Uygulama başladığında projeleri yükle ve URL'den paylaşım kontrolü yap
onMounted(async () => {
  await store.loadProjects()
  
  // URL'de paylaşım verisi var mı kontrol et
  // nextTick ile bekle - DOM tamamen hazır olsun
  await nextTick()
  
  const shareData = checkCurrentURLForShare()
  
  if (shareData) {
    try {
      if (shareData.viewOnly) {
        // ViewOnly modunda geçici olarak göster, kaydetme.
        // Kullanıcının kendi verisi localStorage'da olduğu gibi kalır.
        await store.loadSharedProjectViewOnly(shareData.project, shareData.tasks)
      } else {
        // Normal modda mevcut veriyi silmeden ekle
        await store.importSharedProject(shareData.project, shareData.tasks)
        clearShareFromURL()
      }
      
      // Kullanıcıya bilgi ver
      const modeText = shareData.viewOnly ? ' (Salt Okunur)' : ''
      shareImportMessage.value = `"${shareData.project.name}" projesi yüklendi${modeText}`
      setTimeout(() => {
        shareImportMessage.value = ''
      }, 4000)
    } catch (error) {
      console.error('Share import error:', error)
      shareImportMessage.value = 'Paylaşılan proje yüklenirken hata oluştu'
      setTimeout(() => {
        shareImportMessage.value = ''
      }, 4000)
    }
  }
  
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('storage', onStorage)
  
  isReady.value = true
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('storage', onStorage)
  if (externalChangeTimer) clearTimeout(externalChangeTimer)
  if (externalReloadTimer) clearTimeout(externalReloadTimer)
})
</script>

<template>
  <!-- Loading Screen -->
  <div v-if="!isReady" class="h-screen flex items-center justify-center bg-surface-50">
    <div class="text-center">
      <div class="w-12 h-12 border-4 border-surface-200 border-t-surface-600 rounded-full animate-spin mx-auto mb-4" />
      <p class="text-surface-500 text-sm">Yükleniyor...</p>
    </div>
  </div>

  <div v-else class="h-screen flex bg-surface-50">
    <!-- Mobile Sidebar Overlay -->
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div 
        v-if="isSidebarOpen"
        class="fixed inset-0 bg-black/50 z-40 md:hidden"
        @click="closeSidebar"
      />
    </Transition>
    
    <!-- Sidebar -->
    <aside
      class="fixed md:relative inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 ease-out md:transform-none"
      :class="[
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      ]"
    >
      <ProjectSidebar @close="closeSidebar" />
    </aside>
    
    <!-- Main Content -->
    <main class="flex-1 flex flex-col overflow-hidden w-full">
      <!-- Top Bar -->
      <header class="h-14 bg-white border-b border-surface-200 flex items-center justify-between px-2 md:px-4">
        <div class="flex items-center gap-2 md:gap-4">
          <!-- Hamburger Menu (Mobile) -->
          <button
            @click="toggleSidebar"
            class="p-2 rounded-lg hover:bg-surface-100 md:hidden"
            v-tip="'Projeler'"
            aria-label="Projeler"
          >
            <Icon name="ph:list" class="w-5 h-5 text-surface-600" />
          </button>
          
          <h2 v-if="store.currentProject" class="font-medium text-surface-900 text-sm md:text-base truncate max-w-[120px] md:max-w-none">
            {{ store.currentProject.name }}
          </h2>
          <span v-else class="text-surface-400 text-sm md:text-base">Proje seçin</span>
        </div>
        
        <div class="flex items-center gap-1 md:gap-2">
          <!-- View Mode Toggle -->
          <div class="flex items-center bg-surface-100 rounded-lg p-0.5 md:p-1">
            <button
              v-for="mode in (['month', 'quarter', 'year', '2year', '3year'] as const)"
              :key="mode"
              @click="store.setViewMode(mode)"
              class="px-1.5 md:px-2.5 py-1 text-[10px] md:text-xs font-medium rounded-md transition-all"
              :class="[
                store.viewMode === mode
                  ? 'bg-white text-surface-900 shadow-sm'
                  : 'text-surface-500 hover:text-surface-700'
              ]"
            >
              <!-- Mobile: Short labels -->
              <span class="md:hidden">
                {{ 
                  mode === 'month' ? 'A' : 
                  mode === 'quarter' ? 'Ç' : 
                  mode === 'year' ? '1Y' :
                  mode === '2year' ? '2Y' : '3Y'
                }}
              </span>
              <!-- Desktop: Full labels -->
              <span class="hidden md:inline">
                {{ 
                  mode === 'month' ? 'Ay' : 
                  mode === 'quarter' ? 'Çeyrek' : 
                  mode === 'year' ? '1 Yıl' :
                  mode === '2year' ? '2 Yıl' : '3 Yıl'
                }}
              </span>
            </button>
          </div>
          
          <!-- Timeline Navigation -->
          <div class="flex items-center">
            <button
              @click="store.scrollTimeline('prev')"
              class="btn-ghost p-1.5 md:p-2"
              v-tip="'Zaman çizelgesini geriye kaydır'"
              aria-label="Geriye kaydır"
            >
              <Icon name="ph:caret-left" class="w-4 h-4" />
            </button>
            <button
              @click="store.scrollTimeline('next')"
              class="btn-ghost p-1.5 md:p-2"
              v-tip="'Zaman çizelgesini ileri kaydır'"
              aria-label="İleri kaydır"
            >
              <Icon name="ph:caret-right" class="w-4 h-4" />
            </button>
          </div>
          
          <!-- Project Actions -->
          <template v-if="store.currentProject && !store.isViewOnly">
            <div class="hidden md:block w-px h-6 bg-surface-200 mx-2" />
            
            <button
              @click="store.openModal('project', { projectId: store.currentProjectId! })"
              class="btn-ghost p-1.5 md:p-2"
              v-tip="'Proje ayarları'"
              aria-label="Proje ayarları"
            >
              <Icon name="ph:gear" class="w-4 h-4" />
            </button>
          </template>
          
          <!-- View Only Badge -->
          <div
            v-if="store.isViewOnly"
            class="flex items-center gap-1 md:gap-2 ml-1 md:ml-2"
          >
            <div class="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1 md:py-1.5 bg-amber-100 text-amber-700 rounded-lg">
              <Icon name="ph:eye" class="w-3 h-3 md:w-4 md:h-4" />
              <span class="hidden md:inline text-xs font-medium">Salt Okunur</span>
            </div>
            <button
              @click="leaveViewOnly"
              class="px-2 md:px-3 py-1 md:py-1.5 text-xs font-medium text-surface-600 hover:text-surface-900 border border-surface-300 rounded-lg hover:bg-surface-100 transition-colors"
              v-tip="store.hasOwnData ? 'Kendi projelerine dön' : 'Görüntüleme modundan çık'"
            >
              <Icon name="ph:sign-out" class="w-3.5 h-3.5 md:hidden" />
              <span class="hidden md:inline">
                {{ store.hasOwnData ? 'Projelerime Dön' : 'Moddan Çık' }}
              </span>
            </button>
          </div>
        </div>
      </header>
      
      <!-- Gantt Chart Area -->
      <div class="flex-1 overflow-hidden">
        <GanttChart v-if="store.currentProject" />
        
        <!-- Empty State -->
        <div 
          v-else 
          class="h-full flex items-center justify-center text-surface-400"
        >
          <div class="text-center">
            <Icon name="ph:chart-bar-horizontal" class="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p class="text-lg mb-2">Umay Gantt Builder</p>
            <p class="text-sm">Başlamak için bir proje seçin veya oluşturun</p>
          </div>
        </div>
      </div>
    </main>
    
    <!-- Modals -->
    <TaskModal />
    <ProjectModal />
    <ImportExportModal />
    
    <!-- Depolama hatası (kota dolması gibi) -->
    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="translate-y-4 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-4 opacity-0"
    >
      <div
        v-if="store.errorMessage"
        class="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 bg-red-600 text-white rounded-xl shadow-lg flex items-center gap-3 max-w-[90vw]"
        role="alert"
      >
        <Icon name="ph:warning-circle" class="w-5 h-5 shrink-0" />
        <span class="text-sm font-medium">{{ store.errorMessage }}</span>
        <button
          @click="store.clearError()"
          class="p-1 rounded hover:bg-white/20 shrink-0"
          v-tip="'Kapat'"
          aria-label="Kapat"
        >
          <Icon name="ph:x" class="w-4 h-4" />
        </button>
      </div>
    </Transition>

    <!-- Başka sekmede değişiklik -->
    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="translate-y-4 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-4 opacity-0"
    >
      <div
        v-if="externalChangeMessage"
        class="fixed bottom-20 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 bg-surface-800 text-white rounded-xl shadow-lg flex items-center gap-3 max-w-[90vw]"
        role="status"
      >
        <Icon name="ph:arrows-clockwise" class="w-5 h-5 shrink-0" />
        <span class="text-sm font-medium">{{ externalChangeMessage }}</span>
      </div>
    </Transition>

    <!-- Share Import Notification -->
    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="translate-y-4 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-4 opacity-0"
    >
      <div 
        v-if="shareImportMessage"
        class="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 bg-green-600 text-white rounded-xl shadow-lg flex items-center gap-3"
      >
        <Icon name="ph:check-circle" class="w-5 h-5" />
        <span class="text-sm font-medium">{{ shareImportMessage }}</span>
      </div>
    </Transition>
  </div>
</template>
