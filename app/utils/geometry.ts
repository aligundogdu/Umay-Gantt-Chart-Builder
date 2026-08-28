import type { DateRange, Task } from '~/types'
import { getDatePosition, getBarWidth } from './dates.ts'

// Satır yüksekliği. tailwind.config.ts içindeki `gantt-row` boşluğu ve
// GanttRow'daki h-10 sınıfı ile aynı olmak zorunda.
export const ROW_HEIGHT = 40

// Çok kısa görevlerin tıklanabilir kalması için taban genişlik
export const MIN_BAR_WIDTH = 20

export interface BarGeometry {
  leftPx: number
  widthPx: number
  rightPx: number
}

// Bar konumunu piksel olarak hesaplar.
// Hem GanttRow (barı çizmek) hem DependencyLines (oku bağlamak) bunu
// kullanır; ayrı hesaplandıklarında minimum genişlik yüzünden çizgiler
// barın ucuna denk gelmiyordu.
export function getBarGeometry(
  task: Pick<Task, 'startDate' | 'endDate'>,
  range: DateRange,
  timelineWidth: number
): BarGeometry {
  const leftPercent = getDatePosition(task.startDate, range)
  const widthPercent = getBarWidth(task.startDate, task.endDate, range)

  const leftPx = (leftPercent / 100) * timelineWidth
  const rawWidthPx = (widthPercent / 100) * timelineWidth
  const widthPx = Math.max(rawWidthPx, MIN_BAR_WIDTH)

  return { leftPx, widthPx, rightPx: leftPx + widthPx }
}
