<script setup lang="ts">
import { getDatePosition, getBarWidth } from '~/utils/dates'
import { useGanttStore } from '~/stores/gantt'

const store = useGanttStore()

interface DependencyLine {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
}

interface SubtaskLine {
  id: string
  parentIndex: number
  childIndex: number
  level: number
}

const ROW_HEIGHT = 40
const INDENT_WIDTH = 12 // Her level için girinti

// Dependency lines (görevler arası bağımlılık)
const dependencyLines = computed((): DependencyLine[] => {
  const result: DependencyLine[] = []
  const taskIndexMap = new Map<string, number>()
  
  store.flattenedTasks.forEach((task, index) => {
    taskIndexMap.set(task.id, index)
  })
  
  store.flattenedTasks.forEach((task, targetIndex) => {
    task.dependencies.forEach(depId => {
      const sourceIndex = taskIndexMap.get(depId)
      if (sourceIndex === undefined) return
      
      const sourceTask = store.flattenedTasks[sourceIndex]
      
      const sourceLeft = getDatePosition(sourceTask.startDate, store.dateRange)
      const sourceWidth = getBarWidth(sourceTask.startDate, sourceTask.endDate, store.dateRange)
      const x1 = sourceLeft + sourceWidth
      const y1 = sourceIndex * ROW_HEIGHT + ROW_HEIGHT / 2
      
      const x2 = getDatePosition(task.startDate, store.dateRange)
      const y2 = targetIndex * ROW_HEIGHT + ROW_HEIGHT / 2
      
      result.push({ id: `dep-${depId}-${task.id}`, x1, y1, x2, y2 })
    })
  })
  
  return result
})

// Subtask lines (parent-child ilişkisi)
const subtaskLines = computed((): SubtaskLine[] => {
  const result: SubtaskLine[] = []
  const taskIndexMap = new Map<string, number>()
  
  store.flattenedTasks.forEach((task, index) => {
    taskIndexMap.set(task.id, index)
  })
  
  store.flattenedTasks.forEach((task, childIndex) => {
    if (task.parentId) {
      const parentIndex = taskIndexMap.get(task.parentId)
      if (parentIndex !== undefined) {
        result.push({
          id: `sub-${task.parentId}-${task.id}`,
          parentIndex,
          childIndex,
          level: task.level
        })
      }
    }
  })
  
  return result
})

// Dependency path (Bezier curve)
function createDependencyPath(line: DependencyLine): string {
  const midX = (line.x1 + line.x2) / 2
  
  if (line.x2 < line.x1) {
    const offset = 2
    return `M ${line.x1}% ${line.y1} 
            L ${line.x1 + offset}% ${line.y1}
            Q ${line.x1 + offset * 2}% ${line.y1} ${line.x1 + offset * 2}% ${(line.y1 + line.y2) / 2}
            Q ${line.x1 + offset * 2}% ${line.y2} ${line.x2}% ${line.y2}`
  }
  
  return `M ${line.x1}% ${line.y1} C ${midX}% ${line.y1}, ${midX}% ${line.y2}, ${line.x2}% ${line.y2}`
}

// Subtask path (L şeklinde köşeli çizgi - sol kenardan)
function createSubtaskPath(line: SubtaskLine): string {
  const x = (line.level - 1) * INDENT_WIDTH + 6 // Sol kenardan başla
  const y1 = line.parentIndex * ROW_HEIGHT + ROW_HEIGHT - 2 // Parent'ın altından
  const y2 = line.childIndex * ROW_HEIGHT + ROW_HEIGHT / 2 // Child'ın ortasına
  
  // L şeklinde: aşağı, sonra sağa
  return `M ${x} ${y1} L ${x} ${y2} L ${x + INDENT_WIDTH - 2} ${y2}`
}

// SVG yüksekliği
const svgHeight = computed(() => store.flattenedTasks.length * ROW_HEIGHT)
</script>

<template>
  <!-- Dependency lines (timeline üzerinde) -->
  <svg
    v-if="dependencyLines.length > 0"
    class="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
    style="z-index: 5;"
  >
    <defs>
      <marker
        id="arrowhead-dep"
        markerWidth="8"
        markerHeight="6"
        refX="8"
        refY="3"
        orient="auto"
      >
        <polygon points="0 0, 8 3, 0 6" fill="#F97316" />
      </marker>
    </defs>
    
    <path
      v-for="line in dependencyLines"
      :key="line.id"
      :d="createDependencyPath(line)"
      fill="none"
      stroke="#F97316"
      stroke-width="2"
      marker-end="url(#arrowhead-dep)"
      opacity="0.8"
    />
  </svg>
</template>

