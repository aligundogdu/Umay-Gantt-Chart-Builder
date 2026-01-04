<script setup lang="ts">
import { getMonthsInRange, getMonthName, getYear, isToday, formatDate } from '~/utils/dates'
import { useGanttStore } from '~/stores/gantt'

const store = useGanttStore()

const chartRef = ref<HTMLElement | null>(null)
const taskListWidth = ref(280)

// Timeline ayları
const months = computed(() => getMonthsInRange(store.dateRange))

// Bugün çizgisi pozisyonu
const todayPosition = computed(() => {
  const today = new Date()
  const { start, end } = store.dateRange
  
  if (today < start || today > end) return null
  
  const totalDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  const dayOffset = (today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  
  return (dayOffset / totalDays) * 100
})

// Görev ekleme
async function addTask(parentId?: string) {
  await store.createTask({
    name: 'Yeni Görev',
    parentId
  })
}

// Scroll senkronizasyonu
const headerRef = ref<HTMLElement | null>(null)
const bodyRef = ref<HTMLElement | null>(null)

function syncScroll(e: Event) {
  const target = e.target as HTMLElement
  if (headerRef.value && target === bodyRef.value) {
    headerRef.value.scrollLeft = target.scrollLeft
  }
}
</script>

<template>
  <div ref="chartRef" class="h-full flex flex-col bg-white">
    <!-- Timeline Header -->
    <div class="flex border-b border-surface-200 bg-surface-50">
      <!-- Task List Header -->
      <div 
        class="shrink-0 border-r border-surface-200 p-3 flex items-center justify-between"
        :style="{ width: `${taskListWidth}px` }"
      >
        <span class="text-xs font-medium text-surface-500 uppercase tracking-wide">Görevler</span>
        <button
          @click="addTask()"
          class="p-1 rounded hover:bg-surface-200 text-surface-400 hover:text-surface-600 transition-colors"
          title="Görev Ekle"
        >
          <Icon name="ph:plus" class="w-4 h-4" />
        </button>
      </div>
      
      <!-- Timeline Header -->
      <div ref="headerRef" class="flex-1 overflow-hidden">
        <div class="flex h-12">
          <div
            v-for="(month, index) in months"
            :key="index"
            class="shrink-0 border-r border-surface-200 px-2 py-1"
            :style="{ width: `${100 / months.length}%`, minWidth: '80px' }"
          >
            <div class="text-xs font-medium text-surface-600">
              {{ getMonthName(month, 'long') }}
            </div>
            <div class="text-[10px] text-surface-400">
              {{ getYear(month) }}
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Chart Body -->
    <div 
      ref="bodyRef"
      class="flex-1 overflow-auto scrollbar-thin"
      @scroll="syncScroll"
    >
      <div class="flex min-h-full">
        <!-- Task List -->
        <div 
          class="shrink-0 border-r border-surface-200 bg-white"
          :style="{ width: `${taskListWidth}px` }"
        >
          <GanttRow
            v-for="task in store.flattenedTasks"
            :key="task.id"
            :task="task"
            mode="list"
          />
          
          <!-- Empty State -->
          <div 
            v-if="store.flattenedTasks.length === 0"
            class="p-4 text-center text-surface-400"
          >
            <p class="text-sm mb-2">Henüz görev yok</p>
            <button
              @click="addTask()"
              class="text-sm text-surface-600 hover:text-surface-900 underline"
            >
              İlk görevi ekle
            </button>
          </div>
        </div>
        
        <!-- Timeline Grid -->
        <div class="flex-1 relative" style="min-width: 600px;">
          <!-- Grid Lines -->
          <div class="absolute inset-0 flex pointer-events-none">
            <div
              v-for="(month, index) in months"
              :key="index"
              class="shrink-0 border-r border-surface-100"
              :style="{ width: `${100 / months.length}%` }"
            />
          </div>
          
          <!-- Today Line -->
          <div
            v-if="todayPosition !== null"
            class="absolute top-0 bottom-0 w-px bg-red-400 z-10"
            :style="{ left: `${todayPosition}%` }"
          >
            <div class="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-red-400" />
          </div>
          
          <!-- Gantt Bars -->
          <div class="relative">
            <GanttRow
              v-for="task in store.flattenedTasks"
              :key="task.id"
              :task="task"
              mode="chart"
            />
          </div>
          
          <!-- Dependency Lines -->
          <DependencyLines />
        </div>
      </div>
    </div>
  </div>
</template>

