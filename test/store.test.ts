import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import * as vue from 'vue'
import { createPinia, setActivePinia } from 'pinia'

// ============================================================
// Nuxt ortamı taklidi.
// Store dosyası ref/computed gibi yardımcıları Nuxt auto-import ile
// kullanıyor; tarayıcı olmadan koşturmak için global'e bağlanıyorlar.
// ============================================================
Object.assign(globalThis, {
  ref: vue.ref,
  computed: vue.computed,
  watch: vue.watch,
  reactive: vue.reactive,
  nextTick: vue.nextTick
})

// localStorage taklidi. Yazma sayısını da sayar, böylece sürükleme
// sırasında kaç kez diske yazıldığı ölçülebilir.
let writeCount = 0
const memory = new Map<string, string>()

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => (memory.has(k) ? memory.get(k)! : null),
    setItem: (k: string, v: string) => { writeCount++; memory.set(k, v) },
    removeItem: (k: string) => { memory.delete(k) },
    clear: () => memory.clear()
  }
})

// window varlığı kontrol ediliyor
Object.defineProperty(globalThis, 'window', { configurable: true, value: globalThis })

const { useGanttStore } = await import('../app/stores/gantt.ts')

function freshStore() {
  memory.clear()
  writeCount = 0
  setActivePinia(createPinia())
  return useGanttStore()
}

async function storeWithProject() {
  const store = freshStore()
  await store.loadProjects()
  await store.createProject({ name: 'Test Projesi', color: 'mint' })
  return store
}

describe('proje ve görev yaşam döngüsü', () => {
  test('proje oluşturulur ve seçilir', async () => {
    const store = await storeWithProject()
    assert.equal(store.projects.length, 1)
    assert.equal(store.currentProject?.name, 'Test Projesi')
  })

  test('görev oluşturulur ve kalıcı olur', async () => {
    const store = await storeWithProject()
    await store.createTask({ name: 'Analiz' })

    assert.equal(store.currentTasks.length, 1)

    // Yeniden yükleyince veri duruyor mu
    await store.loadProjects()
    assert.equal(store.currentTasks.length, 1)
    assert.equal(store.currentTasks[0].name, 'Analiz')
  })

  test('görev silindiğinde alt görevleri ve bağımlılıkları temizlenir', async () => {
    const store = await storeWithProject()
    const parent = await store.createTask({ name: 'Üst' })
    const child = await store.createTask({ name: 'Alt', parentId: parent!.id })
    const other = await store.createTask({ name: 'Diğer' })
    await store.updateTask(other!.id, { dependencies: [child!.id] })

    await store.deleteTask(parent!.id)

    assert.equal(store.currentTasks.length, 1)
    assert.deepEqual(store.currentTasks[0].dependencies, [], 'ölü bağımlılık kalmamalı')
  })
})

describe('sürükleme yazma davranışı', () => {
  test('önizleme diske yazmaz, yalnızca commit yazar', async () => {
    const store = await storeWithProject()
    const task = await store.createTask({ name: 'Sürüklenen', startDate: '2026-03-01', endDate: '2026-03-10' })

    const before = writeCount

    // 50 fare hareketi taklidi
    for (let i = 1; i <= 50; i++) {
      store.previewTaskDates(task!.id, `2026-03-${String(i % 28 + 1).padStart(2, '0')}`, '2026-03-20')
    }

    assert.equal(writeCount, before, 'sürükleme sırasında yazma olmamalı')
    // Bellekte güncellenmiş olmalı
    assert.equal(store.currentTasks[0].endDate, '2026-03-20')

    await store.commitTaskDates(task!.id, '2026-04-01', '2026-04-15')
    assert.ok(writeCount > before, 'bırakınca bir kez yazılmalı')

    await store.loadProjects()
    assert.equal(store.currentTasks[0].startDate, '2026-04-01')
  })
})

describe('salt okunur mod', () => {
  test('yazma işlemleri engellenir', async () => {
    const store = await storeWithProject()
    await store.createTask({ name: 'Var olan' })

    store.setViewOnly(true)

    const created = await store.createTask({ name: 'Olmamalı' })
    assert.equal(created, null)
    assert.equal(store.currentTasks.length, 1)

    await store.updateTask(store.currentTasks[0].id, { name: 'Değişmemeli' })
    assert.equal(store.currentTasks[0].name, 'Var olan')

    await store.deleteTask(store.currentTasks[0].id)
    assert.equal(store.currentTasks.length, 1)
  })

  test('proje seçimi kullanıcının verisini boşaltmaz', async () => {
    const store = await storeWithProject()
    await store.createTask({ name: 'Görev' })

    await store.loadSharedProjectViewOnly(
      { id: 'paylasilan', name: 'Paylaşılan', startDate: '2026-01-01', endDate: '2026-12-31', color: 'blue', createdAt: 1, updatedAt: 1 },
      [{ id: 'pt1', projectId: 'paylasilan', name: 'Paylaşılan görev', startDate: '2026-02-01', endDate: '2026-02-10', progress: 0, color: 'mint', dependencies: [], order: 0, createdAt: 1, updatedAt: 1 }]
    )

    assert.equal(store.isViewOnly, true)
    assert.equal(store.currentTasks.length, 1)

    // Asıl hata buydu: tıklayınca localStorage'da olmayan id sorgulanıp
    // görev listesi boşalıyordu
    await store.selectProject('paylasilan')
    assert.equal(store.currentTasks.length, 1, 'görevler kaybolmamalı')
  })

  test('moddan çıkınca kendi verisine dönülür', async () => {
    const store = await storeWithProject()
    await store.createTask({ name: 'Kendi görevim' })

    await store.loadSharedProjectViewOnly(
      { id: 'paylasilan', name: 'Paylaşılan', startDate: '2026-01-01', endDate: '2026-12-31', color: 'blue', createdAt: 1, updatedAt: 1 },
      []
    )
    assert.equal(store.hasOwnData, true)

    await store.exitViewOnly()

    assert.equal(store.isViewOnly, false)
    assert.equal(store.currentProject?.name, 'Test Projesi')
    assert.equal(store.currentTasks[0].name, 'Kendi görevim')
  })
})

describe('sıralama ve hiyerarşi', () => {
  test('farklı üst göreve bırakma çalışır', async () => {
    const store = await storeWithProject()
    const a = await store.createTask({ name: 'A' })
    const b = await store.createTask({ name: 'B' })
    const child = await store.createTask({ name: 'A-alt', parentId: a!.id })

    // Önceden farklı parent'a bırakma sessizce yok sayılıyordu
    await store.reorderTasks(child!.id, b!.id, 'after')

    const updated = store.currentTasks.find(t => t.id === child!.id)!
    assert.equal(updated.parentId, undefined, 'kök seviyeye taşınmalı')
  })

  test('görev kendi alt ağacına taşınamaz', async () => {
    const store = await storeWithProject()
    const parent = await store.createTask({ name: 'Üst' })
    const child = await store.createTask({ name: 'Alt', parentId: parent!.id })

    await store.setTaskParent(parent!.id, child!.id)

    const updated = store.currentTasks.find(t => t.id === parent!.id)!
    assert.equal(updated.parentId, undefined)
    assert.match(store.errorMessage, /alt görevinin altına/)
  })

  test('yukarı taşıma sırayı değiştirir', async () => {
    const store = await storeWithProject()
    const a = await store.createTask({ name: 'A' })
    const b = await store.createTask({ name: 'B' })

    await store.moveTask(b!.id, 'up')

    assert.deepEqual(store.flattenedTasks.map(t => t.name), ['B', 'A'])
  })

  test('collapse durumu kalıcı', async () => {
    const store = await storeWithProject()
    const parent = await store.createTask({ name: 'Üst' })
    await store.createTask({ name: 'Alt', parentId: parent!.id })

    assert.equal(store.flattenedTasks.length, 2)

    await store.toggleTaskCollapse(parent!.id)
    assert.equal(store.flattenedTasks.length, 1)

    // Yeniden yükleyince kapalı kalmalı
    await store.loadProjects()
    assert.equal(store.flattenedTasks.length, 1, 'collapse durumu korunmalı')
  })
})

describe('içe aktarma', () => {
  const incoming = {
    projects: [{ id: 'x1', name: 'Gelen Proje', startDate: '2026-01-01', endDate: '2026-12-31', color: 'peach', createdAt: 1, updatedAt: 1 }],
    tasks: [{ id: 'xt1', projectId: 'x1', name: 'Gelen görev', startDate: '2026-03-01', endDate: '2026-03-10', progress: 0, color: 'mint', dependencies: [], order: 0, createdAt: 1, updatedAt: 1 }]
  }

  test('birleştirme mevcut veriyi korur', async () => {
    const store = await storeWithProject()
    await store.createTask({ name: 'Kendi görevim' })

    await store.mergeData(incoming.projects as any, incoming.tasks as any)

    assert.equal(store.projects.length, 2, 'iki proje de durmalı')
    assert.ok(store.projects.some(p => p.name === 'Test Projesi'))
    assert.ok(store.projects.some(p => p.name === 'Gelen Proje'))
  })

  test('birleştirmede yeni kimlik üretilir', async () => {
    const store = await storeWithProject()
    await store.mergeData(incoming.projects as any, incoming.tasks as any)
    await store.mergeData(incoming.projects as any, incoming.tasks as any)

    // Aynı dosya iki kez eklenince çakışma olmamalı
    assert.equal(store.projects.length, 3)
    const ids = new Set(store.projects.map(p => p.id))
    assert.equal(ids.size, 3, 'kimlikler benzersiz olmalı')
  })

  test('üzerine yazmadan önce yedek alınır ve geri yüklenebilir', async () => {
    const store = await storeWithProject()
    await store.createTask({ name: 'Kaybolmamalı' })

    await store.importData(incoming.projects as any, incoming.tasks as any)
    assert.equal(store.projects.length, 1)
    assert.equal(store.projects[0].name, 'Gelen Proje')

    await store.restoreBackup()
    assert.equal(store.projects[0].name, 'Test Projesi')
    assert.equal(store.currentTasks[0].name, 'Kaybolmamalı')
  })

  test('tümünü silme sonrası geri yükleme', async () => {
    const store = await storeWithProject()
    await store.createTask({ name: 'Geri gelmeli' })

    await store.clearAllData()
    assert.equal(store.projects.length, 0)

    await store.restoreBackup()
    assert.equal(store.projects.length, 1)
    assert.equal(store.currentTasks[0].name, 'Geri gelmeli')
  })
})

describe('timeline', () => {
  test('ileri tarihli proje seçilince o tarihe odaklanılır', async () => {
    const store = freshStore()
    await store.loadProjects()
    const project = await store.createProject({ name: 'Gelecek', color: 'mint' })
    await store.updateProject(project!.id, { startDate: '2031-06-01', endDate: '2032-06-01' })
    await store.selectProject(project!.id)

    // Önceden aralık her zaman bugün merkezliydi, proje boş görünüyordu
    assert.equal(store.dateRange.start.getFullYear(), 2031)
  })

  test('görünüm modu değişince bakılan konum korunur', async () => {
    const store = await storeWithProject()
    store.setViewMode('year')

    // 2030'a kaydır
    while (store.dateRange.start.getFullYear() < 2030) store.scrollTimeline('next')
    const yearBefore = store.dateRange.start.getFullYear()

    store.setViewMode('2year')

    assert.ok(
      Math.abs(store.dateRange.start.getFullYear() - yearBefore) <= 1,
      'bugüne geri atlamamalı'
    )
  })
})

describe('sıralama modu', () => {
  async function storeWithDates() {
    const store = await storeWithProject()
    await store.createTask({ name: 'Haziran', startDate: '2026-06-01', endDate: '2026-06-10' })
    await store.createTask({ name: 'Ocak', startDate: '2026-01-15', endDate: '2026-02-01' })
    await store.createTask({ name: 'Mart', startDate: '2026-03-20', endDate: '2026-04-01' })
    return store
  }

  test('varsayılan manuel sıra', async () => {
    const store = await storeWithDates()
    assert.deepEqual(store.flattenedTasks.map(t => t.name), ['Haziran', 'Ocak', 'Mart'])
  })

  test('tuş tarihe göre sıralar ve tekrar basınca geri alır', async () => {
    const store = await storeWithDates()

    store.toggleSortMode()
    assert.equal(store.isDateSorted, true)
    assert.deepEqual(store.flattenedTasks.map(t => t.name), ['Ocak', 'Mart', 'Haziran'])

    store.toggleSortMode()
    assert.equal(store.isDateSorted, false)
    assert.deepEqual(store.flattenedTasks.map(t => t.name), ['Haziran', 'Ocak', 'Mart'])
  })

  test('sıralama görevlerin order alanını bozmaz', async () => {
    const store = await storeWithDates()
    const before = store.currentTasks.map(t => ({ id: t.id, order: t.order }))

    store.toggleSortMode()
    const after = store.currentTasks.map(t => ({ id: t.id, order: t.order }))

    assert.deepEqual(after, before, 'kayıtlı sıra değişmemeli')
  })

  test('tercih yeniden yüklemede korunur', async () => {
    const store = await storeWithDates()
    store.setSortMode('date')

    await store.loadProjects()
    assert.equal(store.isDateSorted, true)
  })

  test('tarih modunda elle sıralama engellenir ve uyarı verilir', async () => {
    const store = await storeWithDates()
    const orderBefore = store.currentTasks.map(t => t.order)

    store.setSortMode('date')
    const [first, second] = store.flattenedTasks
    await store.reorderTasks(second.id, first.id, 'before')

    assert.deepEqual(store.currentTasks.map(t => t.order), orderBefore)
    assert.match(store.errorMessage, /tarih sıralamasını kapatın/)
  })

  test('manuel moda dönünce sıralama yeniden çalışır', async () => {
    const store = await storeWithDates()
    store.setSortMode('date')
    store.setSortMode('manual')

    const [first, second] = store.flattenedTasks
    await store.reorderTasks(second.id, first.id, 'before')

    assert.equal(store.flattenedTasks[0].id, second.id)
  })
})
