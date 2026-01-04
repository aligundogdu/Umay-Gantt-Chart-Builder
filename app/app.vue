<script setup lang="ts">
import { useGanttStore } from '~/stores/gantt'

const store = useGanttStore()
const isReady = ref(false)

// Uygulama başladığında projeleri yükle
onMounted(async () => {
  await store.loadProjects()
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
          <template v-if="store.currentProject">
            <div class="w-px h-6 bg-surface-200 mx-2" />
            
            <button
              @click="store.openModal('project', { projectId: store.currentProjectId! })"
              class="btn-ghost p-2"
              title="Proje Ayarları"
            >
              <Icon name="ph:gear" class="w-4 h-4" />
            </button>
          </template>
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
  </div>
</template>
