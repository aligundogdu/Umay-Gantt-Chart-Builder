<script setup lang="ts">
import { useGanttStore } from '~/stores/gantt'
import { useExport } from '~/composables/useExport'

const store = useGanttStore()
const { checkCurrentURLForShare, clearShareFromURL } = useExport()

const isReady = ref(false)
const shareImportMessage = ref('')

// Uygulama başladığında projeleri yükle ve URL'den paylaşım kontrolü yap
onMounted(async () => {
  await store.loadProjects()
  
  // URL'de paylaşım verisi var mı kontrol et
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
    <!-- Sidebar -->
    <ProjectSidebar />
    
    <!-- Main Content -->
    <main class="flex-1 flex flex-col overflow-hidden">
      <!-- Top Bar -->
      <header class="h-14 bg-white border-b border-surface-200 flex items-center justify-between px-4">
        <div class="flex items-center gap-4">
          <h2 v-if="store.currentProject" class="font-medium text-surface-900">
            {{ store.currentProject.name }}
          </h2>
          <span v-else class="text-surface-400">Proje seçin</span>
        </div>
        
        <div class="flex items-center gap-2">
          <!-- View Mode Toggle -->
          <div class="flex items-center bg-surface-100 rounded-lg p-1">
            <button
              v-for="mode in (['month', 'quarter', 'year', '2year', '3year'] as const)"
              :key="mode"
              @click="store.setViewMode(mode)"
              class="px-2.5 py-1 text-xs font-medium rounded-md transition-all"
              :class="[
                store.viewMode === mode
                  ? 'bg-white text-surface-900 shadow-sm'
                  : 'text-surface-500 hover:text-surface-700'
              ]"
            >
              {{ 
                mode === 'month' ? 'Ay' : 
                mode === 'quarter' ? 'Çeyrek' : 
                mode === 'year' ? '1 Yıl' :
                mode === '2year' ? '2 Yıl' : '3 Yıl'
              }}
            </button>
          </div>
          
          <!-- Timeline Navigation -->
          <div class="flex items-center gap-1">
            <button
              @click="store.scrollTimeline('prev')"
              class="btn-ghost p-2"
            >
              <Icon name="ph:caret-left" class="w-4 h-4" />
            </button>
            <button
              @click="store.scrollTimeline('next')"
              class="btn-ghost p-2"
            >
              <Icon name="ph:caret-right" class="w-4 h-4" />
            </button>
          </div>
          
          <!-- Project Actions -->
          <template v-if="store.currentProject && !store.isViewOnly">
            <div class="w-px h-6 bg-surface-200 mx-2" />
            
            <button
              @click="store.openModal('project', { projectId: store.currentProjectId! })"
              class="btn-ghost p-2"
              title="Proje Ayarları"
            >
              <Icon name="ph:gear" class="w-4 h-4" />
            </button>
          </template>
          
          <!-- View Only Badge -->
          <div 
            v-if="store.isViewOnly"
            class="flex items-center gap-2 px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg ml-2"
          >
            <Icon name="ph:eye" class="w-4 h-4" />
            <span class="text-xs font-medium">Salt Okunur</span>
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
