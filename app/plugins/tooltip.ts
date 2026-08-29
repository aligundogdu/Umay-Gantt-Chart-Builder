// v-tip direktifi: küçük ikon butonları için ipucu balonu.
//
// Neden native title değil: başlık şeridi ve görev listesi overflow-hidden
// kapsayıcılar içinde, tarayıcının kendi ipucu ise ~1 saniye gecikiyor ve
// biçimlendirilemiyor. Balon tek bir düğüm olarak body'ye eklenir, böylece
// hiçbir kapsayıcı onu kırpamaz.
//
// Kullanım: <button v-tip="'Yakınlaştır'">  (aria-label ayrıca gerekli,
// balon yalnızca görsel bir ipucudur, erişilebilirlik adı değildir.)

const SHOW_DELAY_MS = 300
const GAP = 8
// Dokunmadan sonra tarayıcı fare olaylarını da taklit ediyor; bu pencere
// içinde hover yok sayılır, aksi halde dokunulan düğmenin balonu ekranda
// asılı kalıyordu (dokunmatikte mouseleave hiç gelmez).
const TOUCH_GRACE_MS = 800

let tooltipEl: HTMLElement | null = null
let showTimer: ReturnType<typeof setTimeout> | null = null
let activeTarget: HTMLElement | null = null
let lastTouchAt = 0

// Hover'ı olmayan cihazlarda balon hiç gösterilmez
function canHover(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true
  return window.matchMedia('(hover: hover)').matches
}

function ensureElement(): HTMLElement {
  if (tooltipEl) return tooltipEl

  const el = document.createElement('div')
  el.className = [
    'fixed z-[200] pointer-events-none',
    'px-2 py-1 rounded-md',
    'bg-surface-900 text-white text-[11px] font-medium leading-tight',
    'shadow-lg whitespace-nowrap',
    'opacity-0 transition-opacity duration-100'
  ].join(' ')
  el.setAttribute('role', 'presentation')
  document.body.appendChild(el)
  tooltipEl = el
  return el
}

function place(target: HTMLElement, text: string) {
  const el = ensureElement()
  el.textContent = text

  // Ölçüm için önce görünür konuma al
  el.style.left = '0px'
  el.style.top = '0px'

  const rect = target.getBoundingClientRect()
  const box = el.getBoundingClientRect()

  let left = rect.left + rect.width / 2 - box.width / 2
  // Ekranın dışına taşmasın
  left = Math.max(4, Math.min(left, window.innerWidth - box.width - 4))

  // Varsayılan konum üst; yukarıda yer yoksa alta geçer
  let top = rect.top - box.height - GAP
  if (top < 4) top = rect.bottom + GAP

  el.style.left = `${Math.round(left)}px`
  el.style.top = `${Math.round(top)}px`
  el.style.opacity = '1'
}

function hide() {
  if (showTimer) {
    clearTimeout(showTimer)
    showTimer = null
  }
  activeTarget = null
  if (tooltipEl) tooltipEl.style.opacity = '0'
}

function textOf(el: HTMLElement): string {
  return el.dataset.tip?.trim() || ''
}

function show(target: HTMLElement, immediate: boolean) {
  const text = textOf(target)
  if (!text) return
  if (!canHover()) return
  if (Date.now() - lastTouchAt < TOUCH_GRACE_MS) return

  activeTarget = target

  if (showTimer) clearTimeout(showTimer)
  if (immediate) {
    place(target, text)
    return
  }

  showTimer = setTimeout(() => {
    showTimer = null
    // Bu arada imleç başka yere gitmiş olabilir
    if (activeTarget === target) place(target, text)
  }, SHOW_DELAY_MS)
}

function onEnter(e: Event) {
  show(e.currentTarget as HTMLElement, false)
}

function onFocus(e: FocusEvent) {
  // Yalnızca klavyeyle gelen odakta göster; tıklamadan sonra balonun
  // açık kalması kafa karıştırıcı oluyordu.
  const target = e.currentTarget as HTMLElement
  if (typeof target.matches === 'function' && !target.matches(':focus-visible')) return
  show(target, true)
}

// Tıklama ve dokunma balonu kapatır: dokunmatik cihazda hover yok,
// açık kalan balon parmağın altındaki içeriği örtüyordu.
function onLeave() {
  hide()
}

function onTouch() {
  lastTouchAt = Date.now()
  hide()
}

export default defineNuxtPlugin(nuxtApp => {
  nuxtApp.vueApp.directive('tip', {
    mounted(el: HTMLElement, binding) {
      const text = String(binding.value ?? '')
      if (!text) return
      el.dataset.tip = text

      el.addEventListener('mouseenter', onEnter)
      el.addEventListener('mouseleave', onLeave)
      el.addEventListener('focus', onFocus as EventListener)
      el.addEventListener('blur', onLeave)
      el.addEventListener('click', onLeave)
      // Sürükleme başlarken balon havada kalmasın (ayırıcı, sıralama)
      el.addEventListener('mousedown', onLeave)
      el.addEventListener('touchstart', onTouch, { passive: true })
    },

    updated(el: HTMLElement, binding) {
      const text = String(binding.value ?? '')
      el.dataset.tip = text
      // Açık balonun metni değiştiyse (aç/kapa düğmeleri) yerinde güncelle
      if (activeTarget === el && tooltipEl && tooltipEl.style.opacity === '1') {
        if (text) place(el, text)
        else hide()
      }
    },

    beforeUnmount(el: HTMLElement) {
      if (activeTarget === el) hide()
      el.removeEventListener('mouseenter', onEnter)
      el.removeEventListener('mouseleave', onLeave)
      el.removeEventListener('focus', onFocus as EventListener)
      el.removeEventListener('blur', onLeave)
      el.removeEventListener('click', onLeave)
      el.removeEventListener('mousedown', onLeave)
      el.removeEventListener('touchstart', onTouch)
    }
  })

  if (typeof window !== 'undefined') {
    // Kaydırma veya pencere boyutu değişince balon havada kalmasın
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') hide()
    })
  }
})
