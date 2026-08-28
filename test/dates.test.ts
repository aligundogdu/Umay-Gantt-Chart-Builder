import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseDate,
  toISODate,
  daysDiff,
  addMonths,
  addDays,
  getTimelineRange,
  getRangeDays,
  getMonthsInRange,
  getMonthDaysInRange,
  getDatePosition,
  getBarWidth,
  shiftRange,
  getRangeCenter
} from '../app/utils/dates.ts'

describe('tarih ayrıştırma', () => {
  test('ISO string yerel takvim günü olarak okunur', () => {
    const d = parseDate('2026-01-01')
    assert.equal(d.getFullYear(), 2026)
    assert.equal(d.getMonth(), 0)
    assert.equal(d.getDate(), 1)
  })

  test('toISODate gidiş dönüşte aynı günü verir', () => {
    for (const iso of ['2026-01-01', '2026-02-28', '2024-02-29', '2026-12-31', '2026-06-15']) {
      assert.equal(toISODate(iso), iso, `${iso} korunmalı`)
    }
  })

  test('yerel gece yarısı bir gün geriye kaymaz', () => {
    // toISOString() burada UTC+3'te bir önceki günü döndürüyordu
    assert.equal(toISODate(new Date(2026, 0, 1)), '2026-01-01')
    assert.equal(toISODate(new Date(2026, 11, 31)), '2026-12-31')
  })
})

describe('gün farkı', () => {
  test('aynı gün sıfır', () => {
    assert.equal(daysDiff('2026-01-01', '2026-01-01'), 0)
  })

  test('aralık başlangıcındaki görev sıfır ofsette', () => {
    // Asıl hata buydu: yerel aralık başlangıcı ile UTC görev tarihi
    // karıştığı için ofset 1 çıkıyor ve bar bir gün sağa kayıyordu
    const range = getTimelineRange('year', '2026-06-15')
    assert.equal(daysDiff(range.start, '2026-01-01'), 0)
    assert.equal(getDatePosition('2026-01-01', range), 0)
  })

  test('ay ve yıl sınırları', () => {
    assert.equal(daysDiff('2026-01-31', '2026-02-01'), 1)
    assert.equal(daysDiff('2026-02-28', '2026-03-01'), 1)
    assert.equal(daysDiff('2024-02-28', '2024-03-01'), 2) // artık yıl
    assert.equal(daysDiff('2026-01-01', '2027-01-01'), 365)
  })

  test('negatif yön', () => {
    assert.equal(daysDiff('2026-01-10', '2026-01-01'), -9)
  })
})

describe('ay ekleme', () => {
  test('ay sonu taşması kırpılır', () => {
    // 31 Ocak + 1 ay, 3 Mart değil 28 Şubat olmalı
    assert.equal(toISODate(addMonths('2026-01-31', 1)), '2026-02-28')
    assert.equal(toISODate(addMonths('2024-01-31', 1)), '2024-02-29')
    assert.equal(toISODate(addMonths('2026-03-31', -1)), '2026-02-28')
  })

  test('normal durumlar', () => {
    assert.equal(toISODate(addMonths('2026-01-15', 2)), '2026-03-15')
    assert.equal(toISODate(addDays('2026-12-31', 1)), '2027-01-01')
  })
})

describe('timeline aralığı', () => {
  test('her mod ay sınırlarına hizalı', () => {
    for (const mode of ['month', 'quarter', 'year', '2year', '3year'] as const) {
      const range = getTimelineRange(mode, '2026-05-17')
      assert.equal(range.start.getDate(), 1, `${mode} ay başında başlamalı`)

      const dayAfterEnd = addDays(range.end, 1)
      assert.equal(dayAfterEnd.getDate(), 1, `${mode} ay sonunda bitmeli`)
    }
  })

  test('ay genişliklerinin toplamı aralığın gün sayısına eşit', () => {
    // Izgara sütunları ile bar konumlarının hizalanmasının şartı budur
    for (const mode of ['month', 'quarter', 'year', '2year', '3year'] as const) {
      for (const center of ['2026-01-01', '2024-02-15', '2026-11-30']) {
        const range = getTimelineRange(mode, center)
        const months = getMonthsInRange(range)
        const sum = months.reduce((acc, m) => acc + getMonthDaysInRange(m, range), 0)
        assert.equal(sum, getRangeDays(range), `${mode} @ ${center}`)
      }
    }
  })

  test('yıl modları yıl başına sabitlenir', () => {
    const range = getTimelineRange('2year', '2026-07-04')
    assert.equal(toISODate(range.start), '2026-01-01')
    assert.equal(toISODate(range.end), '2027-12-31')
    assert.equal(getRangeDays(range), 730)
  })

  test('kaydırma ay hizasını korur', () => {
    let range = getTimelineRange('year', '2026-06-15')
    for (let i = 0; i < 5; i++) {
      range = shiftRange(range, 6)
      assert.equal(range.start.getDate(), 1)
      assert.equal(addDays(range.end, 1).getDate(), 1)
      assert.equal(getMonthsInRange(range).length, 12)
    }
  })

  test('görünüm modu değişince merkez korunur', () => {
    const range = getTimelineRange('year', '2030-01-01')
    const center = getRangeCenter(range)
    assert.equal(center.getFullYear(), 2030)
  })
})

describe('bar geometrisi', () => {
  test('aralığı tamamen kaplayan görev yüzde 0 - 100', () => {
    const range = getTimelineRange('year', '2026-06-15')
    assert.equal(getDatePosition('2026-01-01', range), 0)
    assert.equal(getBarWidth('2026-01-01', '2026-12-31', range), 100)
  })

  test('tek günlük görev bir günlük genişlik', () => {
    const range = getTimelineRange('year', '2026-06-15')
    const expected = (1 / 365) * 100
    assert.ok(Math.abs(getBarWidth('2026-03-05', '2026-03-05', range) - expected) < 1e-9)
  })

  test('konum aralık boyunca doğrusal', () => {
    const range = getTimelineRange('year', '2026-06-15')
    // 1 Temmuz, yılın 181. günü (0 tabanlı)
    const expected = (181 / 365) * 100
    assert.ok(Math.abs(getDatePosition('2026-07-01', range) - expected) < 1e-9)
  })
})
