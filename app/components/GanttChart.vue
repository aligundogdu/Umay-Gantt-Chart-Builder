<script setup lang="ts">
import {
  getMonthsInRange,
  getMonthDaysInRange,
  getMonthName,
  getYear,
  getRangeDays,
  getDatePosition,
  isDateInRange
} from '~/utils/dates'
import { useGanttStore } from '~/stores/gantt'
import { useSettings } from '~/composables/useDatabase'

const store = useGanttStore()

const chartRef = ref<HTMLElement | null>(null)

// Mobil/desktop için varsayılan task list genişliği
const isMobile = ref(false)

// ===== Görev sütunu genişliği =====
// Kullanıcı ayırıcıyı sürükleyerek genişletebilir, seçim ayarlara yazılır.
const MIN_TASK_LIST_WIDTH = 140
const MAX_TASK_LIST_WIDTH = 720
const DEFAULT_TASK_LIST_WIDTH = 280
const MOBILE_TASK_LIST_WIDTH = 180
// Timeline hiç kaybolmasın diye sağ tarafta bırakılan asgari boşluk
const MIN_TIMELINE_WIDTH = 120

const taskListWidth = ref(DEFAULT_TASK_LIST_WIDTH)
const isResizing = ref(false)
let resizeStartX = 0
let resizeStartWidth = 0

// Üst sınır kapsayıcıya göre belirlenir; dar ekranda 720px anlamsız olurdu
function maxTaskListWidth(): number {
  const available = (chartRef.value?.clientWidth || 0) - MIN_TIMELINE_WIDTH
  const upper = available > MIN_TASK_LIST_WIDTH ? available : MIN_TASK_LIST_WIDTH
  return Math.min(MAX_TASK_LIST_WIDTH, upper)
}

function clampTaskListWidth(value: number): number {
  return Math.round(Math.min(maxTaskListWidth(), Math.max(MIN_TASK_LIST_WIDTH, value)))
}

function persistTaskListWidth() {
  useSettings().updateSettings({ taskListWidth: taskListWidth.value })
}

function beginResize(clientX: number) {
  isResizing.value = true
  resizeStartX = clientX
  resizeStartWidth = taskListWidth.value
}

function applyResize(clientX: number) {
  if (!isResizing.value) return
  taskListWidth.value = clampTaskListWidth(resizeStartWidth + (clientX - resizeStartX))
}

function endResize() {
  if (!isResizing.value) return
  isResizing.value = false
  persistTaskListWidth()
}

function onResizeMouseDown(e: MouseEvent) {
  e.preventDefault()
  beginResize(e.clientX)
  document.addEventListener('mousemove', onResizeMouseMove)
  document.addEventListener('mouseup', onResizeMouseUp)
}

function onResizeMouseMove(e: MouseEvent) {
  applyResize(e.clientX)
}

function onResizeMouseUp() {
  document.removeEventListener('mousemove', onResizeMouseMove)
  document.removeEventListener('mouseup', onResizeMouseUp)
  endResize()
}

// Dokunmatikte kaydırmayla karışmasın diye touchmove passive:false bağlanır
const resizeHandleRef = ref<HTMLElement | null>(null)

function onResizeTouchStart(e: TouchEvent) {
  const touch = e.touches[0]
  if (!touch) return
  beginResize(touch.clientX)
}

function onResizeTouchMove(e: TouchEvent) {
  if (!isResizing.value) return
  const touch = e.touches[0]
  if (!touch) return
  e.preventDefault()
  applyResize(touch.clientX)
}

// Klavye ile de ayarlanabilsin (ayırıcı odaklanabilir)
function onResizeKeydown(e: KeyboardEvent) {
  const step = e.shiftKey ? 48 : 16
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    taskListWidth.value = clampTaskListWidth(taskListWidth.value - step)
    persistTaskListWidth()
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    taskListWidth.value = clampTaskListWidth(taskListWidth.value + step)
    persistTaskListWidth()
  }
}

// Çift tıklama varsayılan genişliğe döndürür
function resetTaskListWidth() {
  taskListWidth.value = clampTaskListWidth(
    isMobile.value ? MOBILE_TASK_LIST_WIDTH : DEFAULT_TASK_LIST_WIDTH
  )
  persistTaskListWidth()
}

// Ekran boyutunu izle
onMounted(() => {
  const checkMobile = () => {
    isMobile.value = window.innerWidth < 768
  }
  checkMobile()

  // Kayıtlı genişlik varsa onu kullan, yoksa ekrana göre varsayılan
  const stored = useSettings().getSettings().taskListWidth
  taskListWidth.value = clampTaskListWidth(
    typeof stored === 'number' && Number.isFinite(stored)
      ? stored
      : (isMobile.value ? MOBILE_TASK_LIST_WIDTH : DEFAULT_TASK_LIST_WIDTH)
  )

  const onWindowResize = () => {
    checkMobile()
    // Pencere daralınca sütun timeline'ı ezmesin
    taskListWidth.value = clampTaskListWidth(taskListWidth.value)
  }

  window.addEventListener('resize', onWindowResize)
  resizeHandleRef.value?.addEventListener('touchmove', onResizeTouchMove as EventListener, {
    passive: false
  })

  onUnmounted(() => {
    window.removeEventListener('resize', onWindowResize)
    document.removeEventListener('mousemove', onResizeMouseMove)
    document.removeEventListener('mouseup', onResizeMouseUp)
    resizeHandleRef.value?.removeEventListener('touchmove', onResizeTouchMove as EventListener)
  })
})

// ===== Arama =====
const isSearchOpen = ref(false)
const searchInputRef = ref<HTMLInputElement | null>(null)

async function openSearch() {
  isSearchOpen.value = true
  await nextTick()
  searchInputRef.value?.focus()
}

function closeSearch() {
  isSearchOpen.value = false
  store.clearSearch()
}

// Arama kutusu boşken kapanır, doluyken sadece temizlenir
function onSearchEscape() {
  if (store.searchQuery) {
    store.clearSearch()
    return
  }
  closeSearch()
}

// '/' ile aramayı aç (bir alana yazarken değil)
function onSearchShortcut(e: KeyboardEvent) {
  if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
  const target = e.target as HTMLElement | null
  if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) {
    return
  }
  if (store.activeModal) return
  e.preventDefault()
  openSearch()
}

onMounted(() => {
  window.addEventListener('keydown', onSearchShortcut)
  onUnmounted(() => window.removeEventListener('keydown', onSearchShortcut))
})

// Zoom level (ortalama bir ayın piksel genişliği)
const zoomLevel = ref(80)
const MIN_ZOOM = 40
const MAX_ZOOM = 200
const ZOOM_STEP = 20

// Ortalama ay uzunluğu. Zoom kontrolü kullanıcıya "ay genişliği" olarak
// sunulur ama iç hesap gün başına pikselle yapılır.
const DAYS_PER_MONTH = 30.4375

// Timeline ayları (provide öncesi tanımlanmalı)
const months = computed(() => getMonthsInRange(store.dateRange))

// Aralığın toplam gün sayısı
const rangeDays = computed(() => getRangeDays(store.dateRange))

// Gün başına piksel. Bütün konumlandırmanın tek ölçeği budur.
const pxPerDay = computed(() => zoomLevel.value / DAYS_PER_MONTH)

// Timeline toplam genişliği (piksel)
const timelineWidth = computed(() => rangeDays.value * pxPerDay.value)

// Bir ay sütununun genişliği, o ayın gün sayısıyla orantılıdır.
// Sabit genişlik kullanıldığında Şubat ile Temmuz aynı yer kaplıyor,
// barlar ise gün bazlı konumlandığı için ızgaradan kayıyordu.
function monthWidth(month: Date): number {
  return getMonthDaysInRange(month, store.dateRange) * pxPerDay.value
}

// Alt bileşenlere provide et
provide('timelineWidth', timelineWidth)
provide('pxPerDay', pxPerDay)

function zoomIn() {
  zoomLevel.value = Math.min(MAX_ZOOM, zoomLevel.value + ZOOM_STEP)
}

function zoomOut() {
  zoomLevel.value = Math.max(MIN_ZOOM, zoomLevel.value - ZOOM_STEP)
}

// Yıl grupları (çok yıllık görünüm için)
const yearGroups = computed(() => {
  const groups: { year: number; months: Date[]; width: number }[] = []

  months.value.forEach((month) => {
    const year = getYear(month)
    const last = groups[groups.length - 1]

    if (last && last.year === year) {
      last.months.push(month)
      last.width += monthWidth(month)
    } else {
      groups.push({ year, months: [month], width: monthWidth(month) })
    }
  })

  return groups
})

// Çok yıllık görünüm mü?
const isMultiYearView = computed(() => ['2year', '3year'].includes(store.viewMode))

// Bugün çizgisi pozisyonu (piksel).
// Barlarla aynı ölçekte hesaplanır, yüzde kullanıldığında kapsayıcı
// minWidth yüzünden genişlediğinde çizgi barlardan kayıyordu.
const todayPositionPx = computed(() => {
  const today = new Date()
  if (!isDateInRange(today, store.dateRange)) return null
  return (getDatePosition(today, store.dateRange) / 100) * timelineWidth.value
})

// Görev ekleme
async function addTask(parentId?: string) {
  await store.createTask({
    name: 'Yeni Görev',
    parentId
  })
}

// Drag & Drop State
const draggedTaskId = ref<string | null>(null)
const dropTargetId = ref<string | null>(null)
const dropPosition = ref<'before' | 'after' | null>(null)

function handleTaskDragStart(taskId: string) {
  draggedTaskId.value = taskId
}

function handleTaskDragEnd() {
  draggedTaskId.value = null
  dropTargetId.value = null
  dropPosition.value = null
}

function handleTaskDragOver(taskId: string, position: 'before' | 'after') {
  // Kendisinin üzerine bırakılamaz
  if (taskId === draggedTaskId.value) return
  
  dropTargetId.value = taskId
  dropPosition.value = position
}

async function handleTaskDrop(targetId: string) {
  if (!draggedTaskId.value || !dropPosition.value) return
  if (draggedTaskId.value === targetId) return
  
  await store.reorderTasks(draggedTaskId.value, targetId, dropPosition.value)
  
  draggedTaskId.value = null
  dropTargetId.value = null
  dropPosition.value = null
}

// Mobilde sıralama (sürükle-bırak dokunmatikte çalışmıyor)
async function handleTaskMove(taskId: string, direction: 'up' | 'down') {
  await store.moveTask(taskId, direction)
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
  <div ref="chartRef" class="gantt-chart-container relative h-full flex flex-col bg-white">
    <!-- Timeline Header -->
    <div class="flex border-b border-surface-200 bg-surface-50">
      <!-- Task List Header -->
      <div 
        class="shrink-0 border-r border-surface-200 p-2 md:p-3 flex items-center justify-between gap-1 overflow-hidden"
        :style="{ width: `${taskListWidth}px` }"
      >
        <!-- Arama açıkken başlık ve araçlar yerini arama kutusuna bırakır;
             sütun dar olabildiği için ikisi aynı anda sığmıyor. -->
        <template v-if="isSearchOpen">
          <div class="relative flex-1 min-w-0">
            <Icon
              name="ph:magnifying-glass"
              class="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-400 pointer-events-none"
            />
            <input
              ref="searchInputRef"
              v-model="store.searchQuery"
              type="text"
              placeholder="Görev ara..."
              class="w-full h-7 pl-7 pr-10 text-xs rounded border border-surface-300 bg-white text-surface-800 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-surface-400 focus:border-transparent"
              @keydown.esc.prevent="onSearchEscape"
            />
            <span
              v-if="store.isSearching"
              class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] tabular-nums"
              :class="store.searchResultCount > 0 ? 'text-surface-400' : 'text-red-500'"
            >
              {{ store.searchResultCount }}
            </span>
          </div>
          <button
            @click="closeSearch"
            class="p-1 rounded hover:bg-surface-200 text-surface-400 hover:text-surface-600 transition-colors shrink-0"
            v-tip="'Aramayı kapat'"
            aria-label="Aramayı kapat"
          >
            <Icon name="ph:x" class="w-4 h-4" />
          </button>
        </template>

        <template v-else>
        <span class="text-[10px] md:text-xs font-medium text-surface-500 uppercase tracking-wide truncate">
            {{ store.isDateSorted ? 'Görevler · Tarih' : 'Görevler' }}
          </span>
        <div class="flex items-center gap-0.5 md:gap-1 shrink-0">
          <!-- Arama. '/' kısayolu da açar. -->
          <button
            @click="openSearch"
            class="p-1 rounded hover:bg-surface-200 text-surface-400 hover:text-surface-600 transition-colors"
            v-tip="'Görevlerde ara  ( / )'"
            aria-label="Görevlerde ara"
          >
            <Icon name="ph:magnifying-glass" class="w-4 h-4" />
          </button>
          <!-- Zoom Controls -->
          <button
            @click="zoomOut"
            :disabled="zoomLevel <= MIN_ZOOM"
            class="p-1 rounded hover:bg-surface-200 text-surface-400 hover:text-surface-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            v-tip="'Uzaklaştır'"
            aria-label="Uzaklaştır"
          >
            <Icon name="ph:magnifying-glass-minus" class="w-4 h-4" />
          </button>
          <button
            @click="zoomIn"
            :disabled="zoomLevel >= MAX_ZOOM"
            class="p-1 rounded hover:bg-surface-200 text-surface-400 hover:text-surface-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            v-tip="'Yakınlaştır'"
            aria-label="Yakınlaştır"
          >
            <Icon name="ph:magnifying-glass-plus" class="w-4 h-4" />
          </button>
          <!-- Tarihe göre sıralama geçişi. Veriyi değiştirmez,
               tekrar basıldığında manuel sıra aynen geri gelir. -->
          <button
            @click="store.toggleSortMode()"
            class="p-1 rounded transition-colors"
            :class="store.isDateSorted
              ? 'bg-surface-900 text-white hover:bg-surface-700'
              : 'hover:bg-surface-200 text-surface-400 hover:text-surface-600'"
            v-tip="store.isDateSorted
              ? 'Tarih sıralaması açık - manuel sıraya dön'
              : 'Başlangıç tarihine göre sırala'"
            :aria-pressed="store.isDateSorted"
            aria-label="Tarihe göre sırala"
          >
            <Icon name="ph:sort-ascending" class="w-4 h-4" />
          </button>
          <button
            v-if="!store.isTodayVisible"
            @click="store.goToToday()"
            class="p-1 rounded hover:bg-surface-200 text-surface-400 hover:text-surface-600 transition-colors"
            v-tip="'Bugüne dön'"
            aria-label="Bugüne dön"
          >
            <Icon name="ph:crosshair-simple" class="w-4 h-4" />
          </button>
          <template v-if="!store.isViewOnly">
            <div class="w-px h-4 bg-surface-200 mx-1" />
            <button
              @click="addTask()"
              class="p-1 rounded hover:bg-surface-200 text-surface-400 hover:text-surface-600 transition-colors"
              v-tip="'Görev ekle'"
              aria-label="Görev ekle"
            >
              <Icon name="ph:plus-circle" class="w-4 h-4" />
            </button>
          </template>
        </div>
        </template>
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
              :style="{ width: `${monthWidth(month)}px` }"
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
            @dragstart="handleTaskDragStart"
            @dragend="handleTaskDragEnd"
            @dragover="handleTaskDragOver"
            @drop="handleTaskDrop"
            @move="handleTaskMove"
          />
          
          <!-- Empty State -->
          <div 
            v-if="store.flattenedTasks.length === 0"
            class="p-4 text-center text-surface-400"
          >
            <template v-if="store.isSearching">
              <p class="text-sm mb-2">Eşleşen görev yok</p>
              <button
                @click="store.clearSearch()"
                class="text-sm text-surface-600 hover:text-surface-900 underline"
              >
                Aramayı temizle
              </button>
            </template>
            <template v-else>
              <p class="text-sm mb-2">Henüz görev yok</p>
              <button
                v-if="!store.isViewOnly"
                @click="addTask()"
                class="text-sm text-surface-600 hover:text-surface-900 underline"
              >
                İlk görevi ekle
              </button>
            </template>
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
              :style="{ width: `${monthWidth(month)}px` }"
            />
          </div>
          
          <!-- Today Line -->
          <div
            v-if="todayPositionPx !== null"
            class="absolute top-0 bottom-0 w-px bg-red-400 z-10"
            :style="{ left: `${todayPositionPx}px` }"
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

    <!-- Görev sütunu ayırıcısı.
         Başlıktan aşağıya kadar uzanır; sürükleyerek sütun genişletilir.
         Kapsayıcıya göre konumlanır, gövde kaydırılırken yerinde kalır. -->
    <div
      ref="resizeHandleRef"
      class="absolute top-0 bottom-0 z-30 w-3 -ml-1.5 flex justify-center cursor-col-resize touch-none group"
      :style="{ left: `${taskListWidth}px` }"
      role="separator"
      aria-orientation="vertical"
      :aria-valuenow="taskListWidth"
      aria-label="Görev sütunu genişliği"
      tabindex="0"
      v-tip="'Sürükleyerek genişlet, çift tıkla sıfırla'"
      @mousedown="onResizeMouseDown"
      @touchstart="onResizeTouchStart"
      @touchend="endResize"
      @touchcancel="endResize"
      @dblclick="resetTaskListWidth"
      @keydown="onResizeKeydown"
    >
      <div
        class="w-0.5 h-full rounded-full transition-colors"
        :class="isResizing
          ? 'bg-surface-900'
          : 'bg-transparent group-hover:bg-surface-400 group-focus:bg-surface-600'"
      />
    </div>
  </div>
</template>

