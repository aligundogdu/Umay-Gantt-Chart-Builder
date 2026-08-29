<script setup lang="ts">
import type { TaskNode } from '~/types'
import { GANTT_COLOR_MAP } from '~/types'
import { getBarGeometry } from '~/utils/geometry'
import { useGanttStore } from '~/stores/gantt'

const props = defineProps<{
  task: TaskNode
  mode: 'list' | 'chart'
  isLastChild?: boolean
  showConnector?: boolean
}>()

const emit = defineEmits<{
  (e: 'dragstart', taskId: string): void
  (e: 'dragend'): void
  (e: 'dragover', taskId: string, position: 'before' | 'after'): void
  (e: 'drop', taskId: string): void
  (e: 'move', taskId: string, direction: 'up' | 'down'): void
}>()

const store = useGanttStore()

// Drag state
const isDragging = ref(false)
const dropPosition = ref<'before' | 'after' | null>(null)

// Parent'tan timeline genişliğini al
const timelineWidth = inject<ComputedRef<number>>('timelineWidth')
const taskListWidth = inject<Ref<number>>('taskListWidth')

const hasChildren = computed(() => props.task.children.length > 0)
const isCollapsed = computed(() => store.collapsedTaskIds.has(props.task.id))
const isSubtask = computed(() => props.task.level > 0)
const isCompleted = computed(() => props.task.status === 'completed')
const isCancelled = computed(() => props.task.status === 'cancelled')
// Bitti ve iptal aynı görsel yeri paylaşır: ad üstü çizili, satır boyalı
const isClosed = computed(() => isCompleted.value || isCancelled.value)

// Durum rozeti yalnızca ada okunacak kadar yer kalıyorsa gösterilir.
// Derin alt görevlerde girinti ve eylem düğmeleri sütunu zaten yiyor,
// rozet eklenince addan tek harf kalıyordu. Rozet gizlense de durum
// soldaki dolu tikten ve satırın yeşil zemininden okunuyor.
const MIN_LIST_WIDTH_FOR_BADGE = 260

const showStatusBadge = computed(() => {
  if (!isClosed.value) return false
  const width = taskListWidth?.value ?? 280
  return width - props.task.level * 16 >= MIN_LIST_WIDTH_FOR_BADGE
})

// Arama sırasında üst görevler bağlam olsun diye listede kalır ama
// aramayla eşleşmez; soluk gösterilerek gerçek sonuçlardan ayrılır.
const isSearchDimmed = computed(
  () => store.isSearching && !store.searchMatchIds.has(props.task.id)
)

// Bar konumu. DependencyLines ile aynı yardımcıyı kullanır ki
// minimum genişlik uygulandığında bağlantı çizgileri barın ucundan kaymasın.
const barStyle = computed(() => {
  const { leftPx, widthPx } = getBarGeometry(props.task, store.dateRange, timelineWidth?.value || 1000)
  return {
    left: `${leftPx}px`,
    width: `${widthPx}px`
  }
})

const barColor = computed(() => GANTT_COLOR_MAP[props.task.color])

function toggleCollapse() {
  store.toggleTaskCollapse(props.task.id)
}

function toggleDone() {
  if (store.isViewOnly) return
  store.toggleTaskDone(props.task.id)
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

// Drag & Drop handlers
function handleDragStart(e: DragEvent) {
  if (!e.dataTransfer) return
  isDragging.value = true
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', props.task.id)
  emit('dragstart', props.task.id)
}

function handleDragEnd() {
  isDragging.value = false
  dropPosition.value = null
  emit('dragend')
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
  if (!e.dataTransfer) return
  e.dataTransfer.dropEffect = 'move'
  
  // Üst/alt yarıya göre pozisyon belirle
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const y = e.clientY - rect.top
  const position = y < rect.height / 2 ? 'before' : 'after'
  dropPosition.value = position
  emit('dragover', props.task.id, position)
}

function handleDragLeave() {
  dropPosition.value = null
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  dropPosition.value = null
  emit('drop', props.task.id)
}
</script>

<template>
  <!-- Task List Row -->
  <div 
    v-if="mode === 'list'"
    class="h-10 flex items-center border-b border-surface-100 hover:bg-surface-50 group relative transition-all"
    :class="[
      isCompleted ? 'bg-emerald-50/60' : '',
      isCancelled ? 'bg-surface-100/70' : '',
      isSearchDimmed ? 'opacity-60' : '',
      isDragging ? 'opacity-50' : '',
      dropPosition === 'before' ? 'ring-t-2 ring-blue-400' : '',
      dropPosition === 'after' ? 'ring-b-2 ring-blue-400' : ''
    ]"
    :draggable="store.canReorder"
    @dragstart="store.canReorder && handleDragStart($event)"
    @dragend="store.canReorder && handleDragEnd()"
    @dragover="store.canReorder && handleDragOver($event)"
    @dragleave="store.canReorder && handleDragLeave()"
    @drop="store.canReorder && handleDrop($event)"
  >
    <!-- Drop indicator line -->
    <div 
      v-if="dropPosition === 'before'"
      class="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 z-30"
    />
    <div 
      v-if="dropPosition === 'after'"
      class="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 z-30"
    />
    <!-- Tree connector lines for subtasks (L-shaped) -->
    <div 
      v-if="isSubtask"
      class="absolute top-0 h-full pointer-events-none"
      :style="{ left: `${(task.level - 1) * 16 + 12}px` }"
    >
      <!-- Vertical line -->
      <div 
        class="absolute left-0 top-0 bg-surface-400"
        :style="{
          width: '2px',
          height: isLastChild ? '50%' : '100%'
        }"
      />
      <!-- Horizontal line -->
      <div 
        class="absolute bg-surface-400"
        :style="{
          left: '0px',
          top: 'calc(50% - 1px)',
          width: '14px',
          height: '2px'
        }"
      />
      <!-- Dot -->
      <div 
        class="absolute bg-surface-400 rounded-full"
        :style="{
          left: '12px',
          top: 'calc(50% - 3px)',
          width: '6px',
          height: '6px'
        }"
      />
    </div>
    
    <!-- Content with padding -->
    <div 
      class="flex items-center flex-1 min-w-0 px-2 overflow-hidden"
      :style="{ paddingLeft: `${task.level * 16 + 8}px` }"
    >
      <!-- Drag Handle (only in edit mode) -->
      <div 
        v-if="store.canReorder"
        class="w-4 h-4 flex items-center justify-center text-surface-300 hover:text-surface-500 cursor-grab active:cursor-grabbing shrink-0 mr-1 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Icon name="ph:dots-six-vertical" class="w-3.5 h-3.5" />
      </div>
      
      <!-- Expand/Collapse Button -->
      <button
        v-if="hasChildren"
        @click="toggleCollapse"
        class="w-5 h-5 flex items-center justify-center text-surface-400 hover:text-surface-600 shrink-0"
        v-tip="isCollapsed ? 'Alt görevleri göster' : 'Alt görevleri gizle'"
        :aria-label="isCollapsed ? 'Alt görevleri göster' : 'Alt görevleri gizle'"
        :aria-expanded="!isCollapsed"
      >
        <Icon 
          :name="isCollapsed ? 'ph:caret-right' : 'ph:caret-down'" 
          class="w-3 h-3"
        />
      </button>
      <div v-else class="w-5 shrink-0" />
      
      <!-- Durum düğmesi.
           Normalde görevin renk noktası, üzerine gelince veya görev
           kapanmışsa durum işaretine dönüşür. Sütun dar olabildiği için
           ayrı bir kutu yerine renk noktasının yeri kullanılıyor.
           İptal edilmiş görevde tıklama iptali kaldırır. -->
      <button
        v-if="!store.isViewOnly"
        @click.stop="toggleDone"
        class="relative w-4 h-4 shrink-0 mr-1.5 md:mr-2 flex items-center justify-center rounded-full border transition-colors"
        :class="isCompleted
          ? 'bg-emerald-500 border-emerald-500 text-white'
          : isCancelled
            ? 'bg-surface-400 border-surface-400 text-white'
            : 'border-surface-300 md:border-transparent md:group-hover:border-surface-300 text-surface-400'"
        v-tip="isCompleted
          ? 'Bitti işaretini kaldır'
          : isCancelled ? 'İptali kaldır' : 'Bitti olarak işaretle'"
        :aria-label="isCompleted
          ? 'Bitti işaretini kaldır'
          : isCancelled ? 'İptali kaldır' : 'Bitti olarak işaretle'"
        :aria-pressed="isClosed"
      >
        <Icon v-if="isCancelled" name="ph:x-bold" class="w-2.5 h-2.5" />
        <Icon v-else-if="isCompleted" name="ph:check-bold" class="w-2.5 h-2.5" />
        <Icon v-else name="ph:check-bold" class="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
        <!-- Renk noktası: yalnızca üzerine gelinmemişken görünür -->
        <span
          v-if="!isClosed"
          class="absolute w-2 h-2 md:w-2.5 md:h-2.5 rounded-full group-hover:opacity-0 transition-opacity"
          :style="{ backgroundColor: barColor }"
        />
      </button>
      <div
        v-else
        class="w-4 h-4 shrink-0 mr-1.5 md:mr-2 flex items-center justify-center rounded-full"
        :class="isCompleted ? 'bg-emerald-500 text-white' : isCancelled ? 'bg-surface-400 text-white' : ''"
      >
        <Icon v-if="isCancelled" name="ph:x-bold" class="w-2.5 h-2.5" />
        <Icon v-else-if="isCompleted" name="ph:check-bold" class="w-2.5 h-2.5" />
        <span
          v-else
          class="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full"
          :style="{ backgroundColor: barColor }"
        />
      </div>
      
      <!-- Task Name -->
      <button
        v-if="!store.isViewOnly"
        @click="openTaskModal"
        class="flex-1 min-w-0 text-left text-xs md:text-sm truncate hover:text-surface-900"
        :class="isClosed ? 'line-through text-surface-400' : 'text-surface-800'"
      >
        {{ task.name }}
      </button>
      <span
        v-else
        class="flex-1 min-w-0 text-left text-xs md:text-sm truncate"
        :class="isClosed ? 'line-through text-surface-400' : 'text-surface-800'"
      >
        {{ task.name }}
      </span>

      <!-- Durum rozeti. Mobilde gizlenir: orada sıralama butonları zaten
           hep görünür ve rozet ada yer bırakmıyor; işaret olarak satırın
           zemini ve soldaki dolu işaret kalıyor. -->
      <span
        v-if="showStatusBadge"
        class="hidden md:inline-flex shrink-0 ml-1.5 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none"
        :class="isCancelled
          ? 'bg-surface-200 text-surface-600'
          : 'bg-emerald-100 text-emerald-700'"
      >
        <Icon :name="isCancelled ? 'ph:x-bold' : 'ph:check-bold'" class="w-2.5 h-2.5" />
        {{ isCancelled ? 'İptal' : 'Bitti' }}
      </span>
      
      <!-- Actions (only in edit mode).
           Mobilde her zaman görünür: dokunmatik cihazlarda hover yok ve
           HTML5 sürükle-bırak çalışmadığı için sıralama butonları tek yol. -->
      <div v-if="!store.isViewOnly" class="flex items-center gap-0.5 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity ml-1">
        <button
          v-if="store.canReorder"
          @click.stop="emit('move', task.id, 'up')"
          class="p-1 rounded text-surface-400 hover:text-surface-600 hover:bg-surface-200"
          v-tip="'Yukarı taşı'"
          aria-label="Yukarı taşı"
        >
          <Icon name="ph:caret-up" class="w-3 h-3" />
        </button>
        <button
          v-if="store.canReorder"
          @click.stop="emit('move', task.id, 'down')"
          class="p-1 rounded text-surface-400 hover:text-surface-600 hover:bg-surface-200"
          v-tip="'Aşağı taşı'"
          aria-label="Aşağı taşı"
        >
          <Icon name="ph:caret-down" class="w-3 h-3" />
        </button>
        <button
          @click.stop="addSubtask"
          class="p-1 rounded text-surface-400 hover:text-surface-600 hover:bg-surface-200"
          v-tip="'Alt görev ekle'"
          aria-label="Alt görev ekle"
        >
          <Icon name="ph:plus" class="w-3 h-3" />
        </button>
        <button
          @click.stop="openTaskModal"
          class="p-1 rounded text-surface-400 hover:text-surface-600 hover:bg-surface-200"
          v-tip="'Düzenle'"
          aria-label="Düzenle"
        >
          <Icon name="ph:pencil-simple" class="w-3 h-3" />
        </button>
      </div>
    </div>
  </div>
  
  <!-- Chart Row -->
  <div 
    v-else
    class="h-10 relative border-b border-surface-100"
    :class="isCompleted ? 'bg-emerald-50/50' : isCancelled ? 'bg-surface-100/60' : ''"
  >
    <GanttBar
      :task="task"
      :style="barStyle"
      :color="barColor"
    />
  </div>
</template>

