import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { encodeShare, decodeShare } from '../app/utils/share.ts'
import LZString from 'lz-string'
import type { Project, Task } from '../app/types/index.ts'

const now = 1767225600000 // 2026-01-01

function project(extra: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'Geliştirme Planı',
    description: 'Yıllık yol haritası',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    color: 'blue',
    createdAt: now,
    updatedAt: now,
    ...extra
  }
}

function task(id: string, extra: Partial<Task> = {}): Task {
  return {
    id,
    projectId: 'p1',
    name: `Görev ${id}`,
    startDate: '2026-02-01',
    endDate: '2026-03-15',
    progress: 0,
    color: 'mint',
    dependencies: [],
    order: 0,
    collapsed: false,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...extra
  }
}

describe('paylaşım linki verisi', () => {
  test('proje ve görevler kayıpsız döner', () => {
    const p = project()
    const tasks = [
      task('a', { order: 0, name: 'Keşif', startDate: '2026-01-05', endDate: '2026-02-10', progress: 100, status: 'completed', color: 'coral' }),
      task('b', { order: 1, parentId: 'a', name: 'Alt görev', notes: 'Not metni', collapsed: true }),
      task('c', { order: 2, dependencies: ['a'], description: 'Açıklama', status: 'cancelled', progress: 40 })
    ]

    const decoded = decodeShare(encodeShare(p, tasks))!
    assert.ok(decoded)

    assert.equal(decoded.project.name, 'Geliştirme Planı')
    assert.equal(decoded.project.description, 'Yıllık yol haritası')
    assert.equal(decoded.project.startDate, '2026-01-01')
    assert.equal(decoded.project.endDate, '2026-12-31')
    assert.equal(decoded.project.color, 'blue')

    assert.equal(decoded.tasks.length, 3)
    const [a, b, c] = decoded.tasks

    assert.equal(a.name, 'Keşif')
    assert.equal(a.startDate, '2026-01-05')
    assert.equal(a.endDate, '2026-02-10')
    assert.equal(a.progress, 100)
    assert.equal(a.status, 'completed')
    assert.equal(a.color, 'coral')

    // İlişkiler indeks üzerinden taşınır, yeni id'lerle kurulur
    assert.equal(b.parentId, a.id)
    assert.equal(b.notes, 'Not metni')
    assert.equal(b.collapsed, true)

    assert.deepEqual(c.dependencies, [a.id])
    assert.equal(c.description, 'Açıklama')
    assert.equal(c.status, 'cancelled')
    assert.equal(c.progress, 40)
  })

  test('görev sırası korunur', () => {
    const tasks = [
      task('x', { order: 2, name: 'Üçüncü' }),
      task('y', { order: 0, name: 'Birinci' }),
      task('z', { order: 1, name: 'İkinci' })
    ]
    const decoded = decodeShare(encodeShare(project(), tasks))!
    assert.deepEqual(decoded.tasks.map(t => t.name), ['Birinci', 'İkinci', 'Üçüncü'])
    assert.deepEqual(decoded.tasks.map(t => t.order), [0, 1, 2])
  })

  test('proje aralığı dışındaki tarihler de taşınır', () => {
    const tasks = [
      task('a', { startDate: '2025-11-20', endDate: '2027-03-05' })
    ]
    const decoded = decodeShare(encodeShare(project(), tasks))!
    assert.equal(decoded.tasks[0].startDate, '2025-11-20')
    assert.equal(decoded.tasks[0].endDate, '2027-03-05')
  })

  test('tek günlük görev korunur', () => {
    const tasks = [task('a', { startDate: '2026-06-10', endDate: '2026-06-10' })]
    const decoded = decodeShare(encodeShare(project(), tasks))!
    assert.equal(decoded.tasks[0].startDate, '2026-06-10')
    assert.equal(decoded.tasks[0].endDate, '2026-06-10')
  })

  test('görevsiz proje çözülebilir', () => {
    const decoded = decodeShare(encodeShare(project(), []))!
    assert.equal(decoded.tasks.length, 0)
    assert.equal(decoded.project.name, 'Geliştirme Planı')
  })

  // v1: tam JSON taşıyan eski linkler
  test('eski biçim okunmaya devam eder', () => {
    // Eski kayıtlarda status alanı yoktu, yerine completed bayrağı vardı
    const legacyTask: Record<string, unknown> = { ...task('a', { name: 'Eski görev' }) }
    delete legacyTask.status
    legacyTask.completed = true

    const legacy = {
      project: project(),
      tasks: [legacyTask],
      viewOnly: true
    }
    const payload = LZString.compressToEncodedURIComponent(JSON.stringify(legacy))

    const decoded = decodeShare(payload)!
    assert.ok(decoded)
    assert.equal(decoded.project.name, 'Geliştirme Planı')
    assert.equal(decoded.tasks[0].name, 'Eski görev')
    // Eski completed bayrağı durum alanına çevrilir
    assert.equal(decoded.tasks[0].status, 'completed')
    // viewOnly yalnızca eski biçimde payload içindeydi
    assert.equal(decoded.viewOnly, true)
  })

  test('bozuk veri null döner, hata fırlatmaz', () => {
    assert.equal(decodeShare(''), null)
    assert.equal(decodeShare('bu-gecerli-bir-payload-degil'), null)
    assert.equal(decodeShare(LZString.compressToEncodedURIComponent('42')), null)
    assert.equal(decodeShare(LZString.compressToEncodedURIComponent('[2]')), null)
  })

  test('eksik alanlı v2 satırı çökertmez', () => {
    const payload = LZString.compressToEncodedURIComponent(
      JSON.stringify([2, ['P', '', '2026-01-01', 30, 1], [['Yalnız ad'], [], null]])
    )
    const decoded = decodeShare(payload)!
    assert.equal(decoded.tasks.length, 3)
    assert.equal(decoded.tasks[0].name, 'Yalnız ad')
    assert.equal(decoded.tasks[0].startDate, '2026-01-01')
    assert.equal(decoded.tasks[0].status, 'active')
  })

  test('payload URL üzerinden geçince bozulmaz', () => {
    // LZString çıktısı + karakteri içerebiliyor; URLSearchParams onu
    // boşluğa çevirir ve geri dönüşte düzeltilmesi gerekir.
    const tasks = Array.from({ length: 40 }, (_, i) =>
      task(`t${i}`, { order: i, name: `Görev başlığı ${i} - modül çalışması` })
    )
    const payload = encodeShare(project(), tasks)
    const url = new URL(`https://ornek.test/#s=${payload}&v=1`)
    const params = new URLSearchParams(url.hash.slice(1))

    const decoded = decodeShare(params.get('s')!)!
    assert.ok(decoded)
    assert.equal(decoded.tasks.length, 40)
    assert.equal(decoded.tasks[7].name, 'Görev başlığı 7 - modül çalışması')
  })

  test('link uzunluğu paylaşılabilir sınırda kalır', () => {
    // v1 biçiminde 60 görev 10.000 karakteri geçiyor ve
    // SHARE_URL_MAX_LENGTH (8000) sınırını aşıyordu.
    const tasks = Array.from({ length: 60 }, (_, i) =>
      task(`t${i}`, {
        order: i,
        name: `Görev başlığı ${i + 1} - modül çalışması`,
        parentId: i > 0 && i % 3 === 0 ? `t${i - 1}` : undefined,
        dependencies: i > 1 ? [`t${i - 1}`] : []
      })
    )
    const length = encodeShare(project(), tasks).length
    assert.ok(length < 3000, `60 görev ${length} karakter, 3000 bekleniyordu`)
  })
})
