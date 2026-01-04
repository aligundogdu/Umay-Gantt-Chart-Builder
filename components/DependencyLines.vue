<script setup lang="ts">
import { getDatePosition, getBarWidth } from '~/utils/dates'
import { useGanttStore } from '~/stores/gantt'

const store = useGanttStore()

interface Line {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
}

const ROW_HEIGHT = 40

const lines = computed((): Line[] => {
  const result: Line[] = []
  const taskIndexMap = new Map<string, number>()
  
  // Task index'lerini hesapla
  store.flattenedTasks.forEach((task, index) => {
    taskIndexMap.set(task.id, index)
  })
  
  // Her task'ın dependency'lerini kontrol et
  store.flattenedTasks.forEach((task, targetIndex) => {
    task.dependencies.forEach(depId => {
      const sourceIndex = taskIndexMap.get(depId)
      if (sourceIndex === undefined) return
      
      const sourceTask = store.flattenedTasks[sourceIndex]
      
      // Kaynak task'ın bitiş noktası
      const sourceLeft = getDatePosition(sourceTask.startDate, store.dateRange)
      const sourceWidth = getBarWidth(sourceTask.startDate, sourceTask.endDate, store.dateRange)
      const x1 = sourceLeft + sourceWidth
      const y1 = sourceIndex * ROW_HEIGHT + ROW_HEIGHT / 2
      
      // Hedef task'ın başlangıç noktası
      const x2 = getDatePosition(task.startDate, store.dateRange)
      const y2 = targetIndex * ROW_HEIGHT + ROW_HEIGHT / 2
      
      result.push({
        id: `${depId}-${task.id}`,
        x1,
        y1,
        x2,
        y2
      })
    })
  })
  
  return result
})

// SVG path oluştur (Bezier curve)
function createPath(line: Line): string {
  const midX = (line.x1 + line.x2) / 2
  
  // Eğer hedef kaynaktan önceyse, farklı bir yol çiz
  if (line.x2 < line.x1) {
    const offset = 2 // % olarak offset
    return `M ${line.x1}% ${line.y1} 
            L ${line.x1 + offset}% ${line.y1}
            Q ${line.x1 + offset * 2}% ${line.y1} ${line.x1 + offset * 2}% ${(line.y1 + line.y2) / 2}
            Q ${line.x1 + offset * 2}% ${line.y2} ${line.x2}% ${line.y2}`
  }
  
  // Normal Bezier curve
  return `M ${line.x1}% ${line.y1} 
          C ${midX}% ${line.y1}, ${midX}% ${line.y2}, ${line.x2}% ${line.y2}`
}
</script>

<template>
  <svg
    v-if="lines.length > 0"
    class="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
    style="z-index: 5;"
  >
    <defs>
      <marker
        id="arrowhead"
        markerWidth="8"
        markerHeight="6"
        refX="8"
        refY="3"
        orient="auto"
      >
        <polygon 
          points="0 0, 8 3, 0 6" 
          class="fill-surface-400"
        />
      </marker>
    </defs>
    
    <path
      v-for="line in lines"
      :key="line.id"
      :d="createPath(line)"
      fill="none"
      class="stroke-surface-400"
      stroke-width="1.5"
      marker-end="url(#arrowhead)"
    />
  </svg>
</template>

