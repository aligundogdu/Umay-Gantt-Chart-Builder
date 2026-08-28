import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildTaskTree,
  collectDescendantIds,
  canReparent,
  wouldCreateDependencyCycle,
  getDependencyOptions,
  normalizeImport
} from '../app/utils/tasks.ts'
import { projectToMermaid } from '../app/utils/mermaid.ts'

function task(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    projectId: 'p1',
    name: `Görev ${id}`,
    startDate: '2026-01-01',
    endDate: '2026-01-10',
    progress: 0,
    color: 'mint',
    dependencies: [],
    order: 0,
    createdAt: 1,
    updatedAt: 1,
    ...extra
  } as any
}

describe('görev ağacı', () => {
  test('üst-alt ilişkisi ve seviyeler', () => {
    const tree = buildTaskTree([
      task('a', { order: 0 }),
      task('b', { parentId: 'a', order: 0 }),
      task('c', { parentId: 'b', order: 0 })
    ])

    assert.equal(tree.length, 1)
    assert.equal(tree[0].level, 0)
    assert.equal(tree[0].children[0].id, 'b')
    assert.equal(tree[0].children[0].level, 1)
    assert.equal(tree[0].children[0].children[0].level, 2)
  })

  test('order değerine göre sıralanır', () => {
    const tree = buildTaskTree([
      task('a', { order: 2 }),
      task('b', { order: 0 }),
      task('c', { order: 1 })
    ])
    assert.deepEqual(tree.map(n => n.id), ['b', 'c', 'a'])
  })

  test('kendini üst gösteren kayıt sonsuz döngüye girmez', () => {
    const tree = buildTaskTree([task('a', { parentId: 'a' })])
    assert.equal(tree.length, 1)
    assert.equal(tree[0].level, 0)
  })

  test('karşılıklı üst görev döngüsü kırılır', () => {
    const tree = buildTaskTree([
      task('a', { parentId: 'b' }),
      task('b', { parentId: 'a' })
    ])
    // Biri köke alınmalı, çağrı geri dönmeli
    assert.ok(tree.length >= 1)
  })

  test('olmayan üst görev köke alınır', () => {
    const tree = buildTaskTree([task('a', { parentId: 'yok' })])
    assert.equal(tree.length, 1)
    assert.equal(tree[0].level, 0)
  })
})

describe('yeniden üst görev atama', () => {
  const tasks = [
    task('a'),
    task('b', { parentId: 'a' }),
    task('c', { parentId: 'b' }),
    task('d')
  ]

  test('alt görev id listesi', () => {
    assert.deepEqual([...collectDescendantIds(tasks, 'a')].sort(), ['b', 'c'])
  })

  test('görev kendi alt ağacına taşınamaz', () => {
    assert.equal(canReparent(tasks, 'a', 'b'), false)
    assert.equal(canReparent(tasks, 'a', 'c'), false)
    assert.equal(canReparent(tasks, 'a', 'a'), false)
  })

  test('geçerli taşımaya izin verilir', () => {
    assert.equal(canReparent(tasks, 'a', 'd'), true)
    assert.equal(canReparent(tasks, 'c', undefined), true)
  })
})

describe('bağımlılık döngüsü', () => {
  test('doğrudan karşılıklı bağımlılık yakalanır', () => {
    const tasks = [task('a', { dependencies: ['b'] }), task('b')]
    assert.equal(wouldCreateDependencyCycle(tasks, 'b', 'a'), true)
  })

  test('dolaylı döngü yakalanır', () => {
    const tasks = [
      task('a', { dependencies: ['b'] }),
      task('b', { dependencies: ['c'] }),
      task('c')
    ]
    assert.equal(wouldCreateDependencyCycle(tasks, 'c', 'a'), true)
    assert.equal(wouldCreateDependencyCycle(tasks, 'c', 'b'), true)
  })

  test('güvenli bağımlılığa izin verilir', () => {
    const tasks = [task('a'), task('b'), task('c')]
    assert.equal(wouldCreateDependencyCycle(tasks, 'a', 'b'), false)
  })

  test('seçenek listesi kendini ve döngü yapanları eler', () => {
    const tasks = [
      task('a', { dependencies: ['b'] }),
      task('b'),
      task('c', { parentId: 'a' }),
      task('d')
    ]
    const options = getDependencyOptions(tasks, 'b').map(t => t.id)
    assert.ok(!options.includes('b'), 'kendisi olmamalı')
    assert.ok(!options.includes('a'), 'döngü yapan olmamalı')
    assert.ok(options.includes('d'))
  })
})

describe('geriye dönük uyumluluk', () => {
  // Uygulamanın ürettiği gerçek dışa aktarma biçimi
  const legacyExport = {
    version: '1.0.0',
    exportedAt: '2026-01-04T10:00:00.000Z',
    projects: [{
      id: 'p1',
      name: 'Eski Proje',
      description: 'Açıklama',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      color: 'blue',
      createdAt: 1735900000000,
      updatedAt: 1735900000000
    }],
    tasks: [{
      id: 't1',
      projectId: 'p1',
      name: 'Analiz',
      startDate: '2026-01-01',
      endDate: '2026-02-15',
      progress: 50,
      color: 'mint',
      dependencies: [],
      order: 0,
      collapsed: false,
      createdAt: 1735900000000,
      updatedAt: 1735900000000
    }, {
      id: 't2',
      projectId: 'p1',
      parentId: 't1',
      name: 'Alt görev',
      startDate: '2026-01-03',
      endDate: '2026-01-17',
      progress: 0,
      color: 'peach',
      dependencies: ['t1'],
      order: 0,
      createdAt: 1735900000000,
      updatedAt: 1735900000000
    }]
  }

  test('mevcut dışa aktarma birebir korunur', () => {
    const result = normalizeImport(legacyExport.projects, legacyExport.tasks)

    assert.equal(result.projects.length, 1)
    assert.equal(result.tasks.length, 2)
    assert.equal(result.droppedProjects, 0)
    assert.equal(result.droppedTasks, 0)
    assert.equal(result.brokenDependencies, 0)
    assert.equal(result.brokenParents, 0)

    assert.deepEqual(result.projects[0], legacyExport.projects[0])
    assert.equal(result.tasks[0].name, 'Analiz')
    assert.equal(result.tasks[0].progress, 50)
    assert.equal(result.tasks[1].parentId, 't1')
    assert.deepEqual(result.tasks[1].dependencies, ['t1'])
    // Tarihler asla yeniden yazılmaz
    assert.equal(result.tasks[1].startDate, '2026-01-03')
  })

  test('eksik alanlar güvenli varsayılanlarla dolar', () => {
    const result = normalizeImport(
      [{ id: 'p1', name: 'P' }],
      [{ id: 't1', projectId: 'p1', name: 'T' }] // dependencies, progress, order yok
    )

    assert.equal(result.tasks.length, 1)
    assert.deepEqual(result.tasks[0].dependencies, [], 'dependencies dizi olmalı')
    assert.equal(result.tasks[0].progress, 0)
    assert.equal(typeof result.tasks[0].order, 'number')
    assert.equal(typeof result.tasks[0].createdAt, 'number')
  })

  test('ters tarihli kayıt reddedilmez, olduğu gibi kalır', () => {
    const result = normalizeImport(
      [{ id: 'p1', name: 'P' }],
      [{ id: 't1', projectId: 'p1', name: 'T', startDate: '2026-05-10', endDate: '2026-05-01' }]
    )
    assert.equal(result.tasks.length, 1)
    assert.equal(result.tasks[0].startDate, '2026-05-10')
    assert.equal(result.tasks[0].endDate, '2026-05-01')
  })

  test('bozuk referanslar temizlenir ve raporlanır', () => {
    const result = normalizeImport(
      [{ id: 'p1', name: 'P' }],
      [
        { id: 't1', projectId: 'p1', name: 'T1', parentId: 'yok', dependencies: ['hayalet'] },
        { id: 't2', projectId: 'baskaProje', name: 'Sahipsiz' }
      ]
    )

    assert.equal(result.tasks.length, 1)
    assert.equal(result.tasks[0].parentId, undefined)
    assert.deepEqual(result.tasks[0].dependencies, [])
    assert.equal(result.brokenParents, 1)
    assert.equal(result.brokenDependencies, 1)
    assert.equal(result.orphanTasks, 1)
  })

  test('bağımlılık döngüsü içe aktarmada kırılır', () => {
    const result = normalizeImport(
      [{ id: 'p1', name: 'P' }],
      [
        { id: 'a', projectId: 'p1', name: 'A', dependencies: ['b'] },
        { id: 'b', projectId: 'p1', name: 'B', dependencies: ['a'] }
      ]
    )

    const cycleRemains =
      result.tasks[0].dependencies.includes('b') && result.tasks[1].dependencies.includes('a')
    assert.equal(cycleRemains, false, 'döngü kalmamalı')
    assert.ok(result.brokenDependencies > 0)
  })

  test('geçersiz renk ve ilerleme düzeltilir', () => {
    const result = normalizeImport(
      [{ id: 'p1', name: 'P', color: 'mor' }],
      [{ id: 't1', projectId: 'p1', name: 'T', color: 'yok', progress: 500 }]
    )
    assert.equal(result.projects[0].color, 'mint')
    assert.equal(result.tasks[0].color, 'mint')
    assert.equal(result.tasks[0].progress, 100)
  })

  test('çöp veri uygulamayı çökertmez', () => {
    for (const input of [null, undefined, 'string', 42, {}, [null, 5, 'x']]) {
      const result = normalizeImport(input as any, input as any)
      assert.ok(Array.isArray(result.projects))
      assert.ok(Array.isArray(result.tasks))
    }
  })
})

describe('mermaid çıktısı', () => {
  const project = {
    id: 'p1', name: 'Test: Projesi', startDate: '2026-01-01', endDate: '2026-12-31',
    color: 'mint', createdAt: 1, updatedAt: 1
  } as any

  test('birden fazla bağımlılık yazılır', () => {
    const out = projectToMermaid(project, [
      task('a', { order: 0 }),
      task('b', { order: 1 }),
      task('c', { order: 2, dependencies: ['a', 'b'] })
    ])
    assert.match(out, /after task_a task_b/)
  })

  test('henüz tanımlanmamış bağımlılık tarihe düşer', () => {
    const out = projectToMermaid(project, [
      task('a', { order: 0, dependencies: ['b'] }),
      task('b', { order: 1 })
    ])
    assert.ok(!out.includes('after task_b'), 'ileri referans yazılmamalı')
    assert.match(out, /task_a, 2026-01-01, 10d/)
  })

  test('ters tarihli görevde süre negatif olmaz', () => {
    const out = projectToMermaid(project, [
      task('a', { startDate: '2026-05-10', endDate: '2026-05-01' })
    ])
    assert.ok(!out.includes('-'.concat('9d')), 'negatif süre olmamalı')
    assert.match(out, /1d/)
  })

  test('başlıktaki iki nokta temizlenir', () => {
    const out = projectToMermaid(project, [task('a')])
    assert.match(out, /title Test - Projesi/)
  })

  test('hafta sonu hariç tutma kaldırıldı', () => {
    // Uygulama takvim günü modeliyle çalışıyor, excludes weekends
    // Mermaid tarafında süreleri kaydırıyordu
    const out = projectToMermaid(project, [task('a')])
    assert.ok(!out.includes('excludes weekends'))
  })
})
