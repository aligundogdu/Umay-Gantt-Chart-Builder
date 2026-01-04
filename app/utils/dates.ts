import type { ViewMode, DateRange } from '~/types'

// Tarih formatlama
export function formatDate(date: Date | string, format: 'short' | 'long' | 'iso' = 'short'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  
  if (format === 'iso') {
    return d.toISOString().split('T')[0]
  }
  
  if (format === 'long') {
    return d.toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  }
  
  return d.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

// Ay adı
export function getMonthName(date: Date, format: 'short' | 'long' = 'short'): string {
  return date.toLocaleDateString('tr-TR', { 
    month: format 
  })
}

// Yıl
export function getYear(date: Date): number {
  return date.getFullYear()
}

// Ay başlangıcı
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

// Ay sonu
export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

// Yıl başlangıcı
export function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1)
}

// Yıl sonu
export function endOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 11, 31)
}

// Gün farkı
export function daysDiff(start: Date | string, end: Date | string): number {
  const startDate = typeof start === 'string' ? new Date(start) : start
  const endDate = typeof end === 'string' ? new Date(end) : end
  const diffTime = endDate.getTime() - startDate.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

// Gün ekle
export function addDays(date: Date | string, days: number): Date {
  const d = typeof date === 'string' ? new Date(date) : new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

// Ay ekle
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

// Yıl ekle
export function addYears(date: Date, years: number): Date {
  const d = new Date(date)
  d.setFullYear(d.getFullYear() + years)
  return d
}

// Bugün mü kontrol
export function isToday(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date) : date
  const today = new Date()
  return d.toDateString() === today.toDateString()
}

// Timeline için tarih aralığı oluştur
export function getTimelineRange(viewMode: ViewMode, centerDate?: Date): DateRange {
  const center = centerDate || new Date()
  
  switch (viewMode) {
    case 'month':
      return {
        start: addMonths(startOfMonth(center), -1),
        end: addMonths(endOfMonth(center), 2)
      }
    case 'quarter':
      return {
        start: addMonths(startOfMonth(center), -3),
        end: addMonths(endOfMonth(center), 6)
      }
    case 'year':
    default:
      return {
        start: startOfYear(center),
        end: addYears(endOfYear(center), 1)
      }
  }
}

// Ayları dizi olarak al
export function getMonthsInRange(range: DateRange): Date[] {
  const months: Date[] = []
  let current = startOfMonth(range.start)
  
  while (current <= range.end) {
    months.push(new Date(current))
    current = addMonths(current, 1)
  }
  
  return months
}

// Günleri dizi olarak al
export function getDaysInRange(range: DateRange): Date[] {
  const days: Date[] = []
  let current = new Date(range.start)
  
  while (current <= range.end) {
    days.push(new Date(current))
    current = addDays(current, 1)
  }
  
  return days
}

// Aydaki gün sayısı
export function getDaysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
}

// Tarih aralığında mı kontrol
export function isDateInRange(date: Date | string, range: DateRange): boolean {
  const d = typeof date === 'string' ? new Date(date) : date
  return d >= range.start && d <= range.end
}

// Tarih pozisyonunu yüzde olarak hesapla
export function getDatePosition(date: Date | string, range: DateRange): number {
  const d = typeof date === 'string' ? new Date(date) : date
  const totalDays = daysDiff(range.start, range.end)
  const dayOffset = daysDiff(range.start, d)
  return (dayOffset / totalDays) * 100
}

// Bar genişliğini yüzde olarak hesapla
export function getBarWidth(startDate: string, endDate: string, range: DateRange): number {
  const taskDays = daysDiff(startDate, endDate) + 1 // +1 çünkü son gün dahil
  const totalDays = daysDiff(range.start, range.end)
  return (taskDays / totalDays) * 100
}

// Bugünün tarihini ISO formatında
export function getTodayISO(): string {
  return formatDate(new Date(), 'iso')
}

// 1 ay sonrası
export function getOneMonthLaterISO(): string {
  return formatDate(addMonths(new Date(), 1), 'iso')
}

// Varsayılan proje tarih aralığı (şu andan 1 yıl sonrasına)
export function getDefaultProjectDates(): { startDate: string; endDate: string } {
  return {
    startDate: getTodayISO(),
    endDate: formatDate(addYears(new Date(), 1), 'iso')
  }
}

// Varsayılan görev tarih aralığı (şu andan 1 ay sonrasına)
export function getDefaultTaskDates(): { startDate: string; endDate: string } {
  return {
    startDate: getTodayISO(),
    endDate: getOneMonthLaterISO()
  }
}

