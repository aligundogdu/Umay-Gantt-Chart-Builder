import type { Project, Task, TaskNode, GanttColor, TaskSortMode } from '~/types'
// Göreli yol: bu modül Node test koşucusunda da doğrudan çalıştırılıyor
// ve orada '~' alias'ı çözülmüyor. Tip içe aktarmaları derlemede
// silindiği için onlar alias kalabilir.
import { GANTT_COLORS } from '../types/index.ts'
import { toISODate, getDefaultProjectDates, getDefaultTaskDates } from './dates.ts'

// ============================================================
// Görev ağacı
// ============================================================

// Sürükleme sırasında sıralamayı sabitlemek için kullanılan sıra haritası.
// Görev id'si -> o anki görüntüleme sırası.
export type PinnedOrder = ReadonlyMap<string, number>

// Kardeş görevleri karşılaştırır.
// 'date' modunda başlangıç tarihi, eşitse bitiş tarihi, o da eşitse
// manuel sıra kullanılır; böylece sonuç kararlı ve tahmin edilebilir olur.
function compareSiblings(
  a: TaskNode,
  b: TaskNode,
  sortBy: TaskSortMode,
  pinned?: PinnedOrder | null
): number {
  // Sabitlenmiş sıra varsa her şeyin önüne geçer.
  // Sürükleme boyunca satırın yer değiştirmemesini sağlar.
  if (pinned) {
    const indexA = pinned.get(a.id)
    const indexB = pinned.get(b.id)
    if (indexA !== undefined && indexB !== undefined) return indexA - indexB
    // Sürükleme sırasında oluşturulan yeni görev sona alınır
    if (indexA !== undefined) return -1
    if (indexB !== undefined) return 1
  }

  if (sortBy === 'date') {
    if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1
    if (a.endDate !== b.endDate) return a.endDate < b.endDate ? -1 : 1
  }
  return a.order - b.order
}

// Görevleri tree yapısına dönüştür.
// sortBy yalnızca görüntüleme sırasını belirler, hiçbir alanı değiştirmez.
// pinnedOrder verilirse sıralama o an dondurulur (bkz. sürükleme).
export function buildTaskTree(
  tasks: Task[],
  sortBy: TaskSortMode = 'manual',
  pinnedOrder?: PinnedOrder | null
): TaskNode[] {
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
  const comparator = (a: TaskNode, b: TaskNode) => compareSiblings(a, b, sortBy, pinnedOrder)
  roots.sort(comparator)

  function sortChildren(node: TaskNode) {
    node.children.sort(comparator)
    node.children.forEach(sortChildren)
  }

  roots.forEach(sortChildren)

  return roots
}

// Ağacı görüntüleme sırasına göre düz listeye çevirir.
// Kapalı alt görevler de dahil edilir; sıra dondurulurken tam ağaç gerekir.
export function collectTreeOrder(nodes: TaskNode[]): string[] {
  const result: string[] = []

  function walk(list: TaskNode[]) {
    for (const node of list) {
      result.push(node.id)
      walk(node.children)
    }
  }

  walk(nodes)
  return result
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
// Arama
// ============================================================

// Türkçe karakterleri sadeleştirir: "gorev" yazan "Görev"i bulabilsin.
// Aksi halde klavye düzeni yüzünden eşleşme kaçıyordu.
const TR_FOLD: Record<string, string> = {
  'ı': 'i',
  'ş': 's',
  'ğ': 'g',
  'ü': 'u',
  'ö': 'o',
  'ç': 'c'
}

export function foldSearchText(value: string): string {
  // Önce tr locale ile küçült ('İ' -> 'i'), sonra kalan aksanları düşür
  return value.toLocaleLowerCase('tr').replace(/[ışğüöç]/g, ch => TR_FOLD[ch] || ch)
}

// Görev arama sorgusuyla eşleşiyor mu? Ad, açıklama ve notlarda arar.
export function taskMatchesQuery(task: Task, query: string): boolean {
  const needle = foldSearchText(query).trim()
  if (!needle) return true

  const haystack = [task.name, task.description, task.notes]
    .filter((part): part is string => Boolean(part))
    .join(' ')

  return foldSearchText(haystack).includes(needle)
}

export interface SearchVisibility {
  matches: Set<string>  // sorguyla gerçekten eşleşenler
  visible: Set<string>  // listede kalacak görevler (eşleşen + ata + alt ağaç)
  expand: Set<string>   // altında eşleşme olduğu için açılması gereken görevler
}

// Aramanın görev listesine yansıması.
// - Eşleşenlerin üst görevleri de listede kalır, aksi halde eşleşen bir alt
//   görev ağaçtan kopuk görünür ve girinti anlamını yitirir.
// - Eşleşenin alt ağacı da kalır; üst görev eşleştiğinde açma okunun boşa
//   basılması yerine alt görevler bağlam olarak görünür.
// - expand yalnızca ataları içerir: eşleşme derinlerdeyse kapalı düğüm
//   zorla açılır, eşleşenin kendi altındaki dal kapalı kalabilir.
// Sorgu boşsa null döner: filtre yok demektir.
export function collectSearchVisibility(tasks: Task[], query: string): SearchVisibility | null {
  if (!query.trim()) return null

  const byId = new Map(tasks.map(t => [t.id, t]))
  const childrenByParent = new Map<string, Task[]>()
  tasks.forEach(task => {
    if (!task.parentId) return
    const list = childrenByParent.get(task.parentId)
    if (list) list.push(task)
    else childrenByParent.set(task.parentId, [task])
  })

  const matches = new Set<string>()
  const visible = new Set<string>()
  const expand = new Set<string>()

  for (const task of tasks) {
    if (!taskMatchesQuery(task, query)) continue
    matches.add(task.id)
    visible.add(task.id)

    // Üst zinciri yukarı doğru ekle. Bozuk veride döngü olabilir,
    // seen kümesi sonsuz döngüyü engeller.
    const seenUp = new Set<string>([task.id])
    let parent = task.parentId ? byId.get(task.parentId) : undefined
    while (parent && !seenUp.has(parent.id)) {
      visible.add(parent.id)
      expand.add(parent.id)
      seenUp.add(parent.id)
      parent = parent.parentId ? byId.get(parent.parentId) : undefined
    }

    // Alt ağacı aşağı doğru ekle
    const stack = [task.id]
    const seenDown = new Set<string>([task.id])
    while (stack.length > 0) {
      const currentId = stack.pop()!
      for (const child of childrenByParent.get(currentId) || []) {
        if (seenDown.has(child.id)) continue
        seenDown.add(child.id)
        visible.add(child.id)
        stack.push(child.id)
      }
    }
  }

  return { matches, visible, expand }
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
    completed: raw.completed === true,
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
