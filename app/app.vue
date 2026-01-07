<script setup lang="ts">
import { useGanttStore } from '~/stores/gantt'
import { useExport } from '~/composables/useExport'

const store = useGanttStore()
const { checkCurrentURLForShare, clearShareFromURL } = useExport()

const isReady = ref(false)
const shareImportMessage = ref('')

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

// Uygulama başladığında projeleri yükle ve URL'den paylaşım kontrolü yap
onMounted(async () => {
  await store.loadProjects()
  
  // URL'de paylaşım verisi var mı kontrol et
  // nextTick ile bekle - DOM tamamen hazır olsun
  await nextTick()
  
  const shareData = checkCurrentURLForShare()
  
  if (shareData) {
    try {
      // View Only modunu ayarla
      if (shareData.viewOnly) {
        store.setViewOnly(true)
      }
      
      // Paylaşılan projeyi import et (viewOnly modunda import etme, direkt göster)
      if (shareData.viewOnly) {
        // ViewOnly modunda geçici olarak göster, kaydetme
        await store.loadSharedProjectViewOnly(shareData.project, shareData.tasks)
      } else {
        // Normal modda import et
        await store.importSharedProject(shareData.project, shareData.tasks)
        // URL'yi temizle
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
  
  isReady.value = true
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
            >
              <Icon name="ph:caret-left" class="w-4 h-4" />
            </button>
            <button
              @click="store.scrollTimeline('next')"
              class="btn-ghost p-1.5 md:p-2"
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
              title="Proje Ayarları"
            >
              <Icon name="ph:gear" class="w-4 h-4" />
            </button>
          </template>
          
          <!-- View Only Badge -->
          <div 
            v-if="store.isViewOnly"
            class="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1 md:py-1.5 bg-amber-100 text-amber-700 rounded-lg ml-1 md:ml-2"
          >
            <Icon name="ph:eye" class="w-3 h-3 md:w-4 md:h-4" />
            <span class="hidden md:inline text-xs font-medium">Salt Okunur</span>
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
