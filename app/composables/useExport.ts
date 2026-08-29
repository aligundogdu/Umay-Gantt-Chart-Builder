import type { ExportData, Project, Task } from '~/types'
import { allProjectsToMermaid, projectToMermaid } from '../utils/mermaid.ts'
import { normalizeImport, type NormalizeResult } from '../utils/tasks.ts'
import { parseDate, toISODate } from '../utils/dates.ts'
import { encodeShare, decodeShare } from '../utils/share.ts'

// Şema ilk sürümden beri değişmedi. İçe aktarma bu alana zaten bakmıyor,
// eski dosyalar sürüm etiketinden bağımsız olarak okunur.
const EXPORT_VERSION = '1.0.0'

// Paylaşım linki uzunluk eşikleri.
// Bazı sunucu ve proxy'ler istek satırını 8 KB'de kesiyor.
export const SHARE_URL_WARN_LENGTH = 6000
export const SHARE_URL_MAX_LENGTH = 8000

// Paylaşım verisi tipi
interface ShareData {
  project: Project
  tasks: Task[]
  viewOnly?: boolean
}

// Paylaşım linki parametreleri.
// Veri artık adres çubuğunun fragment kısmında taşınıyor: fragment
// sunucuya hiç gönderilmiyor, böylece proxy'lerin uzun istek satırını
// kesmesi, erişim kayıtlarına proje verisinin düşmesi ve referrer ile
// başka siteye sızması sorunları ortadan kalkıyor.
// Eski linkler ?share= ile geldiği için o biçim de okunmaya devam eder.
const SHARE_KEY = 's'
const VIEW_KEY = 'v'
const LEGACY_SHARE_KEY = 'share'
const LEGACY_VIEW_KEY = 'view'

export interface ShareURLInfo {
  url: string
  length: number
  level: 'ok' | 'warn' | 'error'
  message: string
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
    a.download = filename || `gantt-export-${toISODate(new Date())}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
  
  // JSON Import.
  // Eksik veya bozuk alanlar normalize edilir, dosya bu yüzden reddedilmez.
  function parseImportJSON(jsonString: string): NormalizeResult | null {
    try {
      const data = JSON.parse(jsonString) as Partial<ExportData>

      if (!data || typeof data !== 'object') {
        throw new Error('Invalid format: root is not an object')
      }
      if (!Array.isArray(data.projects)) {
        throw new Error('Invalid format: projects array missing')
      }
      if (!Array.isArray(data.tasks)) {
        throw new Error('Invalid format: tasks array missing')
      }

      return normalizeImport(data.projects, data.tasks)
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
    a.download = filename || `gantt-mermaid-${toISODate(new Date())}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
  
  // ===== METİN EXPORT =====
  
  // Tarihi Türkçe formatta göster
  function formatDateTurkish(dateStr: string): string {
    // parseDate: "YYYY-MM-DD" yerel takvim günü olarak okunur.
    // new Date(str) UTC kabul ettiği için negatif saat dilimlerinde
    // gün ve ay bir gün geriye kayıyordu.
    const date = parseDate(dateStr)
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
      const startDate = parseDate(task.startDate)
      const startKey = `${startDate.getFullYear()}-${String(startDate.getMonth()).padStart(2, '0')}`
      
      if (!monthlyData.has(startKey)) {
        monthlyData.set(startKey, { starting: [], ending: [] })
      }
      monthlyData.get(startKey)!.starting.push(task)
      
      // Bitiş ayı
      const endDate = parseDate(task.endDate)
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
    a.download = filename || `gantt-export-${toISODate(new Date())}.md`
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
    const compressed = encodeShare(project, tasks)

    let url = `${window.location.origin}${window.location.pathname}#${SHARE_KEY}=${compressed}`
    if (viewOnly) {
      url += `&${VIEW_KEY}=1`
    }
    return url
  }

  // Paylaşım linkini uzunluk değerlendirmesiyle birlikte üretir.
  // Uzun linkler bazı sunucularda sessizce kesildiği için önceden uyarılır.
  function generateShareURLInfo(project: Project, tasks: Task[], viewOnly = false): ShareURLInfo {
    const url = generateShareURL(project, tasks, viewOnly)
    const length = url.length

    if (length >= SHARE_URL_MAX_LENGTH) {
      return {
        url,
        length,
        level: 'error',
        message: `Link ${length.toLocaleString('tr-TR')} karakter. Bazı sunucular ve mesajlaşma uygulamaları bu uzunlukta linkleri kesiyor. Bunun yerine JSON olarak dışa aktarıp dosyayı paylaşmanız daha güvenli.`
      }
    }

    if (length >= SHARE_URL_WARN_LENGTH) {
      return {
        url,
        length,
        level: 'warn',
        message: `Link ${length.toLocaleString('tr-TR')} karakter. Çoğu yerde çalışır ama sınıra yaklaşıyor. Çalışmazsa JSON dışa aktarmayı deneyin.`
      }
    }

    return { url, length, level: 'ok', message: '' }
  }
  
  // URL'den paylaşım verisini çöz.
  // Yeni linkler fragment'te (#s=...), eskiler sorgu dizesinde (?share=...)
  // taşınır; ikisi de okunur.
  function parseShareURL(url: string): ShareData | null {
    try {
      const urlObj = new URL(url)
      const hashParams = new URLSearchParams(urlObj.hash.replace(/^#/, ''))

      const shareParam =
        hashParams.get(SHARE_KEY) ||
        hashParams.get(LEGACY_SHARE_KEY) ||
        urlObj.searchParams.get(LEGACY_SHARE_KEY)

      if (!shareParam) return null

      const viewParam =
        hashParams.get(VIEW_KEY) ??
        hashParams.get(LEGACY_VIEW_KEY) ??
        urlObj.searchParams.get(LEGACY_VIEW_KEY)

      const decoded = decodeShare(shareParam)
      if (!decoded) {
        console.error('Share URL: veri okunamadı')
        return null
      }

      // viewOnly önce URL parametresinden okunur. Parametre yoksa
      // sıkıştırılmış veriye bakılır: 0028681 öncesinde üretilen linkler
      // bayrağı yalnızca orada taşıyordu ve salt okunur kilidi düşüyordu.
      const viewOnly = viewParam === null || viewParam === undefined
        ? decoded.viewOnly === true
        : viewParam === '1'

      return {
        project: decoded.project,
        tasks: decoded.tasks,
        viewOnly
      }
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
  
  // URL'den share parametrelerini temizle (hem yeni hem eski biçim)
  function clearShareFromURL(): void {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)

    url.searchParams.delete(LEGACY_SHARE_KEY)
    url.searchParams.delete(LEGACY_VIEW_KEY)

    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''))
    hashParams.delete(SHARE_KEY)
    hashParams.delete(VIEW_KEY)
    hashParams.delete(LEGACY_SHARE_KEY)
    hashParams.delete(LEGACY_VIEW_KEY)
    const rest = hashParams.toString()
    url.hash = rest ? `#${rest}` : ''

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
    generateShareURLInfo,
    parseShareURL,
    checkCurrentURLForShare,
    clearShareFromURL
  }
}
