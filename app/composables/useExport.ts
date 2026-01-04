import type { ExportData, Project, Task } from '~/types'
import { allProjectsToMermaid, projectToMermaid } from '~/utils/mermaid'
import LZString from 'lz-string'

const EXPORT_VERSION = '1.0.0'

// Paylaşım verisi tipi
interface ShareData {
  project: Project
  tasks: Task[]
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
  function generateShareURL(project: Project, tasks: Task[]): string {
    const data: ShareData = { project, tasks }
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
    // URL Paylaşım
    generateShareURL,
    parseShareURL,
    checkCurrentURLForShare,
    clearShareFromURL
  }
}
