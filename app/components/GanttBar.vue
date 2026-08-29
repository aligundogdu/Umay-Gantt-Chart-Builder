<script setup lang="ts">
import type { TaskNode } from '~/types'
import { formatDate, daysDiff, toISODate, addDays } from '~/utils/dates'
import { useGanttStore } from '~/stores/gantt'

const props = defineProps<{
  task: TaskNode
  color: string
}>()

const store = useGanttStore()

// Gün başına piksel, GanttChart tarafından sağlanır.
// Önceden burada yeniden hesaplanıp 2px tabanına kırpılıyordu; bu yüzden
// düşük zoom seviyelerinde bar imleçten yavaş hareket ediyordu.
const pxPerDay = inject<ComputedRef<number>>('pxPerDay')

const duration = computed(() => {
  return daysDiff(props.task.startDate, props.task.endDate) + 1
})

const progressWidth = computed(() => {
  return `${props.task.progress}%`
})

const isInvalidRange = computed(() => duration.value < 1)

const isCompleted = computed(() => props.task.status === 'completed')
const isCancelled = computed(() => props.task.status === 'cancelled')
const isClosed = computed(() => isCompleted.value || isCancelled.value)

// Rozetin kendisi bile sığmayacak kadar dar barlarda gösterilmez.
// O barlarda durum bilgisi çerçeve, soluk renk ve satır şeridiyle kalır.
const MIN_WIDTH_FOR_BADGE = 28

const showStatusBadge = computed(() => {
  if (!isClosed.value) return false
  return duration.value * (pxPerDay?.value || 0) >= MIN_WIDTH_FOR_BADGE
})


function openTaskModal() {
  if (store.isViewOnly) return
  store.openModal('task', { taskId: props.task.id })
}

// ===== Sürükleme =====

type DragType = 'move' | 'resize-start' | 'resize-end'

const isDragging = ref(false)
const dragType = ref<DragType | null>(null)
const startX = ref(0)
const originalStart = ref('')
const originalEnd = ref('')
const pendingStart = ref('')
const pendingEnd = ref('')

// Barın çerçevesi tek yerden belirlenir. Aynı anda birden fazla ring
// sınıfı verilirse hangisinin kazandığı CSS sırasına kalırdı.
const ringClass = computed(() => {
  if (isInvalidRange.value) return 'ring-2 ring-red-400'
  if (isDragging.value) return 'ring-2 ring-surface-900'
  if (isCompleted.value) return 'ring-2 ring-emerald-600'
  // İptal edilen barın çerçevesi de rengi de nötr: yeşil "tamamlandı"
  // sinyalinden ilk bakışta ayrılması gerekiyor.
  if (isCancelled.value) return 'ring-2 ring-surface-400'
  return ''
})

function beginDrag(clientX: number, type: DragType) {
  // Sıralama açıkken satırın sürükleme sırasında yer değiştirmemesi için
  // mevcut sıra sabitlenir, bırakılınca çözülür.
  store.beginTaskDrag()
  isDragging.value = true
  dragType.value = type
  startX.value = clientX
  originalStart.value = props.task.startDate
  originalEnd.value = props.task.endDate
  pendingStart.value = props.task.startDate
  pendingEnd.value = props.task.endDate
}

function applyDelta(clientX: number) {
  if (!isDragging.value) return

  const deltaX = clientX - startX.value
  const perDay = pxPerDay?.value || 1
  const daysDelta = Math.round(deltaX / perDay)

  let start = originalStart.value
  let end = originalEnd.value

  if (dragType.value === 'move') {
    start = toISODate(addDays(originalStart.value, daysDelta))
    end = toISODate(addDays(originalEnd.value, daysDelta))
  } else if (dragType.value === 'resize-start') {
    const candidate = addDays(originalStart.value, daysDelta)
    // En az bir günlük görev kalsın
    if (daysDiff(candidate, originalEnd.value) < 0) return
    start = toISODate(candidate)
  } else if (dragType.value === 'resize-end') {
    const candidate = addDays(originalEnd.value, daysDelta)
    if (daysDiff(originalStart.value, candidate) < 0) return
    end = toISODate(candidate)
  }

  if (start === pendingStart.value && end === pendingEnd.value) return

  pendingStart.value = start
  pendingEnd.value = end

  // Sürükleme boyunca yalnızca bellek güncellenir.
  // Kalıcı yazma bırakıldığında bir kez yapılır.
  store.previewTaskDates(props.task.id, start, end)
}

async function endDrag() {
  if (!isDragging.value) {
    store.endTaskDrag()
    return
  }

  isDragging.value = false
  dragType.value = null

  const changed =
    pendingStart.value !== originalStart.value || pendingEnd.value !== originalEnd.value

  if (changed) {
    await store.commitTaskDates(props.task.id, pendingStart.value, pendingEnd.value)
  }

  // Sıra artık yeniden hesaplanabilir
  store.endTaskDrag()
}

// --- Fare ---

function onMouseDown(e: MouseEvent, type: DragType) {
  if (store.isViewOnly) return
  e.preventDefault()
  e.stopPropagation()
  beginDrag(e.clientX, type)

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(e: MouseEvent) {
  applyDelta(e.clientX)
}

function onMouseUp() {
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
  endDrag()
}

// --- Dokunmatik ---
// HTML5 fare olayları mobilde çalışmadığı için ayrı ele alınır.
// Basılı tutunca sürükleme başlar, böylece normal kaydırma engellenmez.

const LONG_PRESS_MS = 250
let longPressTimer: ReturnType<typeof setTimeout> | null = null
let touchStartX = 0
let touchStartY = 0
const isTouchArmed = ref(false)

function onTouchStart(e: TouchEvent, type: DragType) {
  if (store.isViewOnly) return
  const touch = e.touches[0]
  if (!touch) return

  touchStartX = touch.clientX
  touchStartY = touch.clientY

  // Tutamaçlarda beklemeye gerek yok, doğrudan boyutlandırma
  if (type !== 'move') {
    isTouchArmed.value = true
    beginDrag(touch.clientX, type)
    return
  }

  longPressTimer = setTimeout(() => {
    isTouchArmed.value = true
    beginDrag(touchStartX, 'move')
    // Kısa bir dokunsal geri bildirim, sürüklemenin başladığını belli eder
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10)
  }, LONG_PRESS_MS)
}

function onTouchMove(e: TouchEvent) {
  const touch = e.touches[0]
  if (!touch) return

  if (!isTouchArmed.value) {
    // Basılı tutma tamamlanmadan parmak kaydıysa bu bir kaydırma hareketidir
    const movedX = Math.abs(touch.clientX - touchStartX)
    const movedY = Math.abs(touch.clientY - touchStartY)
    if (movedX > 8 || movedY > 8) cancelLongPress()
    return
  }

  // Sürükleme sırasında sayfanın kaymasını engelle
  e.preventDefault()
  applyDelta(touch.clientX)
}

function onTouchEnd() {
  cancelLongPress()
  if (isTouchArmed.value) {
    isTouchArmed.value = false
    endDrag()
  }
}

function cancelLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

// Dokunmatik olay dinleyicileri passive:false ile bağlanmalı,
// aksi halde preventDefault yok sayılır.
const barRef = ref<HTMLElement | null>(null)

onMounted(() => {
  const el = barRef.value
  if (!el) return
  el.addEventListener('touchmove', onTouchMove as EventListener, { passive: false })
})

onBeforeUnmount(() => {
  // Sürükleme yarıda kalırsa sıra donmuş kalmasın
  if (isDragging.value) store.endTaskDrag()
  cancelLongPress()
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
  barRef.value?.removeEventListener('touchmove', onTouchMove as EventListener)
})
</script>

<template>
  <div
    ref="barRef"
    class="gantt-bar absolute top-1 bottom-1 flex items-center group z-10 touch-none"
    :class="[
      ringClass,
      isCompleted ? 'saturate-50' : '',
      isCancelled ? 'saturate-0 opacity-70' : '',
      {
        'cursor-grabbing': isDragging,
        'cursor-grab': !store.isViewOnly && !isDragging,
        'cursor-default': store.isViewOnly
      }
    ]"
    :style="{ backgroundColor: color }"
    :title="isInvalidRange
      ? `${task.name} - bitiş tarihi başlangıçtan önce`
      : `${task.name} (${formatDate(task.startDate)} - ${formatDate(task.endDate)}, ${duration} gün)${isCompleted ? ' · bitti' : ''}${isCancelled ? ' · iptal edildi' : ''}`"
    role="button"
    :aria-label="`${task.name}, ${formatDate(task.startDate)} - ${formatDate(task.endDate)}`"
    @dblclick="openTaskModal"
    @mousedown="onMouseDown($event, 'move')"
    @touchstart="onTouchStart($event, 'move')"
    @touchend="onTouchEnd"
    @touchcancel="onTouchEnd"
  >
    <!-- İlerleme dolgusu -->
    <div
      v-if="task.progress > 0"
      class="absolute inset-y-0 left-0 bg-black/10 rounded-md pointer-events-none"
      :style="{ width: progressWidth }"
    />

    <!-- Başlangıç tutamacı -->
    <div
      v-if="!store.isViewOnly"
      class="absolute left-0 inset-y-0 w-2 md:w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-black/20 rounded-l-md"
      @mousedown.stop="onMouseDown($event, 'resize-start')"
      @touchstart.stop="onTouchStart($event, 'resize-start')"
      @touchend.stop="onTouchEnd"
    />

    <!-- Etiket. Kapanan görevlerde dolu durum rozeti ve üstü çizili ad.
         Rozetin kendi zemini var: bar rengi açık yeşil olduğunda ince bir
         çerçeve veya renksiz bir ikon ayırt edici olmuyordu. -->
    <span class="min-w-0 px-2 flex items-center gap-1.5 pointer-events-none select-none">
      <span
        v-if="showStatusBadge"
        class="w-4 h-4 rounded-full text-white flex items-center justify-center shrink-0 shadow-sm"
        :class="isCancelled ? 'bg-surface-600' : 'bg-emerald-600'"
      >
        <Icon :name="isCancelled ? 'ph:x-bold' : 'ph:check-bold'" class="w-2.5 h-2.5" />
      </span>
      <span
        class="text-[11px] md:text-xs font-medium text-surface-800 truncate"
        :class="isClosed ? 'line-through decoration-surface-600/60' : ''"
      >
        {{ task.name }}
      </span>
    </span>

    <!-- Bitiş tutamacı -->
    <div
      v-if="!store.isViewOnly"
      class="absolute right-0 inset-y-0 w-2 md:w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-black/20 rounded-r-md"
      @mousedown.stop="onMouseDown($event, 'resize-end')"
      @touchstart.stop="onTouchStart($event, 'resize-end')"
      @touchend.stop="onTouchEnd"
    />
  </div>
</template>
