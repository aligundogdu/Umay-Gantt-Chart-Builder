import { defineStore } from 'pinia'
import type { 
  Project, 
  Task, 
  TaskNode, 
  ViewMode, 
  DateRange, 
  ModalType,
  GanttColor 
} from '~/types'
import { GANTT_COLORS } from '~/types'
import { 
  getTimelineRange, 
  getDefaultProjectDates, 
  getDefaultTaskDates 
} from '~/utils/dates'
import { buildTaskTree } from '~/utils/mermaid'
import { useDatabase, useSettings } from '~/composables/useDatabase'

export const useGanttStore = defineStore('gantt', () => {
  // ========== STATE ==========
  
  // Projeler
  const projects = ref<Project[]>([])
  const currentProjectId = ref<string | null>(null)
  
  // Görevler
  const tasks = ref<Task[]>([])
  
  // UI State
  const viewMode = ref<ViewMode>('2year')
  const dateRange = ref<DateRange>(getTimelineRange('2year'))
  const isLoading = ref(false)
  
  // Modal State
  const activeModal = ref<ModalType>(null)
  const editingTaskId = ref<string | null>(null)
  const editingProjectId = ref<string | null>(null)
  
  // Collapsed tasks (ID set)
  const collapsedTasks = ref<Set<string>>(new Set())
  
  // ========== GETTERS ==========
  
  const currentProject = computed(() => {
    return projects.value.find(p => p.id === currentProjectId.value) || null
  })
  
  const currentTasks = computed(() => {
    if (!currentProjectId.value) return []
    return tasks.value.filter(t => t.projectId === currentProjectId.value)
  })
  
  const taskTree = computed((): TaskNode[] => {
    return buildTaskTree(currentTasks.value)
  })
  
  // Flatten edilmiş görev listesi (görünür olanlar)
  const flattenedTasks = computed((): TaskNode[] => {
    const result: TaskNode[] = []
    
    function traverse(nodes: TaskNode[]) {
      for (const node of nodes) {
        result.push(node)
        if (node.children.length > 0 && !collapsedTasks.value.has(node.id)) {
          traverse(node.children)
        }
      }
    }
    
    traverse(taskTree.value)
    return result
  })
  
  const editingTask = computed(() => {
    if (!editingTaskId.value) return null
    return tasks.value.find(t => t.id === editingTaskId.value) || null
  })
  
  const editingProject = computed(() => {
    if (!editingProjectId.value) return null
    return projects.value.find(p => p.id === editingProjectId.value) || null
  })
  
  // Bir sonraki renk (döngüsel)
  const nextColor = computed((): GanttColor => {
    const usedColors = currentTasks.value.map(t => t.color)
    const colorCounts = GANTT_COLORS.map(c => ({
      color: c,
      count: usedColors.filter(uc => uc === c).length
    }))
    colorCounts.sort((a, b) => a.count - b.count)
    return colorCounts[0].color
  })
  
  // ========== ACTIONS ==========
  
  // Projeleri yükle
  async function loadProjects() {
    const db = useDatabase()
    isLoading.value = true
    try {
      projects.value = await db.getAllProjects()
      
      // Son açılan projeyi seç veya ilk projeyi
      const settings = useSettings()
      const lastProjectId = settings.getSettings().lastOpenedProjectId
      
      if (lastProjectId && projects.value.some(p => p.id === lastProjectId)) {
        await selectProject(lastProjectId)
      } else if (projects.value.length > 0) {
        await selectProject(projects.value[0].id)
      }
    } finally {
      isLoading.value = false
    }
  }
  
  // Proje seç
  async function selectProject(projectId: string) {
    const db = useDatabase()
    currentProjectId.value = projectId
    tasks.value = await db.getTasksByProject(projectId)
    collapsedTasks.value.clear()
    
    // Ayarlara kaydet
    const settings = useSettings()
    settings.updateSettings({ lastOpenedProjectId: projectId })
  }
  
  // Proje oluştur
  async function createProject(data: { 
    name: string
    description?: string
    color: GanttColor 
  }) {
    const db = useDatabase()
    const { startDate, endDate } = getDefaultProjectDates()
    const project = await db.createProject({
      name: data.name,
      description: data.description,
      startDate,
      endDate,
      color: data.color
    })
    projects.value.unshift(project)
    await selectProject(project.id)
    return project
  }
  
  // Proje güncelle
  async function updateProject(id: string, data: Partial<Project>) {
    const db = useDatabase()
    await db.updateProject(id, data)
    const index = projects.value.findIndex(p => p.id === id)
    if (index !== -1) {
      projects.value[index] = { ...projects.value[index], ...data }
    }
  }
  
  // Proje sil
  async function deleteProject(id: string) {
    const db = useDatabase()
    await db.deleteProject(id)
    projects.value = projects.value.filter(p => p.id !== id)
    
    if (currentProjectId.value === id) {
      if (projects.value.length > 0) {
        await selectProject(projects.value[0].id)
      } else {
        currentProjectId.value = null
        tasks.value = []
      }
    }
  }
  
  // Görev oluştur
  async function createTask(data: {
    name: string
    description?: string
    notes?: string
    startDate?: string
    endDate?: string
    color?: GanttColor
    parentId?: string
    dependencies?: string[]
  }) {
    const db = useDatabase()
    if (!currentProjectId.value) return null
    
    let taskStartDate: string
    let taskEndDate: string
    
    // Eğer parent varsa, parent'ın başlangıcından 2 gün sonra başlasın
    if (data.parentId && !data.startDate) {
      const parentTask = tasks.value.find(t => t.id === data.parentId)
      if (parentTask) {
        const parentStart = new Date(parentTask.startDate)
        const subtaskStart = new Date(parentStart)
        subtaskStart.setDate(subtaskStart.getDate() + 2) // 2 gün sonra
        
        const subtaskEnd = new Date(subtaskStart)
        subtaskEnd.setDate(subtaskEnd.getDate() + 14) // 2 haftalık süre
        
        taskStartDate = subtaskStart.toISOString().split('T')[0]
        taskEndDate = data.endDate || subtaskEnd.toISOString().split('T')[0]
      } else {
        const defaults = getDefaultTaskDates()
        taskStartDate = defaults.startDate
        taskEndDate = data.endDate || defaults.endDate
      }
    } else {
      const defaults = getDefaultTaskDates()
      taskStartDate = data.startDate || defaults.startDate
      taskEndDate = data.endDate || defaults.endDate
    }
    
    const order = await db.getNextOrder(currentProjectId.value, data.parentId)
    
    // Task objesi oluştur
    const taskData: any = {
      projectId: currentProjectId.value,
      name: data.name,
      startDate: taskStartDate,
      endDate: taskEndDate,
      progress: 0,
      color: data.color || nextColor.value,
      dependencies: data.dependencies || [],
      order,
      collapsed: false
    }
    
    // Optional alanları sadece değer varsa ekle
    if (data.parentId) taskData.parentId = data.parentId
    if (data.description) taskData.description = data.description
    if (data.notes) taskData.notes = data.notes
    
    const task = await db.createTask(taskData)
    
    tasks.value.push(task)
    return task
  }
  
  // Görev güncelle
  async function updateTask(id: string, data: Partial<Task>) {
    const db = useDatabase()
    await db.updateTask(id, data)
    const index = tasks.value.findIndex(t => t.id === id)
    if (index !== -1) {
      tasks.value[index] = { ...tasks.value[index], ...data }
    }
  }
  
  // Görev sil
  async function deleteTask(id: string) {
    const db = useDatabase()
    // Alt görevleri bul ve sil
    const deleteIds = new Set<string>()
    
    function findDescendants(taskId: string) {
      deleteIds.add(taskId)
      tasks.value
        .filter(t => t.parentId === taskId)
        .forEach(t => findDescendants(t.id))
    }
    
    findDescendants(id)
    
    await db.deleteTask(id)
    tasks.value = tasks.value.filter(t => !deleteIds.has(t.id))
    
    // Dependency'lerden kaldır
    for (const task of tasks.value) {
      if (task.dependencies.some(d => deleteIds.has(d))) {
        const newDeps = task.dependencies.filter(d => !deleteIds.has(d))
        await updateTask(task.id, { dependencies: newDeps })
      }
    }
  }
  
  // Görevi collapse/expand
  function toggleTaskCollapse(taskId: string) {
    if (collapsedTasks.value.has(taskId)) {
      collapsedTasks.value.delete(taskId)
    } else {
      collapsedTasks.value.add(taskId)
    }
  }
  
  // View mode değiştir
  function setViewMode(mode: ViewMode) {
    viewMode.value = mode
    dateRange.value = getTimelineRange(mode)
  }
  
  // Timeline'ı kaydır
  function scrollTimeline(direction: 'prev' | 'next') {
    const { start, end } = dateRange.value
    const diff = end.getTime() - start.getTime()
    const offset = direction === 'next' ? diff / 2 : -diff / 2
    
    dateRange.value = {
      start: new Date(start.getTime() + offset),
      end: new Date(end.getTime() + offset)
    }
  }
  
  // Modal aç
  function openModal(type: ModalType, options?: { taskId?: string; projectId?: string }) {
    activeModal.value = type
    editingTaskId.value = options?.taskId || null
    editingProjectId.value = options?.projectId || null
  }
  
  // Modal kapat
  function closeModal() {
    activeModal.value = null
    editingTaskId.value = null
    editingProjectId.value = null
  }
  
  // Import
  async function importData(importProjects: Project[], importTasks: Task[]) {
    const db = useDatabase()
    await db.importData(importProjects, importTasks)
    await loadProjects()
  }
  
  // Export için data
  async function getExportData() {
    const db = useDatabase()
    return await db.exportData()
  }
  
  // Tüm veriyi temizle
  async function clearAllData() {
    const db = useDatabase()
    await db.clearAllData()
    projects.value = []
    tasks.value = []
    currentProjectId.value = null
  }
  
  return {
    // State
    projects,
    currentProjectId,
    tasks,
    viewMode,
    dateRange,
    isLoading,
    activeModal,
    editingTaskId,
    editingProjectId,
    collapsedTasks,
    
    // Getters
    currentProject,
    currentTasks,
    taskTree,
    flattenedTasks,
    editingTask,
    editingProject,
    nextColor,
    
    // Actions
    loadProjects,
    selectProject,
    createProject,
    updateProject,
    deleteProject,
    createTask,
    updateTask,
    deleteTask,
    toggleTaskCollapse,
    setViewMode,
    scrollTimeline,
    openModal,
    closeModal,
    importData,
    getExportData,
    clearAllData
  }
})

