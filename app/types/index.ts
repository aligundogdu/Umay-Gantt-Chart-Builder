// Gantt bar renkleri
export type GanttColor = 
  | 'mint' 
  | 'blue' 
  | 'peach' 
  | 'yellow' 
  | 'pink' 
  | 'slate' 
  | 'teal' 
  | 'coral' 
  | 'sage'

export const GANTT_COLORS: GanttColor[] = [
  'mint',
  'blue',
  'peach',
  'yellow',
  'pink',
  'slate',
  'teal',
  'coral',
  'sage'
]

export const GANTT_COLOR_MAP: Record<GanttColor, string> = {
  mint: '#A8E6CF',
  blue: '#88D8F5',
  peach: '#FFCBA4',
  yellow: '#FFF3B0',
  pink: '#FFB6C1',
  slate: '#B4C7E7',
  teal: '#81D4D4',
  coral: '#FFB5A7',
  sage: '#C5D5CB'
}

// Proje tipi
export interface Project {
  id: string
  name: string
  description?: string
  startDate: string // ISO date string
  endDate: string   // ISO date string
  color: GanttColor
  createdAt: number // timestamp
  updatedAt: number // timestamp
}

// Görev tipi
export interface Task {
  id: string
  projectId: string
  parentId?: string // Subtask için üst görev ID
  name: string
  description?: string
  notes?: string    // Ek notlar
  startDate: string // ISO date string
  endDate: string   // ISO date string
  progress: number  // 0-100 arası
  color: GanttColor
  dependencies: string[] // Bağımlı task ID'leri
  order: number     // Sıralama
  collapsed?: boolean // Subtask'lar collapse edilmiş mi
  createdAt: number
  updatedAt: number
}

// Görev tree yapısı (subtask'lar ile)
export interface TaskNode extends Task {
  children: TaskNode[]
  level: number
}

// Uygulama ayarları
export interface AppSettings {
  theme: 'light' | 'dark'
  defaultViewMode: ViewMode
  lastOpenedProjectId?: string
}

// Görünüm modu
export type ViewMode = 'month' | 'quarter' | 'year'

// Timeline için tarih aralığı
export interface DateRange {
  start: Date
  end: Date
}

// Export/Import veri yapısı
export interface ExportData {
  version: string
  exportedAt: string
  projects: Project[]
  tasks: Task[]
}

// Mermaid gantt çıktısı için
export interface MermaidSection {
  name: string
  tasks: MermaidTask[]
}

export interface MermaidTask {
  id: string
  name: string
  startDate: string
  duration: number // gün
  dependency?: string
}

// Drag & Drop için
export interface DragState {
  isDragging: boolean
  taskId: string | null
  type: 'move' | 'resize-start' | 'resize-end' | null
  startX: number
  startDate: string
  endDate: string
}

// Modal tipi
export type ModalType = 'task' | 'project' | 'export' | 'import' | null

// Form state'leri
export interface TaskFormData {
  name: string
  description: string
  notes: string
  startDate: string
  endDate: string
  progress: number
  color: GanttColor
  parentId: string
  dependencies: string[]
}

export interface ProjectFormData {
  name: string
  description: string
  startDate: string
  endDate: string
  color: GanttColor
}

