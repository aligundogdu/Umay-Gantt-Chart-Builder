import { defineStore } from 'pinia'
import type {
  Project,
  Task,
  TaskNode,
  ViewMode,
  DateRange,
  ModalType,
  GanttColor,
  TaskSortMode
} from '~/types'
import { GANTT_COLORS } from '../types/index.ts'
import {
  getTimelineRange,
  getRangeCenter,
  shiftRange,
  getMonthsInRange,
  getDefaultProjectDates,
  getDefaultTaskDates,
  isDateInRange,
  toISODate,
  addDays,
  parseDate
} from '../utils/dates.ts'
import {
  buildTaskTree,
  canReparent,
  collectDescendantIds,
  collectTreeOrder,
  collectSearchVisibility
} from '../utils/tasks.ts'
import { useDatabase, useSettings, generateId, StorageError } from '../composables/useDatabase.ts'

export const useGanttStore = defineStore('gantt', () => {
  // ========== STATE ==========

  // Projeler
  const projects = ref<Project[]>([])
  const currentProjectId = ref<string | null>(null)

  // Görevler
  const tasks = ref<Task[]>([])

  // UI State
  // Görev listesi sıralaması. 'date' yalnızca görüntülemeyi etkiler,
  // görevlerin order alanı korunur ve geçiş her an geri alınabilir.
  const sortMode = ref<TaskSortMode>('manual')

  // Sürükleme boyunca sıralamayı dondurur.
  // Tarih modunda bar sürüklenirken başlangıç tarihi her hareket ettiğinde
  // değiştiği için satır anında yeniden sıralanıyor, liste aşağı kaydırılmışsa
  // sürüklenen görev ekrandan çıkıyordu. Sıra bırakılınca çözülür.
  const pinnedOrder = ref<Map<string, number> | null>(null)

  // Görev listesi araması. Yalnızca görüntülemeyi filtreler, veriye dokunmaz.
  const searchQuery = ref('')

  const viewMode = ref<ViewMode>('2year')
  const dateRange = ref<DateRange>(getTimelineRange('2year'))
  const isLoading = ref(false)

  // Modal State
  const activeModal = ref<ModalType>(null)
  const editingTaskId = ref<string | null>(null)
  const editingProjectId = ref<string | null>(null)

  // View Only Mode (salt okunur mod)
  const isViewOnly = ref(false)
  // Salt okunur moda girerken kullanıcının kendi projeleri saklanır,
  // moddan çıkınca geri yüklenebilsin diye.
  const hasOwnData = ref(false)

  // Kullanıcıya gösterilecek son hata (depolama kotası gibi)
  const errorMessage = ref('')

  // ========== GETTERS ==========

  const currentProject = computed(() => {
    return projects.value.find(p => p.id === currentProjectId.value) || null
  })

  const currentTasks = computed(() => {
    if (!currentProjectId.value) return []
    return tasks.value.filter(t => t.projectId === currentProjectId.value)
  })

  const taskTree = computed((): TaskNode[] => {
    return buildTaskTree(currentTasks.value, sortMode.value, pinnedOrder.value)
  })

  const isDateSorted = computed(() => sortMode.value === 'date')

  // ----- Arama -----

  const isSearching = computed(() => searchQuery.value.trim().length > 0)

  // Aramanın listeye yansıması. Arama yoksa null (filtre uygulanmaz).
  const searchVisibility = computed(() => {
    return collectSearchVisibility(currentTasks.value, searchQuery.value)
  })

  // Yalnızca gerçekten eşleşenler; ata ve alt görevler bağlam olarak durur.
  const searchMatchIds = computed(() => searchVisibility.value?.matches || new Set<string>())

  const searchResultCount = computed(() => searchMatchIds.value.size)

  // Tarihe göre sıralama açıkken elle sıralama anlamsız olur.
  // Arama açıkken de engellenir: filtrelenmiş listede komşu görünen iki satır
  // gerçekte kardeş olmayabilir, bırakma sonucu beklenmedik olur.
  const canReorder = computed(
    () => !isViewOnly.value && sortMode.value === 'manual' && !isSearching.value
  )

  // Collapse durumu artık görevin kendisinde saklanıyor (kalıcı)
  const collapsedTaskIds = computed(() => {
    return new Set(currentTasks.value.filter(t => t.collapsed).map(t => t.id))
  })

  // Flatten edilmiş görev listesi (görünür olanlar)
  const flattenedTasks = computed((): TaskNode[] => {
    const result: TaskNode[] = []
    const collapsed = collapsedTaskIds.value
    const search = searchVisibility.value

    function traverse(nodes: TaskNode[]) {
      for (const node of nodes) {
        if (search && !search.visible.has(node.id)) continue
        result.push(node)
        if (node.children.length === 0) continue
        // Altında eşleşme varsa kapalı düğüm zorla açılır, aksi halde
        // sonuç listede hiç görünmezdi.
        const forceOpen = search ? search.expand.has(node.id) : false
        if (forceOpen || !collapsed.has(node.id)) {
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

  // ========== YARDIMCILAR ==========

  // Yazma işlemlerini sarar: salt okunur modda engeller, depolama
  // hatalarını yakalayıp kullanıcıya gösterilecek mesaja çevirir.
  async function guardedWrite<T>(operation: () => Promise<T>): Promise<T | null> {
    if (isViewOnly.value) return null

    try {
      return await operation()
    } catch (error) {
      if (error instanceof StorageError) {
        errorMessage.value = error.message
      } else {
        errorMessage.value = 'Beklenmeyen bir hata oluştu.'
        console.error(error)
      }
      return null
    }
  }

  function clearError() {
    errorMessage.value = ''
  }

  function patchTaskLocal(id: string, data: Partial<Task>) {
    const index = tasks.value.findIndex(t => t.id === id)
    if (index !== -1) {
      tasks.value[index] = { ...tasks.value[index], ...data }
    }
  }

  // Timeline'ı verilen tarihi kapsayacak şekilde konumlandırır
  function focusOn(date: Date | string) {
    dateRange.value = getTimelineRange(viewMode.value, date)
  }

  // ========== ACTIONS ==========

  // Projeleri yükle
  async function loadProjects() {
    const db = useDatabase()
    isLoading.value = true
    try {
      // Eski/eksik kayıtları bir kez güvenli hale getir
      await db.migrateStorage().catch(() => false)

      projects.value = await db.getAllProjects()
      hasOwnData.value = projects.value.length > 0

      // Son açılan projeyi seç veya ilk projeyi
      const settings = useSettings()
      const stored = settings.getSettings()
      sortMode.value = stored.taskSortMode === 'date' ? 'date' : 'manual'
      const lastProjectId = stored.lastOpenedProjectId

      if (lastProjectId && projects.value.some(p => p.id === lastProjectId)) {
        await selectProject(lastProjectId)
      } else if (projects.value.length > 0) {
        await selectProject(projects.value[0].id)
      } else {
        currentProjectId.value = null
        tasks.value = []
      }
    } finally {
      isLoading.value = false
    }
  }

  // Proje seç
  async function selectProject(projectId: string) {
    // Salt okunur modda proje listesi paylaşılan tek projeden ibaret ve
    // bu proje localStorage'da yok. Seçim yapılırsa görevler boşalıyordu.
    if (isViewOnly.value) return

    const db = useDatabase()
    pinnedOrder.value = null
    // Arama önceki projeye aitti, başka projeye geçilirken sıfırlanır.
    // Aynı proje yeniden yükleniyorsa (başka sekme veri yazdı) kullanıcının
    // yazdığı arama silinmemeli.
    if (currentProjectId.value !== projectId) searchQuery.value = ''
    currentProjectId.value = projectId
    tasks.value = await db.getTasksByProject(projectId)

    // Timeline'ı projeye göre konumlandır: bugün proje aralığındaysa
    // bugüne, değilse projenin başlangıcına odaklan. Önceden her zaman
    // bugün merkezliydi ve ileri tarihli projeler boş görünüyordu.
    const project = projects.value.find(p => p.id === projectId)
    if (project) {
      const today = new Date()
      const withinProject =
        parseDate(project.startDate) <= today && today <= parseDate(project.endDate)
      focusOn(withinProject ? today : project.startDate)
    }

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
    return guardedWrite(async () => {
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
      hasOwnData.value = true
      await selectProject(project.id)
      return project
    })
  }

  // Proje güncelle
  async function updateProject(id: string, data: Partial<Project>) {
    return guardedWrite(async () => {
      const db = useDatabase()
      await db.updateProject(id, data)
      const index = projects.value.findIndex(p => p.id === id)
      if (index !== -1) {
        projects.value[index] = { ...projects.value[index], ...data }
      }
    })
  }

  // Proje sil
  async function deleteProject(id: string) {
    return guardedWrite(async () => {
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
    })
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
    progress?: number
    completed?: boolean
  }) {
    if (!currentProjectId.value) return null

    return guardedWrite(async () => {
      const db = useDatabase()
      const projectId = currentProjectId.value!

      let taskStartDate: string
      let taskEndDate: string

      // Eğer parent varsa, parent'ın başlangıcından 2 gün sonra başlasın
      const parentTask = data.parentId
        ? tasks.value.find(t => t.id === data.parentId)
        : undefined

      if (parentTask && !data.startDate) {
        const subtaskStart = addDays(parentTask.startDate, 2)
        taskStartDate = toISODate(subtaskStart)
        taskEndDate = data.endDate || toISODate(addDays(subtaskStart, 14))
      } else {
        const defaults = getDefaultTaskDates()
        taskStartDate = data.startDate || defaults.startDate
        taskEndDate = data.endDate || defaults.endDate
      }

      const order = await db.getNextOrder(projectId, data.parentId)

      const task = await db.createTask({
        projectId,
        parentId: data.parentId || undefined,
        name: data.name,
        description: data.description || undefined,
        notes: data.notes || undefined,
        startDate: taskStartDate,
        endDate: taskEndDate,
        progress: data.completed ? 100 : (data.progress || 0),
        color: data.color || nextColor.value,
        dependencies: data.dependencies || [],
        order,
        collapsed: false,
        completed: data.completed === true
      })

      tasks.value.push(task)
      return task
    })
  }

  // Görev güncelle
  async function updateTask(id: string, data: Partial<Task>) {
    return guardedWrite(async () => {
      const db = useDatabase()
      await db.updateTask(id, data)
      patchTaskLocal(id, data)
    })
  }

  // Sürükleme sırasında yalnızca bellekte günceller.
  // Her mousemove'da localStorage'a yazmak tüm görev dizisini yeniden
  // serileştiriyordu; kalıcı yazma commitTaskDates ile bir kez yapılır.
  function previewTaskDates(id: string, startDate: string, endDate: string) {
    if (isViewOnly.value) return
    patchTaskLocal(id, { startDate, endDate })
  }

  async function commitTaskDates(id: string, startDate: string, endDate: string) {
    return updateTask(id, { startDate, endDate })
  }

  // Görev sil
  async function deleteTask(id: string) {
    return guardedWrite(async () => {
      const db = useDatabase()
      const deleteIds = collectDescendantIds(tasks.value, id)
      deleteIds.add(id)

      // db.deleteTask alt görevleri ve bağımlılık referanslarını
      // tek yazma işleminde temizler
      await db.deleteTask(id)

      tasks.value = tasks.value
        .filter(t => !deleteIds.has(t.id))
        .map(t => t.dependencies.some(d => deleteIds.has(d))
          ? { ...t, dependencies: t.dependencies.filter(d => !deleteIds.has(d)) }
          : t)
    })
  }

  // Görevleri yeniden sırala (drag & drop için).
  // Farklı üst göreve bırakma da desteklenir: görev hedefin kardeşi olur.
  async function reorderTasks(draggedId: string, targetId: string, position: 'before' | 'after') {
    if (draggedId === targetId) return
    // Tarihe göre sıralama açıkken elle sıra değişikliği ekrana yansımaz,
    // sessizce order yazmak yerine engelle
    if (sortMode.value === 'date') {
      errorMessage.value = 'Elle sıralamak için önce tarih sıralamasını kapatın.'
      return
    }

    return guardedWrite(async () => {
      const db = useDatabase()
      const draggedTask = tasks.value.find(t => t.id === draggedId)
      const targetTask = tasks.value.find(t => t.id === targetId)

      if (!draggedTask || !targetTask) return

      const newParentId = targetTask.parentId

      // Bir görev kendi alt ağacının içine taşınamaz
      if (!canReparent(tasks.value, draggedId, newParentId)) return

      const siblings = tasks.value
        .filter(t =>
          t.projectId === draggedTask.projectId &&
          t.parentId === newParentId &&
          t.id !== draggedId
        )
        .sort((a, b) => a.order - b.order)

      const targetIndex = siblings.findIndex(t => t.id === targetId)
      if (targetIndex === -1) return

      const insertIndex = position === 'before' ? targetIndex : targetIndex + 1
      siblings.splice(insertIndex, 0, draggedTask)

      const updates: { id: string; data: Partial<Task> }[] = []
      siblings.forEach((sibling, index) => {
        const parentChanged = sibling.id === draggedId && sibling.parentId !== newParentId
        if (sibling.order !== index || parentChanged) {
          updates.push({
            id: sibling.id,
            data: parentChanged
              ? { order: index, parentId: newParentId }
              : { order: index }
          })
        }
      })

      // Tek yazma işlemi
      await db.updateTasks(updates)
      updates.forEach(u => patchTaskLocal(u.id, u.data))
    })
  }

  // Görevi kardeşleri arasında bir sıra yukarı/aşağı taşır.
  // Dokunmatik cihazlarda HTML5 sürükle-bırak çalışmadığı için gerekli.
  async function moveTask(taskId: string, direction: 'up' | 'down') {
    const task = tasks.value.find(t => t.id === taskId)
    if (!task) return

    const siblings = tasks.value
      .filter(t => t.projectId === task.projectId && t.parentId === task.parentId)
      .sort((a, b) => a.order - b.order)

    const index = siblings.findIndex(t => t.id === taskId)
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= siblings.length) return

    return reorderTasks(taskId, siblings[targetIndex].id, direction === 'up' ? 'before' : 'after')
  }

  // Görevin üst görevini değiştir
  async function setTaskParent(taskId: string, parentId?: string) {
    const task = tasks.value.find(t => t.id === taskId)
    if (!task) return
    if ((task.parentId || undefined) === (parentId || undefined)) return
    if (!canReparent(tasks.value, taskId, parentId)) {
      errorMessage.value = 'Bir görev kendi alt görevinin altına taşınamaz.'
      return
    }

    return guardedWrite(async () => {
      const db = useDatabase()
      const order = await db.getNextOrder(task.projectId, parentId)
      const data: Partial<Task> = { parentId: parentId || undefined, order }
      await db.updateTask(taskId, data)
      patchTaskLocal(taskId, data)
    })
  }

  // Aramayı ayarla / temizle
  function setSearchQuery(value: string) {
    searchQuery.value = value
  }

  function clearSearch() {
    searchQuery.value = ''
  }

  // Görevi bitti / bitmedi olarak işaretle.
  // Bitirmek ilerlemeyi de %100'e çeker; geri alındığında ilerleme
  // kullanıcının bıraktığı değerde kalır, sessizce sıfırlanmaz.
  async function toggleTaskCompleted(taskId: string) {
    const task = tasks.value.find(t => t.id === taskId)
    if (!task) return

    const completed = !task.completed
    return updateTask(taskId, completed ? { completed, progress: 100 } : { completed })
  }

  // Görevi collapse/expand (kalıcı)
  async function toggleTaskCollapse(taskId: string) {
    const task = tasks.value.find(t => t.id === taskId)
    if (!task) return

    const collapsed = !task.collapsed

    // Salt okunur modda da açılıp kapanabilsin, sadece kaydedilmesin
    if (isViewOnly.value) {
      patchTaskLocal(taskId, { collapsed })
      return
    }

    return updateTask(taskId, { collapsed })
  }

  // Sürükleme başladı: mevcut sırayı sabitle.
  // Yalnızca tarih modunda anlamlı, manuel modda sıra zaten değişmiyor.
  function beginTaskDrag() {
    if (sortMode.value !== 'date') return
    const ids = collectTreeOrder(taskTree.value)
    pinnedOrder.value = new Map(ids.map((id, index) => [id, index]))
  }

  // Sürükleme bitti: sıra yeniden hesaplansın
  function endTaskDrag() {
    pinnedOrder.value = null
  }

  const isSortPinned = computed(() => pinnedOrder.value !== null)

  // Sıralama modunu değiştir. Veriye dokunmaz, sadece görüntüleme sırası.
  function setSortMode(mode: TaskSortMode) {
    // Mod değişince donmuş sıra anlamını yitirir
    pinnedOrder.value = null
    sortMode.value = mode
    useSettings().updateSettings({ taskSortMode: mode })
  }

  function toggleSortMode() {
    setSortMode(sortMode.value === 'manual' ? 'date' : 'manual')
  }

  // View mode değiştir. Bakılan konum korunur, bugüne geri atlanmaz.
  function setViewMode(mode: ViewMode) {
    const center = getRangeCenter(dateRange.value)
    viewMode.value = mode
    dateRange.value = getTimelineRange(mode, center)
  }

  // Timeline'ı kaydır. Tam ay adımlarıyla kaydırılır ki aylık ızgara
  // hizası ve dolayısıyla bar konumları bozulmasın.
  function scrollTimeline(direction: 'prev' | 'next') {
    const monthCount = getMonthsInRange(dateRange.value).length
    const step = Math.max(1, Math.round(monthCount / 2))
    dateRange.value = shiftRange(dateRange.value, direction === 'next' ? step : -step)
  }

  // Bugüne dön
  function goToToday() {
    focusOn(new Date())
  }

  const isTodayVisible = computed(() => isDateInRange(new Date(), dateRange.value))

  // ========== MODAL ==========

  function openModal(type: ModalType, options?: { taskId?: string; projectId?: string }) {
    activeModal.value = type
    editingTaskId.value = options?.taskId || null
    editingProjectId.value = options?.projectId || null
  }

  function closeModal() {
    activeModal.value = null
    editingTaskId.value = null
    editingProjectId.value = null
  }

  // ========== IMPORT / EXPORT ==========

  // Üzerine yazan içe aktarma. Öncesinde otomatik yedek alınır.
  async function importData(importProjects: Project[], importTasks: Task[]) {
    return guardedWrite(async () => {
      const db = useDatabase()
      await db.createBackup()
      await db.replaceAll(importProjects, importTasks)
      await loadProjects()
    })
  }

  // Mevcut veriyi koruyarak ekler. Çakışmaları önlemek için yeni id üretir.
  async function mergeData(importProjects: Project[], importTasks: Task[]) {
    return guardedWrite(async () => {
      const db = useDatabase()
      const idMap = new Map<string, string>()

      importProjects.forEach(p => idMap.set(p.id, generateId()))
      importTasks.forEach(t => idMap.set(t.id, generateId()))

      const now = Date.now()
      const newProjects: Project[] = importProjects.map(p => ({
        ...p,
        id: idMap.get(p.id)!,
        createdAt: now,
        updatedAt: now
      }))

      const newTasks: Task[] = importTasks.map(t => ({
        ...t,
        id: idMap.get(t.id)!,
        projectId: idMap.get(t.projectId) || t.projectId,
        parentId: t.parentId ? idMap.get(t.parentId) : undefined,
        dependencies: t.dependencies
          .map(d => idMap.get(d))
          .filter((d): d is string => Boolean(d)),
        createdAt: now,
        updatedAt: now
      }))

      await db.appendAll(newProjects, newTasks)
      await loadProjects()

      if (newProjects.length > 0) {
        await selectProject(newProjects[0].id)
      }
    })
  }

  // Salt okunur modda paylaşılan projeyi yükle (kaydetmeden)
  async function loadSharedProjectViewOnly(project: Project, projectTasks: Task[]) {
    const db = useDatabase()
    // Kullanıcının kendi verisi duruyor mu? Moddan çıkarken geri yüklenecek.
    const own = await db.getAllProjects()
    hasOwnData.value = own.length > 0

    isViewOnly.value = true
    projects.value = [project]
    currentProjectId.value = project.id
    tasks.value = projectTasks
    focusOn(project.startDate)
  }

  // Salt okunur moddan çık ve kullanıcının kendi verisine dön
  async function exitViewOnly() {
    isViewOnly.value = false
    await loadProjects()
  }

  // Paylaşılan projeyi import et (mevcut verileri silmeden)
  async function importSharedProject(project: Project, projectTasks: Task[]) {
    return mergeData([project], projectTasks)
  }

  // Export için data
  async function getExportData() {
    const db = useDatabase()
    return await db.exportData()
  }

  // Tüm veriyi temizle. Öncesinde otomatik yedek alınır.
  async function clearAllData() {
    return guardedWrite(async () => {
      const db = useDatabase()
      await db.createBackup()
      await db.clearAllData()
      projects.value = []
      tasks.value = []
      currentProjectId.value = null
      hasOwnData.value = false
    })
  }

  // Son otomatik yedeği geri yükle
  async function restoreBackup() {
    return guardedWrite(async () => {
      const db = useDatabase()
      const restored = await db.restoreBackup()
      if (restored) await loadProjects()
      return restored
    })
  }

  function setViewOnly(value: boolean) {
    isViewOnly.value = value
  }

  return {
    // State
    projects,
    currentProjectId,
    tasks,
    sortMode,
    searchQuery,
    viewMode,
    dateRange,
    isLoading,
    activeModal,
    editingTaskId,
    editingProjectId,
    isViewOnly,
    hasOwnData,
    errorMessage,

    // Getters
    currentProject,
    currentTasks,
    taskTree,
    flattenedTasks,
    collapsedTaskIds,
    editingTask,
    editingProject,
    nextColor,
    isTodayVisible,
    isDateSorted,
    canReorder,
    isSortPinned,
    isSearching,
    searchMatchIds,
    searchResultCount,

    // Actions
    loadProjects,
    selectProject,
    createProject,
    updateProject,
    deleteProject,
    createTask,
    updateTask,
    previewTaskDates,
    commitTaskDates,
    deleteTask,
    reorderTasks,
    moveTask,
    setTaskParent,
    toggleTaskCollapse,
    toggleTaskCompleted,
    setSearchQuery,
    clearSearch,
    setSortMode,
    toggleSortMode,
    beginTaskDrag,
    endTaskDrag,
    setViewMode,
    scrollTimeline,
    goToToday,
    openModal,
    closeModal,
    importData,
    mergeData,
    importSharedProject,
    loadSharedProjectViewOnly,
    exitViewOnly,
    getExportData,
    clearAllData,
    restoreBackup,
    setViewOnly,
    clearError
  }
})
