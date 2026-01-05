import type { ExportData, Project, Task } from '~/types'
import { allProjectsToMermaid, projectToMermaid } from '~/utils/mermaid'
import LZString from 'lz-string'

const EXPORT_VERSION = '1.0.0'

// Paylaşım verisi tipi
interface ShareData {
  project: Project
  tasks: Task[]
  viewOnly?: boolean
}

export function useExport() {
  
  // JSON Export
  function exportToJSON(projects: Project[], tasks: Task[]): string {
    const data: ExportData = {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      projects,
      tasks
    }
    return JSON.stringify(data, null, 2)
  }
  
  // JSON dosyası olarak indir
  function downloadJSON(projects: Project[], tasks: Task[], filename?: string): void {
    const json = exportToJSON(projects, tasks)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    
    const a = document.createElement('a')
    a.href = url
    a.download = filename || `gantt-export-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
  
  // JSON Import
  function parseImportJSON(jsonString: string): ExportData | null {
    try {
      const data = JSON.parse(jsonString) as ExportData
      
      // Basit validasyon
      if (!data.projects || !Array.isArray(data.projects)) {
        throw new Error('Invalid format: projects array missing')
      }
      if (!data.tasks || !Array.isArray(data.tasks)) {
        throw new Error('Invalid format: tasks array missing')
      }
      
      return data
    } catch (error) {
      console.error('JSON parse error:', error)
      return null
    }
  }
  
  // Dosyadan oku
  function readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsText(file)
    })
  }
  
  // Mermaid Export - Tek proje
  function exportProjectToMermaid(project: Project, tasks: Task[]): string {
    return projectToMermaid(project, tasks)
  }
  
  // Mermaid Export - Tüm projeler
  function exportAllToMermaid(projects: Project[], tasks: Task[]): string {
    return allProjectsToMermaid(projects, tasks)
  }
  
  // Mermaid dosyası olarak indir
  function downloadMermaid(content: string, filename?: string): void {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    
    const a = document.createElement('a')
    a.href = url
    a.download = filename || `gantt-mermaid-${new Date().toISOString().split('T')[0]}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
  
  // ===== METİN EXPORT =====
  
  // Tarihi Türkçe formatta göster
  function formatDateTurkish(dateStr: string): string {
    const date = new Date(dateStr)
    const months = [
      'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
      'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
    ]
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`
  }
  
  // Projeyi markdown formatında export et (bitiş tarihine göre gruplu)
  function exportProjectToText(project: Project, tasks: Task[]): string {
    const projectTasks = tasks.filter(t => t.projectId === project.id)
    
    // Görevleri bitiş tarihine göre grupla
    const grouped = new Map<string, Task[]>()
    
    for (const task of projectTasks) {
      const endDate = task.endDate
      if (!grouped.has(endDate)) {
        grouped.set(endDate, [])
      }
      grouped.get(endDate)!.push(task)
    }
    
    // Tarihleri sırala
    const sortedDates = Array.from(grouped.keys()).sort()
    
    // Markdown oluştur
    const lines: string[] = []
    lines.push(`# ${project.name}`)
    lines.push('')
    
    for (const date of sortedDates) {
      const dateTasks = grouped.get(date)!
      
      // Görevleri sırala (order'a göre)
      dateTasks.sort((a, b) => a.order - b.order)
      
      lines.push(`## ${formatDateTurkish(date)}`)
      lines.push('')
      
      for (const task of dateTasks) {
        // Alt görevler için girinti (markdown nested list)
        const indent = task.parentId ? '  ' : ''
        lines.push(`${indent}- ${task.name}`)
      }
      
      lines.push('')
    }
    
    return lines.join('\n').trim()
  }
  
  // Ay bazlı özet export - markdown formatında (başlayan ve biten işler)
  function exportProjectToMonthlySummary(project: Project, tasks: Task[]): string {
    const projectTasks = tasks.filter(t => t.projectId === project.id)
    
    const months = [
      'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
      'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
    ]
    
    // Ay-yıl bazında grupla (başlangıç ve bitiş ayrı)
    const monthlyData = new Map<string, { starting: Task[], ending: Task[] }>()
    
    for (const task of projectTasks) {
      // Başlangıç ayı
      const startDate = new Date(task.startDate)
      const startKey = `${startDate.getFullYear()}-${String(startDate.getMonth()).padStart(2, '0')}`
      
      if (!monthlyData.has(startKey)) {
        monthlyData.set(startKey, { starting: [], ending: [] })
      }
      monthlyData.get(startKey)!.starting.push(task)
      
      // Bitiş ayı
      const endDate = new Date(task.endDate)
      const endKey = `${endDate.getFullYear()}-${String(endDate.getMonth()).padStart(2, '0')}`
      
      if (!monthlyData.has(endKey)) {
        monthlyData.set(endKey, { starting: [], ending: [] })
      }
      monthlyData.get(endKey)!.ending.push(task)
    }
    
    // Ayları sırala
    const sortedMonths = Array.from(monthlyData.keys()).sort()
    
    // Markdown oluştur
    const lines: string[] = []
    lines.push(`# ${project.name}`)
    lines.push('')
    
    for (const monthKey of sortedMonths) {
      const [year, monthIndex] = monthKey.split('-')
      const monthName = months[parseInt(monthIndex)]
      const data = monthlyData.get(monthKey)!
      
      // Sadece başlayan veya biten görev varsa göster
      if (data.starting.length === 0 && data.ending.length === 0) continue
      
      lines.push(`## ${monthName} ${year}`)
      lines.push('')
      
      // Başlayan işler
      if (data.starting.length > 0) {
        for (const task of data.starting) {
          const indent = task.parentId ? '  ' : ''
          lines.push(`${indent}- ${task.name} başlayacak`)
        }
      }
      
      // Biten işler
      if (data.ending.length > 0) {
        for (const task of data.ending) {
          const indent = task.parentId ? '  ' : ''
          lines.push(`${indent}- ${task.name} bitecek`)
        }
      }
      
      lines.push('')
    }
    
    return lines.join('\n').trim()
  }
  
  // Markdown dosyası olarak indir
  function downloadText(content: string, filename?: string): void {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    
    const a = document.createElement('a')
    a.href = url
    a.download = filename || `gantt-export-${new Date().toISOString().split('T')[0]}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
  
  // Clipboard'a kopyala
  async function copyToClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fallback
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      try {
        document.execCommand('copy')
        return true
      } catch {
        return false
      } finally {
        document.body.removeChild(textarea)
      }
    }
  }
  
  // ===== URL PAYLASIM =====
  
  // Paylaşım URL'si oluştur
  function generateShareURL(project: Project, tasks: Task[], viewOnly: boolean = false): string {
    const data: ShareData = { project, tasks, viewOnly }
    const json = JSON.stringify(data)
    const compressed = LZString.compressToEncodedURIComponent(json)
    return `${window.location.origin}${window.location.pathname}?share=${compressed}`
  }
  
  // URL'den paylaşım verisini çöz
  function parseShareURL(url: string): ShareData | null {
    try {
      const urlObj = new URL(url)
      const shareData = urlObj.searchParams.get('share')
      if (!shareData) return null
      
      const json = LZString.decompressFromEncodedURIComponent(shareData)
      if (!json) return null
      
      const data = JSON.parse(json) as ShareData
      
      // Basit validasyon
      if (!data.project || !data.tasks) {
        return null
      }
      
      return data
    } catch (error) {
      console.error('Share URL parse error:', error)
      return null
    }
  }
  
  // Mevcut URL'den paylaşım verisini kontrol et
  function checkCurrentURLForShare(): ShareData | null {
    if (typeof window === 'undefined') return null
    return parseShareURL(window.location.href)
  }
  
  // URL'den share parametresini temizle
  function clearShareFromURL(): void {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.delete('share')
    window.history.replaceState({}, '', url.toString())
  }
  
  return {
    exportToJSON,
    downloadJSON,
    parseImportJSON,
    readFile,
    exportProjectToMermaid,
    exportAllToMermaid,
    downloadMermaid,
    copyToClipboard,
    // Metin Export
    exportProjectToText,
    exportProjectToMonthlySummary,
    downloadText,
    // URL Paylaşım
    generateShareURL,
    parseShareURL,
    checkCurrentURLForShare,
    clearShareFromURL
  }
}
