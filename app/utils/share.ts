import type { Project, Task, GanttColor, TaskStatus } from '~/types'
// Göreli yol: bu modül Node test koşucusunda da doğrudan çalıştırılıyor.
import { GANTT_COLORS } from '../types/index.ts'
import { addDays, daysDiff, toISODate } from './dates.ts'
import { normalizeImport } from './tasks.ts'
import { generateId } from '../composables/useDatabase.ts'
import LZString from 'lz-string'

// ============================================================
// Paylaşım linki verisi
//
// Link, projenin tamamını kendi içinde taşır (sunucu yok). Bu yüzden
// biçim doğrudan linkin paylaşılabilir olup olmadığını belirliyor.
//
// v1 tam JSON'du: her görevde 36 karakterlik UUID'ler (id, parentId,
// dependencies) ve her kayıtta tekrar eden alan adları. 30 görevlik bir
// proje 6.000 karakteri geçiyor, 60 görevlik olan hiç paylaşılamıyordu.
//
// v2 aynı veriyi diziye çevirir: id'ler dizi indeksine, tarihler proje
// başlangıcından gün farkına, renk ve durum sayıya iner; createdAt gibi
// alıcıda yeniden üretilebilen alanlar hiç yazılmaz. Ölçülen kazanç 6-7x.
//
// v1 linkleri okunmaya devam eder: v2 bir dizi, v1 bir nesne.
// ============================================================

export const SHARE_SCHEMA_VERSION = 2

export interface DecodedShare {
  project: Project
  tasks: Task[]
  // Yalnızca v1'de payload içinde taşınırdı; asıl kaynak URL parametresi
  viewOnly?: boolean
}

// v2 satır düzeni (sondaki boş alanlar kırpılır).
// enum değil: testler Node'un tip sıyırma modunda koşuyor, orada enum yok.
const F_NAME = 0
const F_START = 1
const F_DURATION = 2
const F_COLOR = 3
const F_PARENT = 4
const F_PROGRESS = 5
const F_FLAGS = 6
const F_DEPS = 7
const F_DESCRIPTION = 8
const F_NOTES = 9

const STATUS_CODES: TaskStatus[] = ['active', 'completed', 'cancelled']
const COLLAPSED_BIT = 4

function statusCode(status: TaskStatus | undefined): number {
  const index = STATUS_CODES.indexOf(status || 'active')
  return index === -1 ? 0 : index
}

function asInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

// ============================================================
// Kodlama
// ============================================================

export function encodeShare(project: Project, tasks: Task[]): string {
  // Sıra diziye gömülür: order alanı yazılmaz, çözerken dizin sırası
  // order olur. Kardeşler arası göreli sıra bu sayede korunur.
  const ordered = [...tasks].sort((a, b) => a.order - b.order)
  const indexOf = new Map(ordered.map((task, index) => [task.id, index]))
  const base = project.startDate

  const rows = ordered.map(task => {
    const row: unknown[] = [
      task.name,
      daysDiff(base, task.startDate),
      daysDiff(task.startDate, task.endDate),
      Math.max(0, GANTT_COLORS.indexOf(task.color)),
      task.parentId !== undefined && indexOf.has(task.parentId) ? indexOf.get(task.parentId)! : -1,
      task.progress || 0,
      statusCode(task.status) | (task.collapsed ? COLLAPSED_BIT : 0),
      task.dependencies
        .map(id => indexOf.get(id))
        .filter((index): index is number => index !== undefined),
      task.description || '',
      task.notes || ''
    ]

    // Açıklama ve notlar çoğu görevde boş; sonda duruyorlar ki kırpılabilsinler
    while (row.length > F_DEPS + 1 && !row[row.length - 1]) row.pop()
    return row
  })

  const payload = [
    SHARE_SCHEMA_VERSION,
    [
      project.name,
      project.description || '',
      base,
      daysDiff(base, project.endDate),
      Math.max(0, GANTT_COLORS.indexOf(project.color))
    ],
    rows
  ]

  return LZString.compressToEncodedURIComponent(JSON.stringify(payload))
}

// ============================================================
// Çözme
// ============================================================

function decodeV2(payload: unknown[]): { project: Project; tasks: Task[] } | null {
  const header = payload[1]
  const rows = payload[2]
  if (!Array.isArray(header) || !Array.isArray(rows)) return null

  const base = asText(header[2])
  if (!base) return null

  const now = Date.now()
  const projectId = generateId()

  const project: Project = {
    id: projectId,
    name: asText(header[0]) || 'Paylaşılan Proje',
    description: asText(header[1]) || undefined,
    startDate: base,
    endDate: toISODate(addDays(base, asInt(header[3], 30))),
    color: (GANTT_COLORS[asInt(header[4], 0)] || 'mint') as GanttColor,
    createdAt: now,
    updatedAt: now
  }

  // Önce kimlikler üretilir: bağımlılık ve üst görev alanları indeks
  // taşıyor, çözerken ileriye referans da olabiliyor.
  const ids = rows.map(() => generateId())

  const tasks: Task[] = rows.map((raw, index) => {
    const row = Array.isArray(raw) ? raw : []
    const startDate = toISODate(addDays(base, asInt(row[F_START], 0)))
    const flags = asInt(row[F_FLAGS], 0)
    const parentIndex = asInt(row[F_PARENT], -1)

    const dependencies = Array.isArray(row[F_DEPS])
      ? (row[F_DEPS] as unknown[])
          .map(value => ids[asInt(value, -1)])
          .filter((id): id is string => Boolean(id))
      : []

    return {
      id: ids[index],
      projectId,
      parentId: parentIndex >= 0 ? ids[parentIndex] : undefined,
      name: asText(row[F_NAME]) || `Görev ${index + 1}`,
      description: asText(row[F_DESCRIPTION]) || undefined,
      notes: asText(row[F_NOTES]) || undefined,
      startDate,
      endDate: toISODate(addDays(startDate, asInt(row[F_DURATION], 0))),
      progress: Math.min(100, Math.max(0, asInt(row[F_PROGRESS], 0))),
      color: (GANTT_COLORS[asInt(row[F_COLOR], 0)] || 'mint') as GanttColor,
      dependencies,
      order: index,
      collapsed: (flags & COLLAPSED_BIT) !== 0,
      status: STATUS_CODES[flags & 3] || 'active',
      createdAt: now,
      updatedAt: now
    }
  })

  return { project, tasks }
}

export function decodeShare(payload: string): DecodedShare | null {
  if (!payload) return null

  let json: string | null = null
  try {
    json = LZString.decompressFromEncodedURIComponent(payload)
  } catch {
    return null
  }
  if (!json) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }

  let project: Project | null = null
  let tasks: Task[] = []
  let viewOnly: boolean | undefined

  if (Array.isArray(parsed) && asInt(parsed[0], 0) === SHARE_SCHEMA_VERSION) {
    const decoded = decodeV2(parsed)
    if (!decoded) return null
    project = decoded.project
    tasks = decoded.tasks
  } else if (parsed && typeof parsed === 'object') {
    // v1: tam JSON. Bayrak yalnızca burada gömülüydü.
    const legacy = parsed as { project?: Project; tasks?: Task[]; viewOnly?: boolean }
    if (!legacy.project || !Array.isArray(legacy.tasks)) return null
    project = legacy.project
    tasks = legacy.tasks
    viewOnly = legacy.viewOnly === true
  } else {
    return null
  }

  // Paylaşan kişideki bozuk kayıtlar alıcıyı çökertmesin
  const normalized = normalizeImport([project], tasks)
  if (normalized.projects.length === 0) return null

  return {
    project: normalized.projects[0],
    tasks: normalized.tasks,
    viewOnly
  }
}
