import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildTaskTree,
  collectDescendantIds,
  canReparent,
  wouldCreateDependencyCycle,
  getDependencyOptions,
  normalizeImport,
  taskMatchesQuery,
  collectSearchVisibility,
  foldSearchText
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

describe('tarihe göre sıralama', () => {
  const unsorted = [
    task('a', { order: 0, startDate: '2026-06-01', endDate: '2026-06-10' }),
    task('b', { order: 1, startDate: '2026-01-15', endDate: '2026-02-01' }),
    task('c', { order: 2, startDate: '2026-03-20', endDate: '2026-04-01' })
  ]

  test('manuel mod order alanını kullanır', () => {
    const tree = buildTaskTree(unsorted, 'manual')
    assert.deepEqual(tree.map(n => n.id), ['a', 'b', 'c'])
  })

  test('tarih modu başlangıca göre sıralar', () => {
    const tree = buildTaskTree(unsorted, 'date')
    assert.deepEqual(tree.map(n => n.id), ['b', 'c', 'a'])
  })

  test('sıralama order alanını değiştirmez', () => {
    const before = unsorted.map(t => ({ id: t.id, order: t.order }))
    buildTaskTree(unsorted, 'date')
    const after = unsorted.map(t => ({ id: t.id, order: t.order }))
    assert.deepEqual(after, before, 'kaynak veri korunmalı')
  })

  test('geçiş kayıpsız geri alınabilir', () => {
    const manualBefore = buildTaskTree(unsorted, 'manual').map(n => n.id)
    buildTaskTree(unsorted, 'date')
    const manualAfter = buildTaskTree(unsorted, 'manual').map(n => n.id)
    assert.deepEqual(manualAfter, manualBefore)
  })

  test('aynı başlangıçta bitiş tarihi belirleyici', () => {
    const tree = buildTaskTree([
      task('gec', { order: 0, startDate: '2026-01-01', endDate: '2026-05-01' }),
      task('erken', { order: 1, startDate: '2026-01-01', endDate: '2026-02-01' })
    ], 'date')
    assert.deepEqual(tree.map(n => n.id), ['erken', 'gec'])
  })

  test('her ikisi eşitse manuel sıra korunur', () => {
    const tree = buildTaskTree([
      task('ikinci', { order: 1, startDate: '2026-01-01', endDate: '2026-02-01' }),
      task('birinci', { order: 0, startDate: '2026-01-01', endDate: '2026-02-01' })
    ], 'date')
    assert.deepEqual(tree.map(n => n.id), ['birinci', 'ikinci'])
  })

  test('sıralama hiyerarşiyi bozmaz, kardeşler arasında çalışır', () => {
    const tree = buildTaskTree([
      task('ust', { order: 0, startDate: '2026-09-01' }),
      task('alt-gec', { parentId: 'ust', order: 0, startDate: '2026-11-01' }),
      task('alt-erken', { parentId: 'ust', order: 1, startDate: '2026-10-01' }),
      task('digerUst', { order: 1, startDate: '2026-02-01' })
    ], 'date')

    // Kökler tarihe göre, alt görevler üst görevin altında kalmalı
    assert.deepEqual(tree.map(n => n.id), ['digerUst', 'ust'])
    const ust = tree.find(n => n.id === 'ust')!
    assert.deepEqual(ust.children.map(n => n.id), ['alt-erken', 'alt-gec'])
  })
})

describe('görev arama', () => {
  const tasks = [
    task('ust', { name: 'Tasarım' }),
    task('alt', { parentId: 'ust', name: 'Renk paleti', description: 'Şablon hazırlığı' }),
    task('digersi', { name: 'Geliştirme', notes: 'API bağlantısı' })
  ] as any[]

  test('boş sorgu filtre uygulamaz', () => {
    assert.equal(collectSearchVisibility(tasks, ''), null)
    assert.equal(collectSearchVisibility(tasks, '   '), null)
  })

  test('ad, açıklama ve notlarda arar', () => {
    assert.ok(taskMatchesQuery(tasks[0], 'tasar'))
    assert.ok(taskMatchesQuery(tasks[1], 'şablon'))
    assert.ok(taskMatchesQuery(tasks[2], 'api'))
    assert.ok(!taskMatchesQuery(tasks[2], 'tasarım'))
  })

  test('türkçe karakterler sadeleşir', () => {
    assert.equal(foldSearchText('Görev Şablonu ÇIĞ'), 'gorev sablonu cig')
    assert.ok(taskMatchesQuery(tasks[0], 'tasarim'))
    assert.ok(taskMatchesQuery(tasks[1], 'sablon'))
  })

  test('eşleşen alt görevin üst görevi de listede kalır', () => {
    const { visible, matches, expand } = collectSearchVisibility(tasks, 'palet')!
    assert.deepEqual([...visible].sort(), ['alt', 'ust'])
    assert.deepEqual([...matches], ['alt'])
    // Üst görev kapalı olsa bile açılmalı, yoksa sonuç görünmezdi
    assert.deepEqual([...expand], ['ust'])
  })

  test('eşleşen üst görevin alt ağacı bağlam olarak kalır', () => {
    const { visible, matches, expand } = collectSearchVisibility(tasks, 'tasarım')!
    assert.deepEqual([...visible].sort(), ['alt', 'ust'])
    assert.deepEqual([...matches], ['ust'])
    // Eşleşen görevin kendi dalı kapalıysa kapalı kalabilir
    assert.equal(expand.size, 0)
  })

  test('eşleşme yoksa küme boş döner', () => {
    const { visible, matches } = collectSearchVisibility(tasks, 'bulunmayan')!
    assert.equal(visible.size, 0)
    assert.equal(matches.size, 0)
  })

  test('üst görev zinciri döngülü veride sonsuza gitmez', () => {
    const cyclic = [
      task('a', { parentId: 'b', name: 'Alfa' }),
      task('b', { parentId: 'a', name: 'Beta' })
    ] as any[]
    const { visible } = collectSearchVisibility(cyclic, 'alfa')!
    assert.deepEqual([...visible].sort(), ['a', 'b'])
  })

  test('derin alt ağaç tümüyle listede kalır', () => {
    const deep = [
      task('kok', { name: 'Kök görev' }),
      task('orta', { parentId: 'kok', name: 'Orta' }),
      task('yaprak', { parentId: 'orta', name: 'Yaprak' })
    ] as any[]
    const { visible } = collectSearchVisibility(deep, 'kök')!
    assert.deepEqual([...visible].sort(), ['kok', 'orta', 'yaprak'])
  })
})

describe('bitti işareti', () => {
  test('normalizasyon completed alanını korur', () => {
    const result = normalizeImport(
      [{ id: 'p1', name: 'P' }],
      [
        { id: 't1', projectId: 'p1', name: 'Biten', completed: true },
        { id: 't2', projectId: 'p1', name: 'Süren' }
      ]
    )
    assert.equal(result.tasks[0].completed, true)
    assert.equal(result.tasks[1].completed, false)
  })

  test('geçersiz completed değeri false olur', () => {
    const result = normalizeImport(
      [{ id: 'p1', name: 'P' }],
      [{ id: 't1', projectId: 'p1', name: 'X', completed: 'evet' }]
    )
    assert.equal(result.tasks[0].completed, false)
  })
})
