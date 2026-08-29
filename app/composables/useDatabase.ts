import type { Project, Task, AppSettings } from '~/types'
import { normalizeImport } from '../utils/tasks.ts'

const PROJECTS_KEY = 'gantt-projects'
const TASKS_KEY = 'gantt-tasks'
const SETTINGS_KEY = 'gantt-settings'
const BACKUP_KEY = 'gantt-backup'

export const STORAGE_KEYS = {
  projects: PROJECTS_KEY,
  tasks: TASKS_KEY,
  settings: SETTINGS_KEY,
  backup: BACKUP_KEY
}

// Depolama hatalarını çağıranın ayırt edebilmesi için özel hata tipi
export class StorageError extends Error {
  // Not: constructor parametre özelliği kullanılmıyor, Node'un tip
  // sıyırma modu (testler bu modda koşuyor) onu desteklemiyor.
  quotaExceeded: boolean

  constructor(message: string, quotaExceeded: boolean) {
    super(message)
    this.name = 'StorageError'
    this.quotaExceeded = quotaExceeded
  }
}

// UUID oluştur.
// crypto.randomUUID yalnızca güvenli bağlamda (https veya localhost) tanımlı.
// Telefondan http://192.168.x.x ile açıldığında proje oluşturma patlıyordu.
export function generateId(): string {
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined

  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID()
  }

  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  // Son çare
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// Timestamp
function now(): number {
  return Date.now()
}

// Depo düzeltmesi bu sekmede diske yazıldı mı? (bkz. migrateStorage)
let hasPersistedMigration = false

// LocalStorage helpers
function getFromStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue
  try {
    const stored = localStorage.getItem(key)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    return defaultValue
  }
  return defaultValue
}

// Bu sekmenin depoya yazdığı son içerikler.
// storage olayı yalnızca başka belgelerde tetiklenir, ama iki sekme
// birbirinin yazmasına yeniden yükleyerek yanıt verdiğinde olaylar
// ping-pong'a dönüşüyor ve uyarı sürekli tekrarlanıyordu. Gelen değer
// bizim yazdığımızla birebir aynıysa haber verilecek bir değişiklik yok.
const lastWritten = new Map<string, string>()

export function isEchoOfOwnWrite(key: string | null, value: string | null): boolean {
  if (!key || value === null) return false
  return lastWritten.get(key) === value
}

function saveToStorage<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return

  const serialized = JSON.stringify(data)

  try {
    localStorage.setItem(key, serialized)
    lastWritten.set(key, serialized)
  } catch (error) {
    // Kota dolduğunda sessizce kaybolmasın, çağıran katman uyarabilsin
    const quotaExceeded =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.code === 22)

    throw new StorageError(
      quotaExceeded
        ? 'Tarayıcı depolama alanı doldu. Veriler kaydedilemedi.'
        : 'Veriler kaydedilemedi.',
      quotaExceeded
    )
  }
}

// Composable
export function useDatabase() {

  // ========== PROJECTS ==========

  // Depodaki ham içeriği her okumada normalize eder.
  // migrateStorage yalnızca düzeltmeyi diske yazar ve bunu oturumda bir kez
  // yapar; okuma tarafı buna güvenemez, çünkü başka bir sekme her an eksik
  // alanlı kayıt yazabilir ve UI onu ham haliyle görmemeli.
  function readNormalized(): { projects: Project[]; tasks: Task[] } {
    const rawProjects = getFromStorage<unknown>(PROJECTS_KEY, [])
    const rawTasks = getFromStorage<unknown>(TASKS_KEY, [])
    const { projects, tasks } = normalizeImport(rawProjects, rawTasks)
    return { projects, tasks }
  }

  async function getAllProjects(): Promise<Project[]> {
    return readNormalized().projects.sort((a, b) => b.createdAt - a.createdAt)
  }

  async function getProject(id: string): Promise<Project | undefined> {
    const projects = await getAllProjects()
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
    return readNormalized().tasks
      .filter(t => t.projectId === projectId)
      .sort((a, b) => a.order - b.order)
  }

  async function getTask(id: string): Promise<Task | undefined> {
    return readNormalized().tasks.find(t => t.id === id)
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

  // Birden çok görevi tek yazma ile günceller.
  // Sıralama gibi işlemler görev başına ayrı yazma yapıyordu.
  async function updateTasks(updates: { id: string; data: Partial<Omit<Task, 'id' | 'createdAt'>> }[]): Promise<void> {
    if (updates.length === 0) return

    const tasks = getFromStorage<Task[]>(TASKS_KEY, [])
    const indexById = new Map(tasks.map((t, i) => [t.id, i]))
    let touched = false

    for (const { id, data } of updates) {
      const index = indexById.get(id)
      if (index === undefined) continue
      tasks[index] = { ...tasks[index], ...data, updatedAt: now() }
      touched = true
    }

    if (touched) saveToStorage(TASKS_KEY, tasks)
  }

  async function deleteTask(id: string): Promise<void> {
    let tasks = getFromStorage<Task[]>(TASKS_KEY, [])

    // Alt görevleri de bul ve sil (recursive)
    const idsToDelete = new Set<string>()

    function findDescendants(parentId: string) {
      if (idsToDelete.has(parentId)) return // bozuk veride döngü koruması
      idsToDelete.add(parentId)
      tasks.filter(t => t.parentId === parentId).forEach(t => findDescendants(t.id))
    }

    findDescendants(id)

    tasks = tasks
      .filter(t => !idsToDelete.has(t.id))
      // Silinen görevlere olan bağımlılıkları da temizle
      .map(t => t.dependencies.some(d => idsToDelete.has(d))
        ? { ...t, dependencies: t.dependencies.filter(d => !idsToDelete.has(d)), updatedAt: now() }
        : t)

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

  // ========== MIGRATION ==========

  // Tarayıcıda halihazırda duran veriyi bir kez normalize eder.
  // Eski veya elle düzenlenmiş kayıtlarda eksik `dependencies` gibi alanlar
  // çalışma anında hata veriyordu. Şema değişmedi, sadece eksikler dolduruluyor.
  // Hiçbir şey değişmediyse yazma yapılmaz.
  async function migrateStorage(): Promise<boolean> {
    if (typeof window === 'undefined') return false
    // Düzeltme oturumda bir kez yazılır. loadProjects her storage
    // olayında yeniden çalışıyor; her seferinde yazmak, farklı sürüm
    // çalıştıran iki sekmenin birbirinin düzeltmesini geri alıp
    // sonsuz "veriler değişti" döngüsüne girmesine yol açıyordu.
    if (hasPersistedMigration) return false

    const rawProjects = getFromStorage<unknown>(PROJECTS_KEY, [])
    const rawTasks = getFromStorage<unknown>(TASKS_KEY, [])

    const before = JSON.stringify([rawProjects, rawTasks])
    const normalized = normalizeImport(rawProjects, rawTasks)
    const after = JSON.stringify([normalized.projects, normalized.tasks])

    if (before === after) return false

    hasPersistedMigration = true
    saveToStorage(PROJECTS_KEY, normalized.projects)
    saveToStorage(TASKS_KEY, normalized.tasks)
    return true
  }

  // ========== BULK OPERATIONS ==========

  // Mevcut veriyi yedek anahtarına kopyalar.
  // Yıkıcı işlemlerden (üzerine yazan içe aktarma, tümünü sil) önce çağrılır.
  async function createBackup(): Promise<boolean> {
    const projects = getFromStorage<Project[]>(PROJECTS_KEY, [])
    const tasks = getFromStorage<Task[]>(TASKS_KEY, [])
    if (projects.length === 0 && tasks.length === 0) return false

    try {
      saveToStorage(BACKUP_KEY, { savedAt: new Date().toISOString(), projects, tasks })
      return true
    } catch {
      // Yedek alınamadıysa asıl işlemi engelleme, sadece bildir
      return false
    }
  }

  function getBackupInfo(): { savedAt: string; projectCount: number; taskCount: number } | null {
    const backup = getFromStorage<any>(BACKUP_KEY, null)
    if (!backup || !Array.isArray(backup.projects)) return null
    return {
      savedAt: backup.savedAt,
      projectCount: backup.projects.length,
      taskCount: Array.isArray(backup.tasks) ? backup.tasks.length : 0
    }
  }

  async function restoreBackup(): Promise<boolean> {
    const backup = getFromStorage<any>(BACKUP_KEY, null)
    if (!backup || !Array.isArray(backup.projects)) return false

    const normalized = normalizeImport(backup.projects, backup.tasks)
    saveToStorage(PROJECTS_KEY, normalized.projects)
    saveToStorage(TASKS_KEY, normalized.tasks)
    return true
  }

  async function replaceAll(projects: Project[], tasks: Task[]): Promise<void> {
    saveToStorage(PROJECTS_KEY, projects)
    saveToStorage(TASKS_KEY, tasks)
  }

  // Mevcut veriyi silmeden ekler
  async function appendAll(projects: Project[], tasks: Task[]): Promise<void> {
    const existingProjects = getFromStorage<Project[]>(PROJECTS_KEY, [])
    const existingTasks = getFromStorage<Task[]>(TASKS_KEY, [])
    saveToStorage(PROJECTS_KEY, [...existingProjects, ...projects])
    saveToStorage(TASKS_KEY, [...existingTasks, ...tasks])
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
    updateTasks,
    deleteTask,
    getNextOrder,

    // Migration
    migrateStorage,

    // Bulk
    replaceAll,
    appendAll,
    exportData,
    clearAllData,
    createBackup,
    getBackupInfo,
    restoreBackup
  }
}

// ========== SETTINGS ==========

export function useSettings() {
  function getSettings(): AppSettings {
    return getFromStorage<AppSettings>(SETTINGS_KEY, {
      defaultViewMode: 'year'
    })
  }

  function saveSettings(settings: AppSettings): void {
    try {
      saveToStorage(SETTINGS_KEY, settings)
    } catch {
      // Ayarlar kritik değil, kaydedilemezse işlemi bloklamasın
    }
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
