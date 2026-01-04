<script setup lang="ts">
import type { TaskNode } from '~/types'
import { formatDate, daysDiff } from '~/utils/dates'
import { useGanttStore } from '~/stores/gantt'

const props = defineProps<{
  task: TaskNode
  color: string
}>()

const store = useGanttStore()

const duration = computed(() => {
  return daysDiff(props.task.startDate, props.task.endDate) + 1
})

const progressWidth = computed(() => {
  return `${props.task.progress}%`
})

function openTaskModal() {
  store.openModal('task', { taskId: props.task.id })
}

// Drag functionality için state
const isDragging = ref(false)
const dragType = ref<'move' | 'resize-start' | 'resize-end' | null>(null)
const startX = ref(0)
const originalStart = ref('')
const originalEnd = ref('')

function onMouseDown(e: MouseEvent, type: 'move' | 'resize-start' | 'resize-end') {
  e.preventDefault()
  isDragging.value = true
  dragType.value = type
  startX.value = e.clientX
  originalStart.value = props.task.startDate
  originalEnd.value = props.task.endDate
  
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging.value) return
  
  const deltaX = e.clientX - startX.value
  // Timeline genişliğine göre dinamik hesaplama
  // Varsayılan olarak ~600px genişlik ve view mode'a göre gün sayısı
  const totalDays = daysDiff(store.dateRange.start, store.dateRange.end)
  const chartWidth = 600 // Minimum chart genişliği
  const pixelsPerDay = Math.max(2, chartWidth / totalDays)
  const daysDelta = Math.round(deltaX / pixelsPerDay)
  
  if (daysDelta === 0) return
  
  const start = new Date(originalStart.value)
  const end = new Date(originalEnd.value)
  
  if (dragType.value === 'move') {
    start.setDate(start.getDate() + daysDelta)
    end.setDate(end.getDate() + daysDelta)
  } else if (dragType.value === 'resize-start') {
    start.setDate(start.getDate() + daysDelta)
    if (start >= end) return
  } else if (dragType.value === 'resize-end') {
    end.setDate(end.getDate() + daysDelta)
    if (end <= start) return
  }
  
  store.updateTask(props.task.id, {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0]
  })
}

function onMouseUp() {
  isDragging.value = false
  dragType.value = null
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
}
</script>

<template>
  <div
    class="gantt-bar absolute top-1 bottom-1 flex items-center group"
    :class="{ 'cursor-grabbing': isDragging }"
    :style="{ backgroundColor: color }"
    @dblclick="openTaskModal"
    @mousedown.prevent="onMouseDown($event, 'move')"
  >
    <!-- Resize Handle Left -->
    <div
      class="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-black/10 rounded-l-md"
      @mousedown.stop="onMouseDown($event, 'resize-start')"
    />
    
    <!-- Progress Bar -->
    <div 
      v-if="task.progress > 0"
      class="absolute left-0 top-0 bottom-0 bg-black/15 rounded-md"
      :style="{ width: progressWidth }"
    />
    
    <!-- Content -->
    <div class="relative px-2 flex items-center justify-between w-full min-w-0">
      <span class="text-xs font-medium text-surface-800 truncate">
        {{ task.name }}
      </span>
      <span class="text-[10px] text-surface-600 ml-2 shrink-0">
        {{ duration }}g
      </span>
    </div>
    
    <!-- Resize Handle Right -->
    <div
      class="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-black/10 rounded-r-md"
      @mousedown.stop="onMouseDown($event, 'resize-end')"
    />
    
    <!-- Tooltip -->
    <div 
      class="absolute bottom-full left-0 mb-1 px-2 py-1 bg-surface-900 text-white text-xs rounded
             opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-20
             transition-opacity duration-150"
    >
      <div class="font-medium">{{ task.name }}</div>
      <div class="text-surface-300">
        {{ formatDate(task.startDate) }} - {{ formatDate(task.endDate) }}
      </div>
      <div v-if="task.progress > 0" class="text-surface-300">
        İlerleme: {{ task.progress }}%
      </div>
    </div>
  </div>
</template>

