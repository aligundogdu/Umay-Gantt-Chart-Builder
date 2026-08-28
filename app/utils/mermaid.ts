import type { Project, Task, TaskNode } from '~/types'
import { daysDiff, toISODate } from './dates.ts'
import { buildTaskTree } from './tasks.ts'

// buildTaskTree artık utils/tasks.ts içinde

// Mermaid ID oluştur (alfanümerik)
function sanitizeMermaidId(id: string): string {
  return 'task_' + id.replace(/[^a-zA-Z0-9]/g, '_')
}

// Mermaid için güvenli isim
function sanitizeMermaidName(name: string): string {
  // Mermaid'de sorun çıkarabilecek karakterleri kaldır
  return name
    .replace(/[\r\n]+/g, ' ')
    .replace(/:/g, ' -')
    .replace(/[#;<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Adsız görev'
}

// Tek bir projeyi Mermaid gantt formatına dönüştür
export function projectToMermaid(project: Project, tasks: Task[]): string {
  const projectTasks = tasks.filter(t => t.projectId === project.id)
  const taskTree = buildTaskTree(projectTasks)

  const lines: string[] = [
    'gantt',
    `    title ${sanitizeMermaidName(project.name)}`,
    '    dateFormat YYYY-MM-DD',
    ''
  ]

  // Tüm görevlerin Mermaid id'si baştan hazırlanır.
  const idMap = new Map<string, string>()
  projectTasks.forEach(task => idMap.set(task.id, sanitizeMermaidId(task.id)))

  // Mermaid `after` yalnızca daha önce tanımlanmış bir id'ye bakabilir.
  // Henüz yazılmamış bir göreve olan bağımlılık atlanır ve bunun yerine
  // görevin kendi başlangıç tarihi yazılır.
  const emitted = new Set<string>()

  function processNode(node: TaskNode) {
    // Ana görevler section olarak
    if (node.level === 0) {
      lines.push(`    section ${sanitizeMermaidName(node.name)}`)
    }

    const taskName = sanitizeMermaidName(node.name)
    const mermaidId = idMap.get(node.id)!
    const startDate = toISODate(node.startDate)
    // Ters tarihli bozuk kayıtlarda Mermaid'e negatif süre yazılmasın
    const duration = Math.max(1, daysDiff(node.startDate, node.endDate) + 1)

    // Tüm çözülebilen bağımlılıklar yazılır, sadece ilki değil
    const resolvedDeps = node.dependencies
      .filter(depId => emitted.has(depId))
      .map(depId => idMap.get(depId)!)

    // Progress status
    let statusPart = ''
    if (node.progress === 100) {
      statusPart = 'done, '
    } else if (node.progress > 0) {
      statusPart = 'active, '
    }

    if (resolvedDeps.length > 0) {
      lines.push(`    ${taskName} :${statusPart}${mermaidId}, after ${resolvedDeps.join(' ')}, ${duration}d`)
    } else {
      lines.push(`    ${taskName} :${statusPart}${mermaidId}, ${startDate}, ${duration}d`)
    }

    emitted.add(node.id)

    // Alt görevleri işle
    node.children.forEach(child => processNode(child))
  }

  taskTree.forEach(node => processNode(node))

  return lines.join('\n')
}

// Tüm projeleri Mermaid formatına dönüştür
export function allProjectsToMermaid(projects: Project[], tasks: Task[]): string {
  return projects
    .map(project => projectToMermaid(project, tasks))
    .join('\n\n---\n\n')
}

// Mermaid preview URL oluştur (mermaid.live)
export function getMermaidPreviewUrl(mermaidCode: string): string {
  // btoa yalnızca latin1 kabul eder, Türkçe karakterler hata veriyordu
  const utf8 = new TextEncoder().encode(mermaidCode)
  let binary = ''
  utf8.forEach(byte => { binary += String.fromCharCode(byte) })
  return `https://mermaid.live/edit#base64:${btoa(binary)}`
}
