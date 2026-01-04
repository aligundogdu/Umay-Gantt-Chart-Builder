import type { Project, Task, TaskNode } from '~/types'
import { daysDiff, formatDate } from './dates'

// Görevleri tree yapısına dönüştür
export function buildTaskTree(tasks: Task[]): TaskNode[] {
  const taskMap = new Map<string, TaskNode>()
  const roots: TaskNode[] = []
  
  // Önce tüm görevleri map'e ekle
  tasks.forEach(task => {
    taskMap.set(task.id, { ...task, children: [], level: 0 })
  })
  
  // Sonra parent-child ilişkilerini kur
  tasks.forEach(task => {
    const node = taskMap.get(task.id)!
    if (task.parentId && taskMap.has(task.parentId)) {
      const parent = taskMap.get(task.parentId)!
      node.level = parent.level + 1
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  })
  
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

// Mermaid ID oluştur (alfanümerik)
function sanitizeMermaidId(id: string): string {
  return 'task_' + id.replace(/[^a-zA-Z0-9]/g, '_')
}

// Mermaid için güvenli isim
function sanitizeMermaidName(name: string): string {
  // Mermaid'de sorun çıkarabilecek karakterleri kaldır
  return name
    .replace(/:/g, ' -')
    .replace(/[#;]/g, '')
    .trim()
}

// Tek bir projeyi Mermaid gantt formatına dönüştür
export function projectToMermaid(project: Project, tasks: Task[]): string {
  const projectTasks = tasks.filter(t => t.projectId === project.id)
  const taskTree = buildTaskTree(projectTasks)
  
  const lines: string[] = [
    'gantt',
    `    title ${sanitizeMermaidName(project.name)}`,
    '    dateFormat YYYY-MM-DD',
    '    excludes weekends',
    ''
  ]
  
  // Task ID -> Mermaid ID mapping
  const idMap = new Map<string, string>()
  
  function processNode(node: TaskNode, sectionName?: string) {
    const mermaidId = sanitizeMermaidId(node.id)
    idMap.set(node.id, mermaidId)
    
    // Ana görevler section olarak
    if (node.level === 0) {
      lines.push(`    section ${sanitizeMermaidName(node.name)}`)
    }
    
    // Görev detayları
    const taskName = sanitizeMermaidName(node.name)
    const startDate = formatDate(node.startDate, 'iso')
    const duration = daysDiff(node.startDate, node.endDate) + 1
    
    // Dependency check
    let dependencyPart = ''
    if (node.dependencies.length > 0) {
      const depId = node.dependencies[0]
      if (idMap.has(depId)) {
        dependencyPart = `after ${idMap.get(depId)}, `
      }
    }
    
    // Progress status
    let statusPart = ''
    if (node.progress === 100) {
      statusPart = 'done, '
    } else if (node.progress > 0) {
      statusPart = 'active, '
    }
    
    // Format: Task Name :id, start, duration
    // veya: Task Name :done, id, after dep, duration
    if (dependencyPart) {
      lines.push(`    ${taskName} :${statusPart}${mermaidId}, ${dependencyPart}${duration}d`)
    } else {
      lines.push(`    ${taskName} :${statusPart}${mermaidId}, ${startDate}, ${duration}d`)
    }
    
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
  const encoded = btoa(encodeURIComponent(mermaidCode))
  return `https://mermaid.live/edit#base64:${encoded}`
}

