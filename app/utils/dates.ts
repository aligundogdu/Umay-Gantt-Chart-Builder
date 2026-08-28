import type { ViewMode, DateRange } from '~/types'

// ============================================================
// Tarih ayrıştırma
//
// Uygulamadaki tüm tarihler "YYYY-MM-DD" string'i olarak saklanır ve
// TAKVIM GÜNÜ olarak yorumlanır (saat ve saat dilimi taşımazlar).
// new Date("2026-01-01") bu string'i UTC gece yarısı kabul ederken
// new Date(2026, 0, 1) yerel gece yarısı üretir. İkisinin karışması
// pozitif saat dilimlerinde barları bir gün sağa kaydırıyordu.
// Bu yüzden her şey tek bir uzayda, yerel gece yarısında tutulur.
// ============================================================

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/

export function parseDate(value: Date | string): Date {
  if (value instanceof Date) return startOfDay(value)

  const match = ISO_DATE.exec(value)
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  }

  return startOfDay(new Date(value))
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

// Yerel tarihi ISO gününe çevirir. toISOString() UTC'ye kaydırdığı için
// kullanılmaz: yerel gece yarısı UTC+3'te bir önceki güne düşüyordu.
export function toISODate(date: Date | string): string {
  const d = parseDate(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Tarih formatlama
export function formatDate(date: Date | string, format: 'short' | 'long' | 'iso' = 'short'): string {
  const d = parseDate(date)

  if (format === 'iso') {
    return toISODate(d)
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

// Gün farkı (takvim günü cinsinden).
// Math.round kullanılır: yaz saati uygulanan bölgelerde bir gün 23 veya
// 25 saat sürebilir, Math.ceil bu durumda bir gün fazla sayıyordu.
export function daysDiff(start: Date | string, end: Date | string): number {
  const startDate = parseDate(start)
  const endDate = parseDate(end)
  const diffTime = endDate.getTime() - startDate.getTime()
  return Math.round(diffTime / (1000 * 60 * 60 * 24))
}

// Gün ekle
export function addDays(date: Date | string, days: number): Date {
  const d = parseDate(date)
  d.setDate(d.getDate() + days)
  return d
}

// Ay ekle. Ayın son günlerinde taşmayı engellemek için gün sayısı kırpılır:
// 31 Ocak + 1 ay, 3 Mart değil 28/29 Şubat olmalı.
export function addMonths(date: Date | string, months: number): Date {
  const d = parseDate(date)
  const day = d.getDate()
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1)
  target.setDate(Math.min(day, getDaysInMonth(target)))
  return target
}

// Yıl ekle
export function addYears(date: Date | string, years: number): Date {
  return addMonths(date, years * 12)
}

// Bugün mü kontrol
export function isToday(date: Date | string): boolean {
  return toISODate(date) === toISODate(new Date())
}

// ============================================================
// Timeline aralığı
//
// Aralık her zaman bir ay başında başlar ve bir ay sonunda biter.
// Bu sayede aylık ızgara sütunlarının toplam genişliği, aralığın
// toplam gün sayısına birebir eşit olur ve barlar ızgarayla hizalanır.
// ============================================================

interface RangeShape {
  anchor: 'month' | 'year'
  offsetMonths: number
  totalMonths: number
}

const RANGE_SHAPES: Record<ViewMode, RangeShape> = {
  month: { anchor: 'month', offsetMonths: -1, totalMonths: 4 },
  quarter: { anchor: 'month', offsetMonths: -3, totalMonths: 10 },
  year: { anchor: 'year', offsetMonths: 0, totalMonths: 12 },
  '2year': { anchor: 'year', offsetMonths: 0, totalMonths: 24 },
  '3year': { anchor: 'year', offsetMonths: 0, totalMonths: 36 }
}

export function getTimelineRange(viewMode: ViewMode, centerDate?: Date | string): DateRange {
  const center = centerDate ? parseDate(centerDate) : new Date()
  const shape = RANGE_SHAPES[viewMode] || RANGE_SHAPES['3year']

  const anchor = shape.anchor === 'year' ? startOfYear(center) : startOfMonth(center)
  const start = addMonths(anchor, shape.offsetMonths)
  const end = endOfMonth(addMonths(start, shape.totalMonths - 1))

  return { start, end }
}

// Aralığın orta noktası. Görünüm modu değişirken konumu korumak için.
export function getRangeCenter(range: DateRange): Date {
  const middle = range.start.getTime() + (range.end.getTime() - range.start.getTime()) / 2
  return startOfDay(new Date(middle))
}

// Aralığı tam ay adımlarıyla kaydırır, böylece ay hizası korunur.
export function shiftRange(range: DateRange, months: number): DateRange {
  const start = addMonths(startOfMonth(range.start), months)
  const monthCount = getMonthsInRange(range).length
  const end = endOfMonth(addMonths(start, monthCount - 1))
  return { start, end }
}

// Aralığın kapsadığı toplam gün sayısı (her iki uç dahil)
export function getRangeDays(range: DateRange): number {
  return Math.max(1, daysDiff(range.start, range.end) + 1)
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

// Bir ayın aralık içinde kalan gün sayısı.
// Aralık ay sınırlarına hizalı olduğu için normalde ayın tamamıdır.
export function getMonthDaysInRange(month: Date, range: DateRange): number {
  const monthStart = startOfMonth(month)
  const monthEnd = endOfMonth(month)
  const from = monthStart < range.start ? range.start : monthStart
  const to = monthEnd > range.end ? range.end : monthEnd
  return Math.max(0, daysDiff(from, to) + 1)
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
  const d = parseDate(date)
  return d >= range.start && d <= range.end
}

// Tarih pozisyonunu yüzde olarak hesapla
export function getDatePosition(date: Date | string, range: DateRange): number {
  const dayOffset = daysDiff(range.start, date)
  return (dayOffset / getRangeDays(range)) * 100
}

// Bar genişliğini yüzde olarak hesapla
export function getBarWidth(startDate: string, endDate: string, range: DateRange): number {
  const taskDays = daysDiff(startDate, endDate) + 1 // +1 çünkü son gün dahil
  return (taskDays / getRangeDays(range)) * 100
}

// Bugünün tarihini ISO formatında
export function getTodayISO(): string {
  return toISODate(new Date())
}

// 1 ay sonrası
export function getOneMonthLaterISO(): string {
  return toISODate(addMonths(new Date(), 1))
}

// Varsayılan proje tarih aralığı (şu andan 1 yıl sonrasına)
export function getDefaultProjectDates(): { startDate: string; endDate: string } {
  return {
    startDate: getTodayISO(),
    endDate: toISODate(addYears(new Date(), 1))
  }
}

// Varsayılan görev tarih aralığı (şu andan 1 ay sonrasına)
export function getDefaultTaskDates(): { startDate: string; endDate: string } {
  return {
    startDate: getTodayISO(),
    endDate: getOneMonthLaterISO()
  }
}
