import type { Project, Task, AppSettings } from '~/types'

const PROJECTS_KEY = 'gantt-projects'
const TASKS_KEY = 'gantt-tasks'
const SETTINGS_KEY = 'gantt-settings'

// UUID oluştur
function generateId(): string {
  return crypto.randomUUID()
}

// Timestamp
function now(): number {
  return Date.now()
}

// LocalStorage helpers
function getFromStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue
  const stored = localStorage.getItem(key)
  if (stored) {
    try {
      return JSON.parse(stored)
    } catch {
      return defaultValue
    }
  }
  return defaultValue
}

function saveToStorage<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify(data))
}

// Composable
export function useDatabase() {
  
  // ========== PROJECTS ==========
  
  async function getAllProjects(): Promise<Project[]> {
    const projects = getFromStorage<Project[]>(PROJECTS_KEY, [])
    return projects.sort((a, b) => b.createdAt - a.createdAt)
  }
  
  async function getProject(id: string): Promise<Project | undefined> {
    const projects = getFromStorage<Project[]>(PROJECTS_KEY, [])
    return projects.find(p => p.id === id)
  }
  
  async function createProject(data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const projects = getFromStorage<Project[]>(PROJECTS_KEY, [])
    const project: Project = {
      ...data,
      id: generateId(),
      createdAt: now(),
      updatedAt: now()
    }
    projects.push(project)
    saveToStorage(PROJECTS_KEY, projects)
    return project
  }
  
  async function updateProject(id: string, data: Partial<Omit<Project, 'id' | 'createdAt'>>): Promise<void> {
    const projects = getFromStorage<Project[]>(PROJECTS_KEY, [])
    const index = projects.findIndex(p => p.id === id)
    if (index !== -1) {
      projects[index] = { ...projects[index], ...data, updatedAt: now() }
      saveToStorage(PROJECTS_KEY, projects)
    }
  }
  
  async function deleteProject(id: string): Promise<void> {
    // Önce projeye ait tüm görevleri sil
    let tasks = getFromStorage<Task[]>(TASKS_KEY, [])
    tasks = tasks.filter(t => t.projectId !== id)
    saveToStorage(TASKS_KEY, tasks)
    
    // Sonra projeyi sil
    let projects = getFromStorage<Project[]>(PROJECTS_KEY, [])
    projects = projects.filter(p => p.id !== id)
    saveToStorage(PROJECTS_KEY, projects)
  }
  
  // ========== TASKS ==========
  
  async function getTasksByProject(projectId: string): Promise<Task[]> {
    const tasks = getFromStorage<Task[]>(TASKS_KEY, [])
    return tasks
      .filter(t => t.projectId === projectId)
      .sort((a, b) => a.order - b.order)
  }
  
  async function getTask(id: string): Promise<Task | undefined> {
    const tasks = getFromStorage<Task[]>(TASKS_KEY, [])
    return tasks.find(t => t.id === id)
  }
  
  async function createTask(data: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    const tasks = getFromStorage<Task[]>(TASKS_KEY, [])
    const task: Task = {
      ...data,
      id: generateId(),
      createdAt: now(),
      updatedAt: now()
    }
    tasks.push(task)
    saveToStorage(TASKS_KEY, tasks)
    return task
  }
  
  async function updateTask(id: string, data: Partial<Omit<Task, 'id' | 'createdAt'>>): Promise<void> {
    const tasks = getFromStorage<Task[]>(TASKS_KEY, [])
    const index = tasks.findIndex(t => t.id === id)
    if (index !== -1) {
      tasks[index] = { ...tasks[index], ...data, updatedAt: now() }
      saveToStorage(TASKS_KEY, tasks)
    }
  }
  
  async function deleteTask(id: string): Promise<void> {
    let tasks = getFromStorage<Task[]>(TASKS_KEY, [])
    
    // Alt görevleri de bul ve sil (recursive)
    const idsToDelete = new Set<string>()
    
    function findDescendants(parentId: string) {
      idsToDelete.add(parentId)
      tasks.filter(t => t.parentId === parentId).forEach(t => findDescendants(t.id))
    }
    
    findDescendants(id)
    
    tasks = tasks.filter(t => !idsToDelete.has(t.id))
    saveToStorage(TASKS_KEY, tasks)
  }
  
  async function getNextOrder(projectId: string, parentId?: string): Promise<number> {
    const tasks = getFromStorage<Task[]>(TASKS_KEY, [])
    const filteredTasks = tasks.filter(t => 
      t.projectId === projectId && 
      (parentId ? t.parentId === parentId : !t.parentId)
    )
    return filteredTasks.length > 0 ? Math.max(...filteredTasks.map(t => t.order)) + 1 : 0
  }
  
  // ========== BULK OPERATIONS ==========
  
  async function importData(projects: Project[], tasks: Task[]): Promise<void> {
    saveToStorage(PROJECTS_KEY, projects)
    saveToStorage(TASKS_KEY, tasks)
  }
  
  async function exportData(): Promise<{ projects: Project[]; tasks: Task[] }> {
    const projects = getFromStorage<Project[]>(PROJECTS_KEY, [])
    const tasks = getFromStorage<Task[]>(TASKS_KEY, [])
    return { projects, tasks }
  }
  
  async function clearAllData(): Promise<void> {
    saveToStorage(PROJECTS_KEY, [])
    saveToStorage(TASKS_KEY, [])
  }
  
  return {
    // Projects
    getAllProjects,
    getProject,
    createProject,
    updateProject,
    deleteProject,
    
    // Tasks
    getTasksByProject,
    getTask,
    createTask,
    updateTask,
    deleteTask,
    getNextOrder,
    
    // Bulk
    importData,
    exportData,
    clearAllData
  }
}

// ========== SETTINGS ==========

export function useSettings() {
  function getSettings(): AppSettings {
    return getFromStorage<AppSettings>(SETTINGS_KEY, {
      theme: 'light',
      defaultViewMode: 'year'
    })
  }
  
  function saveSettings(settings: AppSettings): void {
    saveToStorage(SETTINGS_KEY, settings)
  }
  
  function updateSettings(partial: Partial<AppSettings>): void {
    const current = getSettings()
    saveSettings({ ...current, ...partial })
  }
  
  return {
    getSettings,
    saveSettings,
    updateSettings
  }
}
