<script setup lang="ts">
import { getDatePosition, getBarWidth } from '~/utils/dates'
import { useGanttStore } from '~/stores/gantt'

const store = useGanttStore()

// Parent'tan timeline genişliğini al
const timelineWidth = inject<ComputedRef<number>>('timelineWidth')

interface DependencyLine {
  id: string
  sourceStartX: number  // source bar sol kenarı (piksel)
  sourceEndX: number    // source bar sağ kenarı (piksel)
  sourceY: number
  targetStartX: number  // target bar sol kenarı (piksel)
  targetEndX: number    // target bar sağ kenarı (piksel)
  targetY: number
  isTargetBefore: boolean // target, source'dan önce mi başlıyor
}

interface SubtaskLine {
  id: string
  parentStartX: number  // parent bar sol kenarı (piksel)
  parentEndX: number    // parent bar sağ kenarı (piksel)
  parentY: number
  childStartX: number   // child bar sol kenarı (piksel)
  childEndX: number     // child bar sağ kenarı (piksel)
  childY: number
  isChildBefore: boolean // child, parent'tan önce mi başlıyor
}

const ROW_HEIGHT = 40

// Yüzdeyi piksele çevir
function percentToPx(percent: number): number {
  return (percent / 100) * (timelineWidth?.value || 1000)
}

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
      
      // Yüzde değerlerini piksele çevir
      const sourceStartX = percentToPx(getDatePosition(sourceTask.startDate, store.dateRange))
      const sourceWidth = percentToPx(getBarWidth(sourceTask.startDate, sourceTask.endDate, store.dateRange))
      const sourceEndX = sourceStartX + sourceWidth
      const sourceY = sourceIndex * ROW_HEIGHT + ROW_HEIGHT / 2
      
      const targetStartX = percentToPx(getDatePosition(task.startDate, store.dateRange))
      const targetWidth = percentToPx(getBarWidth(task.startDate, task.endDate, store.dateRange))
      const targetEndX = targetStartX + targetWidth
      const targetY = targetIndex * ROW_HEIGHT + ROW_HEIGHT / 2
      
      // Target, source'un bitişinden önce mi başlıyor?
      const isTargetBefore = targetStartX < sourceEndX
      
      result.push({
        id: `dep-${depId}-${task.id}`,
        sourceStartX,
        sourceEndX,
        sourceY,
        targetStartX,
        targetEndX,
        targetY,
        isTargetBefore
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
    
    // Yüzde değerlerini piksele çevir
    const parentStartX = percentToPx(getDatePosition(parentTask.startDate, store.dateRange))
    const parentWidth = percentToPx(getBarWidth(parentTask.startDate, parentTask.endDate, store.dateRange))
    const parentEndX = parentStartX + parentWidth
    const parentY = parentIndex * ROW_HEIGHT + ROW_HEIGHT - 4
    
    const childStartX = percentToPx(getDatePosition(task.startDate, store.dateRange))
    const childWidth = percentToPx(getBarWidth(task.startDate, task.endDate, store.dateRange))
    const childEndX = childStartX + childWidth
    const childY = childIndex * ROW_HEIGHT + ROW_HEIGHT / 2
    
    // Child, parent'tan önce mi başlıyor?
    const isChildBefore = childStartX < parentStartX
    
    result.push({
      id: `sub-${task.parentId}-${task.id}`,
      parentStartX,
      parentEndX,
      parentY,
      childStartX,
      childEndX,
      childY,
      isChildBefore
    })
  })
  
  return result
})
</script>

<template>
  <div class="absolute inset-0 pointer-events-none overflow-visible" style="z-index: 1;">
    
    <!-- ===== SUBTASK ÇİZGİLERİ (Gri) ===== -->
    <template v-for="line in subtaskLines" :key="line.id">
      <!-- Child parent'tan sonra veya aynı hizada başlıyorsa: Normal L çizgisi -->
      <template v-if="!line.isChildBefore">
        <!-- Dikey çizgi (parent'tan aşağı) -->
        <div 
          class="absolute bg-gray-400"
          :style="{
            left: `${line.parentStartX + 6}px`,
            top: `${line.parentY}px`,
            width: '2px',
            height: `${line.childY - line.parentY}px`
          }"
        />
        <!-- Yatay çizgi (child'a doğru - sağa) -->
        <div 
          class="absolute bg-gray-400"
          :style="{
            left: `${line.parentStartX + 6}px`,
            top: `${line.childY - 1}px`,
            width: `${Math.max(0, line.childStartX - line.parentStartX - 6)}px`,
            height: '2px'
          }"
        />
        <!-- Nokta -->
        <div 
          class="absolute w-2 h-2 bg-gray-400 rounded-full"
          :style="{
            left: `${line.childStartX - 4}px`,
            top: `${line.childY - 4}px`
          }"
        />
      </template>
      
      <!-- Child parent'tan önce başlıyorsa: Ters L çizgisi -->
      <template v-else>
        <!-- Dikey çizgi (parent'tan aşağı, sol taraftan) -->
        <div 
          class="absolute bg-gray-400"
          :style="{
            left: `${line.childEndX + 6}px`,
            top: `${line.parentY}px`,
            width: '2px',
            height: `${line.childY - line.parentY}px`
          }"
        />
        <!-- Yatay çizgi (parent'tan sola) -->
        <div 
          class="absolute bg-gray-400"
          :style="{
            left: `${line.childEndX + 6}px`,
            top: `${line.parentY - 1}px`,
            width: `${Math.max(0, line.parentStartX - line.childEndX - 6)}px`,
            height: '2px'
          }"
        />
        <!-- Nokta (child'ın sağında) -->
        <div 
          class="absolute w-2 h-2 bg-gray-400 rounded-full"
          :style="{
            left: `${line.childEndX + 2}px`,
            top: `${line.childY - 4}px`
          }"
        />
      </template>
    </template>
    
    <!-- ===== DEPENDENCY ÇİZGİLERİ (Turuncu, oklu) ===== -->
    <template v-for="line in dependencyLines" :key="line.id">
      <!-- Target, source'dan sonra başlıyorsa: Normal çizgi (sağdan sola) -->
      <template v-if="!line.isTargetBefore">
        <!-- Yatay çizgi 1 (source'un sağından) -->
        <div 
          class="absolute bg-orange-500 rounded-full"
          :style="{
            left: `${line.sourceEndX}px`,
            top: `${line.sourceY - 1}px`,
            width: '20px',
            height: '2px'
          }"
        />
        <!-- Dikey çizgi -->
        <div 
          class="absolute bg-orange-500"
          :style="{
            left: `${line.sourceEndX + 18}px`,
            top: `${Math.min(line.sourceY, line.targetY)}px`,
            width: '2px',
            height: `${Math.abs(line.targetY - line.sourceY) || 2}px`
          }"
        />
        <!-- Yatay çizgi 2 (target'a doğru) -->
        <div 
          class="absolute bg-orange-500 rounded-full"
          :style="{
            left: `${line.sourceEndX + 18}px`,
            top: `${line.targetY - 1}px`,
            width: `${Math.max(0, line.targetStartX - line.sourceEndX - 26)}px`,
            height: '2px'
          }"
        />
        <!-- Ok ucu (target'ın solunda) -->
        <div 
          class="absolute"
          :style="{
            left: `${line.targetStartX - 10}px`,
            top: `${line.targetY - 5}px`
          }"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <polygon points="0,0 10,5 0,10" fill="#F97316" />
          </svg>
        </div>
      </template>
      
      <!-- Target, source'dan önce başlıyorsa: Ters yönde çizgi -->
      <template v-else>
        <!-- Yatay çizgi 1 (source'un solundan) -->
        <div 
          class="absolute bg-orange-500 rounded-full"
          :style="{
            left: `${line.sourceStartX - 20}px`,
            top: `${line.sourceY - 1}px`,
            width: '20px',
            height: '2px'
          }"
        />
        <!-- Dikey çizgi -->
        <div 
          class="absolute bg-orange-500"
          :style="{
            left: `${line.sourceStartX - 22}px`,
            top: `${Math.min(line.sourceY, line.targetY)}px`,
            width: '2px',
            height: `${Math.abs(line.targetY - line.sourceY) || 2}px`
          }"
        />
        <!-- Yatay çizgi 2 (target'a doğru - sola) -->
        <div 
          class="absolute bg-orange-500 rounded-full"
          :style="{
            left: `${line.targetEndX + 10}px`,
            top: `${line.targetY - 1}px`,
            width: `${Math.max(0, line.sourceStartX - line.targetEndX - 32)}px`,
            height: '2px'
          }"
        />
        <!-- Ok ucu (target'ın sağında, sola bakan) -->
        <div 
          class="absolute"
          :style="{
            left: `${line.targetEndX + 2}px`,
            top: `${line.targetY - 5}px`
          }"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <polygon points="10,0 0,5 10,10" fill="#F97316" />
          </svg>
        </div>
      </template>
    </template>
  </div>
</template>
