<script setup lang="ts">
import { getDatePosition, getBarWidth } from '~/utils/dates'
import { useGanttStore } from '~/stores/gantt'

const store = useGanttStore()

interface DependencyLine {
  id: string
  sourceX: number  // yüzde
  sourceY: number  // piksel
  targetX: number  // yüzde
  targetY: number  // piksel
}

interface SubtaskLine {
  id: string
  parentX: number  // yüzde - parent bar'ın sol kenarı
  parentY: number  // piksel - parent'ın alt kısmı
  childX: number   // yüzde - child bar'ın sol kenarı
  childY: number   // piksel - child'ın ortası
}

const ROW_HEIGHT = 40

// Dependency lines hesapla (turuncu - bağımlılıklar)
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
      
      // Kaynak bar'ın sağ kenarı
      const sourceLeft = getDatePosition(sourceTask.startDate, store.dateRange)
      const sourceWidth = getBarWidth(sourceTask.startDate, sourceTask.endDate, store.dateRange)
      const sourceX = sourceLeft + sourceWidth
      const sourceY = sourceIndex * ROW_HEIGHT + ROW_HEIGHT / 2
      
      // Hedef bar'ın sol kenarı
      const targetX = getDatePosition(task.startDate, store.dateRange)
      const targetY = targetIndex * ROW_HEIGHT + ROW_HEIGHT / 2
      
      result.push({
        id: `dep-${depId}-${task.id}`,
        sourceX,
        sourceY,
        targetX,
        targetY
      })
    })
  })
  
  return result
})

// Subtask lines hesapla (gri - parent-child ilişkisi)
const subtaskLines = computed((): SubtaskLine[] => {
  const result: SubtaskLine[] = []
  const taskIndexMap = new Map<string, number>()
  
  store.flattenedTasks.forEach((task, index) => {
    taskIndexMap.set(task.id, index)
  })
  
  store.flattenedTasks.forEach((task, childIndex) => {
    if (!task.parentId) return
    
    const parentIndex = taskIndexMap.get(task.parentId)
    if (parentIndex === undefined) return
    
    const parentTask = store.flattenedTasks[parentIndex]
    
    // Parent bar'ın sol kenarı + biraz offset
    const parentLeft = getDatePosition(parentTask.startDate, store.dateRange)
    const parentX = parentLeft + 1 // Bar'ın biraz içinden başla
    const parentY = parentIndex * ROW_HEIGHT + ROW_HEIGHT - 4 // Parent'ın alt kısmı
    
    // Child bar'ın sol kenarı
    const childX = getDatePosition(task.startDate, store.dateRange)
    const childY = childIndex * ROW_HEIGHT + ROW_HEIGHT / 2 // Child'ın ortası
    
    result.push({
      id: `sub-${task.parentId}-${task.id}`,
      parentX,
      parentY,
      childX,
      childY
    })
  })
  
  return result
})
</script>

<template>
  <div class="absolute inset-0 pointer-events-none overflow-visible" style="z-index: 1;">
    
    <!-- ===== SUBTASK ÇİZGİLERİ (Gri, kesikli) ===== -->
    <template v-for="line in subtaskLines" :key="line.id">
      <!-- Dikey çizgi (parent'tan aşağı) -->
      <div 
        class="absolute bg-gray-400"
        :style="{
          left: `calc(${line.parentX}% + 4px)`,
          top: `${line.parentY}px`,
          width: '2px',
          height: `${line.childY - line.parentY}px`
        }"
      />
      
      <!-- Yatay çizgi (child'a doğru) -->
      <div 
        class="absolute bg-gray-400"
        :style="{
          left: `calc(${line.parentX}% + 4px)`,
          top: `${line.childY - 1}px`,
          width: `calc(${line.childX - line.parentX}% - 4px)`,
          height: '2px'
        }"
      />
      
      <!-- Küçük nokta (bağlantı noktası) -->
      <div 
        class="absolute w-2 h-2 bg-gray-400 rounded-full"
        :style="{
          left: `calc(${line.childX}% - 4px)`,
          top: `${line.childY - 4}px`
        }"
      />
    </template>
    
    <!-- ===== DEPENDENCY ÇİZGİLERİ (Turuncu, oklu) ===== -->
    <template v-for="line in dependencyLines" :key="line.id">
      <!-- Yatay çizgi 1 (kaynaktan) -->
      <div 
        class="absolute bg-orange-500 rounded-full"
        :style="{
          left: `${line.sourceX}%`,
          top: `${line.sourceY - 1}px`,
          width: '20px',
          height: '2px'
        }"
      />
      
      <!-- Dikey çizgi -->
      <div 
        class="absolute bg-orange-500"
        :style="{
          left: `calc(${line.sourceX}% + 18px)`,
          top: `${Math.min(line.sourceY, line.targetY)}px`,
          width: '2px',
          height: `${Math.abs(line.targetY - line.sourceY)}px`
        }"
      />
      
      <!-- Yatay çizgi 2 (hedefe) -->
      <div 
        class="absolute bg-orange-500 rounded-full"
        :style="{
          left: `calc(${line.sourceX}% + 18px)`,
          top: `${line.targetY - 1}px`,
          width: `calc(${line.targetX - line.sourceX}% - 18px)`,
          height: '2px'
        }"
      />
      
      <!-- Ok ucu -->
      <div 
        class="absolute"
        :style="{
          left: `calc(${line.targetX}% - 8px)`,
          top: `${line.targetY - 5}px`
        }"
      >
        <svg width="10" height="10" viewBox="0 0 10 10">
          <polygon points="0,0 10,5 0,10" fill="#F97316" />
        </svg>
      </div>
    </template>
  </div>
</template>
