<script setup lang="ts">
import type { TaskNode } from '~/types'
import { GANTT_COLOR_MAP } from '~/types'
import { getDatePosition, getBarWidth } from '~/utils/dates'
import { useGanttStore } from '~/stores/gantt'

const props = defineProps<{
  task: TaskNode
  mode: 'list' | 'chart'
}>()

const store = useGanttStore()

const hasChildren = computed(() => props.task.children.length > 0)
const isCollapsed = computed(() => store.collapsedTasks.has(props.task.id))

// Bar pozisyon ve genişlik hesaplama
const barStyle = computed(() => {
  const left = getDatePosition(props.task.startDate, store.dateRange)
  const width = getBarWidth(props.task.startDate, props.task.endDate, store.dateRange)
  
  return {
    left: `${Math.max(0, left)}%`,
    width: `${Math.min(100 - left, width)}%`
  }
})

const barColor = computed(() => GANTT_COLOR_MAP[props.task.color])

function toggleCollapse() {
  store.toggleTaskCollapse(props.task.id)
}

function openTaskModal() {
  store.openModal('task', { taskId: props.task.id })
}

async function addSubtask() {
  await store.createTask({
    name: 'Alt Görev',
    parentId: props.task.id,
    color: props.task.color
  })
  // Expand if collapsed
  if (isCollapsed.value) {
    toggleCollapse()
  }
}
</script>

<template>
  <!-- Task List Row -->
  <div 
    v-if="mode === 'list'"
    class="h-10 flex items-center px-2 border-b border-surface-100 hover:bg-surface-50 group"
    :style="{ paddingLeft: `${task.level * 20 + 8}px` }"
  >
    <!-- Expand/Collapse Button -->
    <button
      v-if="hasChildren"
      @click="toggleCollapse"
      class="w-5 h-5 flex items-center justify-center text-surface-400 hover:text-surface-600 shrink-0"
    >
      <Icon 
        :name="isCollapsed ? 'ph:caret-right' : 'ph:caret-down'" 
        class="w-3 h-3"
      />
    </button>
    <div v-else class="w-5 shrink-0" />
    
    <!-- Color Dot -->
    <div 
      class="w-2.5 h-2.5 rounded-full shrink-0 mr-2"
      :style="{ backgroundColor: barColor }"
    />
    
    <!-- Task Name -->
    <button
      @click="openTaskModal"
      class="flex-1 text-left text-sm text-surface-800 truncate hover:text-surface-900"
    >
      {{ task.name }}
    </button>
    
    <!-- Actions -->
    <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        @click="addSubtask"
        class="p-1 rounded text-surface-400 hover:text-surface-600 hover:bg-surface-200"
        title="Alt Görev Ekle"
      >
        <Icon name="ph:plus" class="w-3 h-3" />
      </button>
      <button
        @click="openTaskModal"
        class="p-1 rounded text-surface-400 hover:text-surface-600 hover:bg-surface-200"
        title="Düzenle"
      >
        <Icon name="ph:pencil-simple" class="w-3 h-3" />
      </button>
    </div>
  </div>
  
  <!-- Chart Row -->
  <div 
    v-else
    class="h-10 relative border-b border-surface-100"
  >
    <GanttBar
      :task="task"
      :style="barStyle"
      :color="barColor"
    />
  </div>
</template>

