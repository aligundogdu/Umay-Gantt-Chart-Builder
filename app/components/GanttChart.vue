<script setup lang="ts">
import { getMonthsInRange, getMonthName, getYear, isToday, formatDate } from '~/utils/dates'
import { useGanttStore } from '~/stores/gantt'

const store = useGanttStore()

const chartRef = ref<HTMLElement | null>(null)
const taskListWidth = ref(280)

// Zoom level (ay başına piksel genişliği)
const zoomLevel = ref(80) // varsayılan 80px per month
const MIN_ZOOM = 40
const MAX_ZOOM = 200
const ZOOM_STEP = 20

function zoomIn() {
  zoomLevel.value = Math.min(MAX_ZOOM, zoomLevel.value + ZOOM_STEP)
}

function zoomOut() {
  zoomLevel.value = Math.max(MIN_ZOOM, zoomLevel.value - ZOOM_STEP)
}

// Timeline ayları
const months = computed(() => getMonthsInRange(store.dateRange))

// Timeline toplam genişliği (piksel)
const timelineWidth = computed(() => months.value.length * zoomLevel.value)

// Yıl grupları (çok yıllık görünüm için)
const yearGroups = computed(() => {
  const groups: { year: number; months: Date[]; width: number }[] = []
  let currentYear: number | null = null
  let currentGroup: { year: number; months: Date[] } | null = null
  
  months.value.forEach((month) => {
    const year = getYear(month)
    if (year !== currentYear) {
      if (currentGroup) {
        groups.push({ ...currentGroup, width: currentGroup.months.length * zoomLevel.value })
      }
      currentGroup = { year, months: [month] }
      currentYear = year
    } else {
      currentGroup?.months.push(month)
    }
  })
  
  if (currentGroup) {
    groups.push({ ...currentGroup, width: currentGroup.months.length * zoomLevel.value })
  }
  
  return groups
})

// Çok yıllık görünüm mü?
const isMultiYearView = computed(() => ['2year', '3year'].includes(store.viewMode))

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
const isSyncing = ref(false)

function syncScrollFromBody(e: Event) {
  if (isSyncing.value) return
  isSyncing.value = true
  const target = e.target as HTMLElement
  if (headerRef.value) {
    headerRef.value.scrollLeft = target.scrollLeft
  }
  requestAnimationFrame(() => { isSyncing.value = false })
}

function syncScrollFromHeader(e: Event) {
  if (isSyncing.value) return
  isSyncing.value = true
  const target = e.target as HTMLElement
  if (bodyRef.value) {
    bodyRef.value.scrollLeft = target.scrollLeft
  }
  requestAnimationFrame(() => { isSyncing.value = false })
}

// Bir task'ın parent'ının son çocuğu mu?
function isLastChildAt(index: number): boolean {
  const task = store.flattenedTasks[index]
  if (!task.parentId) return false
  
  // Sonraki task'lara bak - aynı parent'a sahip başka var mı?
  for (let i = index + 1; i < store.flattenedTasks.length; i++) {
    const nextTask = store.flattenedTasks[i]
    // Eğer level daha düşükse, parent seviyesine çıktık demek
    if (nextTask.level <= task.level - 1) break
    // Aynı parent'a sahip kardeş varsa, bu son değil
    if (nextTask.parentId === task.parentId) return false
  }
  return true
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
        <div class="flex items-center gap-1">
          <!-- Zoom Controls -->
          <button
            @click="zoomOut"
            :disabled="zoomLevel <= MIN_ZOOM"
            class="p-1 rounded hover:bg-surface-200 text-surface-400 hover:text-surface-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Uzaklaştır"
          >
            <Icon name="ph:magnifying-glass-minus" class="w-4 h-4" />
          </button>
          <button
            @click="zoomIn"
            :disabled="zoomLevel >= MAX_ZOOM"
            class="p-1 rounded hover:bg-surface-200 text-surface-400 hover:text-surface-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Yakınlaştır"
          >
            <Icon name="ph:magnifying-glass-plus" class="w-4 h-4" />
          </button>
          <div class="w-px h-4 bg-surface-200 mx-1" />
          <button
            @click="addTask()"
            class="p-1 rounded hover:bg-surface-200 text-surface-400 hover:text-surface-600 transition-colors"
            title="Görev Ekle"
          >
            <Icon name="ph:plus-circle" class="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <!-- Timeline Header -->
      <div ref="headerRef" class="flex-1 overflow-x-auto overflow-y-hidden scrollbar-thin" @scroll="syncScrollFromHeader">
        <div :style="{ width: `${timelineWidth}px`, minWidth: '100%' }">
          <!-- Çok yıllık görünümde yıl satırı -->
          <div v-if="isMultiYearView" class="flex border-b border-surface-200 bg-surface-100">
            <div
              v-for="yearGroup in yearGroups"
              :key="yearGroup.year"
              class="shrink-0 border-r border-surface-300 px-2 py-1 text-center"
              :style="{ width: `${yearGroup.width}px` }"
            >
              <div class="text-sm font-semibold text-surface-700">
                {{ yearGroup.year }}
              </div>
            </div>
          </div>
          
          <!-- Ay satırı -->
          <div class="flex" :class="isMultiYearView ? 'h-8' : 'h-12'">
            <div
              v-for="(month, index) in months"
              :key="index"
              class="shrink-0 border-r border-surface-200 px-1 py-1"
              :class="[
                month.getMonth() === 0 && isMultiYearView ? 'border-l-2 border-l-surface-400' : '',
              ]"
              :style="{ width: `${zoomLevel}px` }"
            >
              <div class="text-xs font-medium text-surface-600 truncate">
                {{ zoomLevel < 60 ? getMonthName(month, 'short').substring(0, 1) : (isMultiYearView ? getMonthName(month, 'short') : getMonthName(month, 'long')) }}
              </div>
              <div v-if="!isMultiYearView && zoomLevel >= 80" class="text-[10px] text-surface-400">
                {{ getYear(month) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Chart Body -->
    <div 
      ref="bodyRef"
      class="flex-1 overflow-auto scrollbar-thin"
      @scroll="syncScrollFromBody"
    >
      <div class="flex min-h-full">
        <!-- Task List -->
        <div 
          class="shrink-0 border-r border-surface-200 bg-white sticky left-0 z-20"
          :style="{ width: `${taskListWidth}px` }"
        >
          <GanttRow
            v-for="(task, index) in store.flattenedTasks"
            :key="task.id"
            :task="task"
            mode="list"
            :is-last-child="isLastChildAt(index)"
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
        <div 
          class="relative"
          :style="{ width: `${timelineWidth}px`, minWidth: '100%' }"
        >
          <!-- Grid Lines -->
          <div class="absolute inset-0 flex pointer-events-none">
            <div
              v-for="(month, index) in months"
              :key="index"
              class="shrink-0 border-r"
              :class="[
                month.getMonth() === 0 && isMultiYearView 
                  ? 'border-r-2 border-surface-300' 
                  : 'border-surface-100'
              ]"
              :style="{ width: `${zoomLevel}px` }"
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

