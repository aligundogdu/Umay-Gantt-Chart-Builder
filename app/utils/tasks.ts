import type { Project, Task, TaskNode, GanttColor } from '~/types'
// Göreli yol: bu modül Node test koşucusunda da doğrudan çalıştırılıyor
// ve orada '~' alias'ı çözülmüyor. Tip içe aktarmaları derlemede
// silindiği için onlar alias kalabilir.
import { GANTT_COLORS } from '../types/index.ts'
import { toISODate, getDefaultProjectDates, getDefaultTaskDates } from './dates.ts'

// ============================================================
// Görev ağacı
// ============================================================

// Görevleri tree yapısına dönüştür
export function buildTaskTree(tasks: Task[]): TaskNode[] {
  const taskMap = new Map<string, TaskNode>()
  const roots: TaskNode[] = []

  // Önce tüm görevleri map'e ekle
  tasks.forEach(task => {
    taskMap.set(task.id, { ...task, children: [], level: 0 })
  })

  // Sonra parent-child ilişkilerini kur.
  // Kendini üst görev gösteren veya döngü oluşturan kayıtlar köke alınır,
  // aksi halde ağaç kurulurken sonsuz döngüye girerdi.
  tasks.forEach(task => {
    const node = taskMap.get(task.id)!
    const parent = task.parentId ? taskMap.get(task.parentId) : undefined

    if (parent && parent !== node && !isAncestorOf(node.id, parent.id, taskMap)) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  })

  // Seviyeleri ağaç kurulduktan sonra hesapla
  function assignLevels(nodes: TaskNode[], level: number) {
    nodes.forEach(node => {
      node.level = level
      assignLevels(node.children, level + 1)
    })
  }
  assignLevels(roots, 0)

  // Sırala
  const sortByOrder = (a: TaskNode, b: TaskNode) => a.order - b.order
  roots.sort(sortByOrder)

  function sortChildren(node: TaskNode) {
    node.children.sort(sortByOrder)
    node.children.forEach(sortChildren)
  }

  roots.forEach(sortChildren)

  return roots
}

// candidate, node'un altında mı? (parentId zincirini yukarı doğru tarar)
function isAncestorOf(
  nodeId: string,
  candidateId: string,
  taskMap: Map<string, { id: string; parentId?: string }>
): boolean {
  const seen = new Set<string>()
  let current = taskMap.get(candidateId)

  while (current) {
    if (current.id === nodeId) return true
    if (seen.has(current.id)) return false // bozuk veri, döngü
    seen.add(current.id)
    current = current.parentId ? taskMap.get(current.parentId) : undefined
  }

  return false
}

// Bir görevin tüm alt görev id'leri (kendisi hariç)
export function collectDescendantIds(tasks: Task[], taskId: string): Set<string> {
  const result = new Set<string>()
  const childrenByParent = new Map<string, Task[]>()

  tasks.forEach(task => {
    if (!task.parentId) return
    const list = childrenByParent.get(task.parentId)
    if (list) list.push(task)
    else childrenByParent.set(task.parentId, [task])
  })

  function walk(id: string) {
    const children = childrenByParent.get(id) || []
    for (const child of children) {
      if (result.has(child.id)) continue
      result.add(child.id)
      walk(child.id)
    }
  }

  walk(taskId)
  return result
}

// taskId, yeni üst görev olarak parentId'yi alabilir mi?
export function canReparent(tasks: Task[], taskId: string, parentId?: string): boolean {
  if (!parentId) return true
  if (parentId === taskId) return false
  return !collectDescendantIds(tasks, taskId).has(parentId)
}

// ============================================================
// Bağımlılık döngüsü
// ============================================================

// taskId, dependsOnId'ye bağlanırsa döngü oluşur mu?
export function wouldCreateDependencyCycle(
  tasks: Task[],
  taskId: string,
  dependsOnId: string
): boolean {
  if (taskId === dependsOnId) return true

  const byId = new Map(tasks.map(t => [t.id, t]))
  const seen = new Set<string>()
  const stack = [dependsOnId]

  // dependsOnId'den başlayarak bağımlılık zincirini takip et.
  // Zincir taskId'ye geri dönüyorsa döngü var demektir.
  while (stack.length > 0) {
    const currentId = stack.pop()!
    if (currentId === taskId) return true
    if (seen.has(currentId)) continue
    seen.add(currentId)

    const current = byId.get(currentId)
    if (!current) continue
    for (const depId of current.dependencies) {
      stack.push(depId)
    }
  }

  return false
}

// Bir görevin seçebileceği bağımlılıklar: kendisi, alt görevleri ve
// döngü oluşturacak olanlar hariç
export function getDependencyOptions(tasks: Task[], taskId: string): Task[] {
  const excluded = collectDescendantIds(tasks, taskId)
  excluded.add(taskId)

  return tasks.filter(task => {
    if (excluded.has(task.id)) return false
    return !wouldCreateDependencyCycle(tasks, taskId, task.id)
  })
}

// ============================================================
// Normalizasyon
//
// Dışa aktarılan JSON şeması ilk sürümden bu yana değişmedi, ama elle
// düzenlenmiş veya eksik alan içeren dosyalar uygulamayı çökertmemeli.
// Bu katman her içe aktarmada eksikleri güvenli varsayılanlarla doldurur.
// Kayıtlı tarihler asla yeniden yazılmaz, sadece geçersizler düzeltilir.
// ============================================================

const COLOR_SET = new Set<string>(GANTT_COLORS)

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function asISODate(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return fallback
  return toISODate(value)
}

function asColor(value: unknown, fallback: GanttColor): GanttColor {
  return typeof value === 'string' && COLOR_SET.has(value) ? (value as GanttColor) : fallback
}

function asTimestamp(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  // Eski elle düzenlenmiş dosyalarda ISO string olabilir
  if (typeof value === 'string') {
    const parsed = new Date(value).getTime()
    if (!Number.isNaN(parsed)) return parsed
  }
  return fallback
}

export function normalizeProject(raw: any, index = 0): Project | null {
  if (!raw || typeof raw !== 'object') return null
  if (typeof raw.id !== 'string' || !raw.id) return null

  const defaults = getDefaultProjectDates()
  const created = asTimestamp(raw.createdAt, Date.now())

  return {
    id: raw.id,
    name: asString(raw.name, `Proje ${index + 1}`),
    description: typeof raw.description === 'string' ? raw.description : undefined,
    startDate: asISODate(raw.startDate, defaults.startDate),
    endDate: asISODate(raw.endDate, defaults.endDate),
    color: asColor(raw.color, 'mint'),
    createdAt: created,
    updatedAt: asTimestamp(raw.updatedAt, created)
  }
}

export function normalizeTask(raw: any, index = 0): Task | null {
  if (!raw || typeof raw !== 'object') return null
  if (typeof raw.id !== 'string' || !raw.id) return null
  if (typeof raw.projectId !== 'string' || !raw.projectId) return null

  const defaults = getDefaultTaskDates()
  const created = asTimestamp(raw.createdAt, Date.now())

  const progress = typeof raw.progress === 'number' && Number.isFinite(raw.progress)
    ? Math.min(100, Math.max(0, raw.progress))
    : 0

  const dependencies = Array.isArray(raw.dependencies)
    ? raw.dependencies.filter((d: unknown): d is string => typeof d === 'string')
    : []

  return {
    id: raw.id,
    projectId: raw.projectId,
    parentId: typeof raw.parentId === 'string' && raw.parentId ? raw.parentId : undefined,
    name: asString(raw.name, `Görev ${index + 1}`),
    description: typeof raw.description === 'string' ? raw.description : undefined,
    notes: typeof raw.notes === 'string' ? raw.notes : undefined,
    startDate: asISODate(raw.startDate, defaults.startDate),
    endDate: asISODate(raw.endDate, defaults.endDate),
    progress,
    color: asColor(raw.color, 'mint'),
    dependencies,
    order: typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : index,
    collapsed: raw.collapsed === true,
    createdAt: created,
    updatedAt: asTimestamp(raw.updatedAt, created)
  }
}

export interface NormalizeResult {
  projects: Project[]
  tasks: Task[]
  droppedProjects: number
  droppedTasks: number
  orphanTasks: number
  brokenDependencies: number
  brokenParents: number
}

// İçe aktarılan ham veriyi güvenli hale getirir.
// Sahipsiz görev ve geçersiz bağımlılık sayılarını da raporlar ki
// kullanıcı sessizce veri kaybettiğini sanmasın.
export function normalizeImport(rawProjects: unknown, rawTasks: unknown): NormalizeResult {
  const projectList = Array.isArray(rawProjects) ? rawProjects : []
  const taskList = Array.isArray(rawTasks) ? rawTasks : []

  const projects: Project[] = []
  let droppedProjects = 0
  projectList.forEach((raw, index) => {
    const project = normalizeProject(raw, index)
    if (project) projects.push(project)
    else droppedProjects++
  })

  const tasks: Task[] = []
  let droppedTasks = 0
  taskList.forEach((raw, index) => {
    const task = normalizeTask(raw, index)
    if (task) tasks.push(task)
    else droppedTasks++
  })

  const projectIds = new Set(projects.map(p => p.id))
  const orphans = tasks.filter(t => !projectIds.has(t.projectId))
  const kept = tasks.filter(t => projectIds.has(t.projectId))

  const taskIds = new Set(kept.map(t => t.id))

  // Geçersiz üst görev referanslarını temizle
  let brokenParents = 0
  kept.forEach(task => {
    if (task.parentId && !taskIds.has(task.parentId)) {
      task.parentId = undefined
      brokenParents++
    }
  })

  // Kendini gösteren veya var olmayan bağımlılıkları at
  let brokenDependencies = 0
  kept.forEach(task => {
    const cleaned = task.dependencies.filter(depId => {
      if (depId === task.id || !taskIds.has(depId)) {
        brokenDependencies++
        return false
      }
      return true
    })
    task.dependencies = Array.from(new Set(cleaned))
  })

  // Döngüleri kır: bir bağımlılık döngü yaratıyorsa o kenarı düşür
  kept.forEach(task => {
    const safe: string[] = []
    for (const depId of task.dependencies) {
      const candidate = { ...task, dependencies: safe }
      const pool = kept.map(t => (t.id === task.id ? candidate : t))
      if (wouldCreateDependencyCycle(pool, task.id, depId)) {
        brokenDependencies++
        continue
      }
      safe.push(depId)
    }
    task.dependencies = safe
  })

  return {
    projects,
    tasks: kept,
    droppedProjects,
    droppedTasks,
    orphanTasks: orphans.length,
    brokenDependencies,
    brokenParents
  }
}
