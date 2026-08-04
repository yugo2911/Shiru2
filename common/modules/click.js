import { SUPPORTS } from '@/modules/support.js'

// ─── Shared interaction state ────────────────────────────────────────────────

let lastTapElement = null
let lastTapTarget = null
let lastTapCurrent = null
let lastHoverElement = null
let lastInteractionMethod = 'mouse'

const noop = () => {}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clearTapState() {
  lastTapElement?.(false)
  lastTapElement = null
  lastHoverElement?.(false)
  lastHoverElement = null
  lastTapCurrent = null
  lastTapTarget = null
}

function isTapTargetMismatch(target, current) {
  return lastTapTarget !== target && (!lastTapCurrent || !target || !lastTapCurrent.contains(target))
}

function isTextInput(el) {
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

function ensureTabIndex(node) {
  if (!node.hasAttribute('tabindex')) node.tabIndex = 0
}

function makeButton(node) {
  ensureTabIndex(node)
  node.role = 'button'
}

// ─── Document-level listeners ─────────────────────────────────────────────────

document.addEventListener('mousedown', () => { lastInteractionMethod = 'mouse' })
document.addEventListener('touchstart', () => { lastInteractionMethod = 'touch' }, { passive: true })

document.addEventListener('focusin', e => {
  if (lastInteractionMethod !== 'dpad') return
  const activeEl = document.activeElement
  if (!isTextInput(activeEl) && !e.target?.closest('.select-all')) {
    window.getSelection()?.removeAllRanges()
  }
  if (isTapTargetMismatch(e.target, lastTapCurrent)) clearTapState()
})

document.addEventListener('pointercancel', e => {
  if (isTapTargetMismatch(e.target, lastTapCurrent)) clearTapState()
})

document.addEventListener('selectionchange', () => {
  const activeEl = document.activeElement
  if (!isTextInput(activeEl) && window.getSelection()?.toString()?.trim() === '') {
    window.getSelection()?.removeAllRanges()
  }
})

if (SUPPORTS.isAndroid) {
  document.addEventListener('touchstart', () => window.Capacitor.Plugins.StatusBar.hide(), { passive: true })
} else {
  // Prevent function keys from focusing non-tabbable elements
  document.addEventListener('focusin', e => {
    if (e.target.getAttribute('tabindex') === '-1' && !e.target.draggable) e.target.blur()
  }, true)
}

// ─── Svelte actions ──────────────────────────────────────────────────────────

/** @typedef {{element: Element, x: number, y: number, inViewport: boolean}} ElementPosition */

/**
 * Adds a click event listener to the node.
 * Vibrates on click and triggers the callback. Handles Enter key on non-Android.
 * @param {HTMLElement} node
 * @param {Function} [cb]
 */
export function click(node, cb = noop) {
  makeButton(node)

  node.addEventListener('click', e => {
    e.stopPropagation()
    navigator.vibrate(15)
    cb(e)
  })
  node.addEventListener('pointerup', e => e.stopPropagation())
  node.addEventListener('pointerleave', e => e.stopPropagation())

  if (!SUPPORTS.isAndroid) {
    node.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.stopPropagation()
        cb(e)
      }
    })
  }
}

/**
 * Fires a blur callback on Android only (used for exit/dismiss patterns).
 * @param {HTMLElement} node
 * @param {Function} [onBlur]
 */
export function blurExit(node, onBlur = noop) {
  if (!SUPPORTS.isAndroid) return
  makeButton(node)
  node.addEventListener('blur', () => onBlur())
}

/**
 * Calls `onClose` when the user presses down outside of `node`.
 * Optionally ignores targets matching `exclude` (a CSS selector or predicate),
 * e.g. the button that toggles the element open.
 * Pass `value` as either the callback directly, or `[onClose, exclude]`.
 * @param {HTMLElement} node
 * @param {Function|[Function, string|Function]} [value]
 * @param {string|Function} [exclude]
 */
export function closeOnClickOutside(node, value = noop, exclude = null) {
  if (Array.isArray(value)) {
    exclude = value[1]
    value = value[0]
  }
  const onClose = typeof value === 'function' ? value : noop

  function handle(e) {
    const target = e.target
    if (node.contains(target)) return
    if (exclude) {
      if (typeof exclude === 'function') { if (exclude(target)) return }
      else if (target.closest?.(exclude)) return
    }
    onClose()
  }
  document.addEventListener('mousedown', handle, true)
  return { destroy() { document.removeEventListener('mousedown', handle, true) } }
}

/**
 * Fires a callback when the pointer leaves the node.
 * @param {HTMLElement} node
 * @param {Function} [hoverUpdate]
 */
export function hoverExit(node, hoverUpdate = noop) {
  makeButton(node)
  node.addEventListener('pointerleave', () => hoverUpdate())
}

/**
 * Fires `focusUpdate(true)` 800 ms after focus; `focusUpdate(false)` on blur or outside click.
 * @param {HTMLElement} node
 * @param {Function} [focusUpdate]
 */
export function focus(node, focusUpdate = noop) {
  makeButton(node)

  let focusTimeout
  let blurTimeout

  function clearTimeouts() {
    clearTimeout(focusTimeout)
    clearTimeout(blurTimeout)
  }

  function resetTap() {
    lastTapElement = null
    lastTapCurrent = null
  }

  function handleOutsideClick(e) {
    const focused = e.target
    if (node && focused?.offsetParent != null && !node.contains(focused)) {
      clearTimeouts()
      focusUpdate(false)
      resetTap()
      document.removeEventListener('pointerup', handleOutsideClick)
    }
  }

  node.addEventListener('pointerleave', clearTimeouts)

  node.addEventListener('focus', () => {
    clearTimeouts()
    document.addEventListener('pointerup', handleOutsideClick)
    focusTimeout = setTimeout(() => focusUpdate(true), 800)
    focusTimeout.unref?.()
  })

  node.addEventListener('focusout', () => {
    clearTimeouts()
    blurTimeout = setTimeout(() => {
      const focused = document.activeElement
      if (node && focused?.offsetParent != null && !node.contains(focused)) {
        focusUpdate(false)
        resetTap()
        document.removeEventListener('pointerup', handleOutsideClick)
      }
    })
    blurTimeout.unref?.()
  })
}

/**
 * Fires `hoverUpdate(true/false)` on pointer enter/leave, and toggles tap-state on touch/keyboard.
 * @param {HTMLElement} node
 * @param {Function} [hoverUpdate]
 */
export function hover(node, hoverUpdate = noop) {
  makeButton(node)
  let pointerType = 'touch'

  node.addEventListener('pointerenter', e => {
    if (e.pointerType === 'touch') return
    if (!node.contains(e.target)) {
      lastHoverElement?.(false)
      lastTapElement?.(false)
    }
    hoverUpdate(true)
    lastHoverElement = hoverUpdate
    lastTapCurrent = e.currentTarget
    pointerType = e.pointerType
  })

  node.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return
    e.stopPropagation()
    lastTapElement?.(false)
    if (lastTapElement === hoverUpdate) {
      lastTapElement = null
    } else {
      hoverUpdate(true, true)
      if (!SUPPORTS.isAndroid) lastTapElement = hoverUpdate
    }
  })

  node.addEventListener('pointerleave', e => {
    lastHoverElement = hoverUpdate
    if (e.pointerType === 'mouse') hoverUpdate(false)
  })

  node.addEventListener('pointerup', e => {
    if (e.pointerType !== 'touch') return
    if (lastTapCurrent?.contains(e.target)) return
    e.stopPropagation()
    lastHoverElement?.(false)
    lastTapElement?.(false)
    if (lastTapElement === hoverUpdate) {
      hoverUpdate(false, true)
      lastTapElement = null
      lastTapCurrent = null
    } else {
      hoverUpdate(true, true)
      lastTapElement = hoverUpdate
      lastTapCurrent = e.currentTarget
    }
  })
}

/**
 * Combines hover highlighting with click and optional right-click.
 * @param {HTMLElement} node
 * @param {[Function, Function, Function]} params - [cb, hoverUpdate, rcb]
 */
export function hoverClick(node, [cb = noop, hoverUpdate = noop, rcb = noop]) {
  makeButton(node)
  let pointerType = 'touch'

  function handleOutsideClick(e) {
    const focused = e.target
    if (node && focused?.offsetParent != null && !node.contains(focused)) {
      hoverUpdate(false)
      lastTapElement = null
      lastHoverElement = null
      document.removeEventListener('pointerup', handleOutsideClick)
    }
  }

  node.addEventListener('pointerenter', e => {
    if (e.pointerType === 'touch') return
    if (!node.contains(e.target)) {
      lastHoverElement?.(false)
      lastTapElement?.(false)
    }
    hoverUpdate(true)
    document.addEventListener('pointerup', handleOutsideClick)
    lastHoverElement = hoverUpdate
    lastTapCurrent = e.currentTarget
    pointerType = e.pointerType
  })

  node.addEventListener('click', e => {
    e.stopPropagation()
    if (pointerType === 'mouse') return cb(e)

    lastTapElement?.(false)
    if (lastTapElement === hoverUpdate) {
      lastTapElement = null
      navigator.vibrate(15)
      hoverUpdate(false)
      document.removeEventListener('pointerup', handleOutsideClick)
      cb(e)
    } else {
      hoverUpdate(true, true)
      document.addEventListener('pointerup', handleOutsideClick)
      lastTapElement = hoverUpdate
      lastTapTarget = e.target
    }
  })

  node.addEventListener('contextmenu', e => {
    e.preventDefault()
    rcb(e)
  })

  node.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return
    e.stopPropagation()
    lastTapElement?.(false)
    if (lastTapElement === hoverUpdate) {
      lastTapElement = null
      cb(e)
    } else {
      hoverUpdate(true, true)
      document.addEventListener('pointerup', handleOutsideClick)
      if (!SUPPORTS.isAndroid) lastTapElement = hoverUpdate
    }
  })

  node.addEventListener('pointerup', e => {
    if (e.pointerType !== 'mouse') return
    e.stopPropagation()
    setTimeout(() => {
      hoverUpdate(false)
      document.removeEventListener('pointerup', handleOutsideClick)
    })
  })

  node.addEventListener('pointerleave', e => {
    lastHoverElement = hoverUpdate
    if (e.pointerType === 'mouse') {
      hoverUpdate(false)
      document.removeEventListener('pointerup', handleOutsideClick)
    }
  })
}

/**
 * Detects a swipe gesture and calls `dp(deltaX)` when a threshold is crossed.
 * @param {HTMLElement} node
 * @param {Function} [dp]
 */
export function drag(node, dp = noop) {
  node.role = 'presentation'

  let startX = 0
  let endX = 0
  let isDragging = false
  let hasMoved = false

  const DRAG_THRESHOLD = 50

  function onMoveCheck(currentX) {
    if (Math.abs(currentX - startX) > DRAG_THRESHOLD) hasMoved = true
    endX = currentX
  }

  node.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX
    hasMoved = false
  }, { passive: true })

  node.addEventListener('touchmove', e => {
    onMoveCheck(e.touches[0].clientX)
  }, { passive: true })

  node.addEventListener('touchend', () => {
    if (hasMoved) dp(endX - startX)
  })

  node.addEventListener('mousedown', e => {
    isDragging = true
    startX = e.clientX
    hasMoved = false
  })

  node.addEventListener('mousemove', e => {
    if (!isDragging) return
    onMoveCheck(e.clientX)
  })

  node.addEventListener('mouseup', () => {
    if (isDragging && hasMoved) dp(endX - startX)
    isDragging = false
  })
}

/**
 * Enables smooth mouse-drag scrolling on the node with axis locking.
 * @param {HTMLElement} node
 * @returns {{ destroy: Function }}
 */
export function dragScroll(node) {
  const controller = new AbortController()
  const opts = { signal: controller.signal }

  const AXIS_LOCK_THRESHOLD = 8 // px before axis is committed
  const DRAG_THRESHOLD = 50     // px before click is suppressed

  let dragging = false
  let dragged = false
  let draggedX = 0
  let draggedY = 0
  let startX = 0
  let startY = 0
  let activePointer = null
  let lockedAxis = null  // 'x' | 'y' | null
  let suppressClick = false

  function releaseCapture() {
    if (activePointer) {
      try { node.releasePointerCapture(activePointer) } catch {}
    }
  }

  function stopDrag() {
    node.style.removeProperty('cursor')
    releaseCapture()
    dragging = false
    lockedAxis = null
  }

  function isOutside(x, y) {
    const { left, right, top, bottom } = node.getBoundingClientRect()
    return x < left || x > right || y < top || y > bottom
  }

  node.addEventListener('pointerdown', e => { activePointer = e.pointerId }, opts)

  node.addEventListener('pointerleave', () => {
    if (dragging) releaseCapture()
    dragging = false
  }, opts)

  node.addEventListener('mouseleave', () => { dragging = false }, opts)

  node.addEventListener('mouseup', () => { stopDrag() }, opts)

  node.addEventListener('pointerup', e => {
    if (dragging && dragged) {
      suppressClick = true
      e.stopPropagation()
      setTimeout(() => { suppressClick = false }).unref?.()
    }
    stopDrag()
  }, opts)

  node.addEventListener('click', e => {
    if (suppressClick) {
      e.preventDefault()
      e.stopPropagation()
    }
    dragging = false
  }, opts)

  node.addEventListener('mousedown', e => {
    const target = e.target
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable) return
    dragging = true
    dragged = false
    draggedX = 0
    draggedY = 0
    startX = e.clientX
    startY = e.clientY
    lockedAxis = null
  }, opts)

  node.addEventListener('mousemove', e => {
    if (!dragging) return

    if (isOutside(e.clientX, e.clientY)) {
      releaseCapture()
      dragging = false
      lockedAxis = null
      return
    }

    const dx = e.clientX - startX
    const dy = e.clientY - startY

    if (!lockedAxis) {
      if (Math.abs(dx) > AXIS_LOCK_THRESHOLD || Math.abs(dy) > AXIS_LOCK_THRESHOLD) {
        lockedAxis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'
      }
    }

    if (lockedAxis === 'x') {
      node.scrollBy(-dx, 0)
      draggedX += Math.abs(dx)
    } else if (lockedAxis === 'y') {
      node.scrollBy(0, -dy)
      draggedY += Math.abs(dy)
    }

    startX = e.clientX
    startY = e.clientY
    node.style.cursor = 'grabbing'

    if (draggedX > DRAG_THRESHOLD || draggedY > DRAG_THRESHOLD) {
      dragged = true
      try { node.setPointerCapture(activePointer) } catch {}
    }
  }, opts)

  return { destroy: () => controller.abort() }
}

// ─── D-pad / Keyboard navigation ─────────────────────────────────────────────

const Directions = { up: 1, right: 2, down: 3, left: 4 }
const DirectionKeyMap = { ArrowDown: 'down', ArrowUp: 'up', ArrowLeft: 'left', ArrowRight: 'right' }

/**
 * Returns the compass direction (1–4) from `anchor` to `relative`.
 * @param {{x:number,y:number}} anchor
 * @param {{x:number,y:number}} relative
 * @returns {number}
 */
function getDirection(anchor, relative) {
  return Math.round((Math.atan2(relative.y - anchor.y, relative.x - anchor.x) * 180 / Math.PI + 180) / 90) || 4
}

/**
 * Returns the Euclidean distance between two points.
 * @param {{x:number,y:number}} anchor
 * @param {{x:number,y:number}} relative
 * @returns {number}
 */
function getDistance(anchor, relative) {
  return Math.hypot(relative.x - anchor.x, relative.y - anchor.y)
}

/**
 * Returns all keyboard-focusable elements within `element`.
 * @param {Element} [element=document.body]
 * @returns {Element[]}
 */
function getKeyboardFocusableElements(element = document.body) {
  const selector = [
    'a[href]',
    'button:not([disabled], [tabindex="-1"])',
    'fieldset:not([disabled])',
    'input:not([disabled])',
    'optgroup:not([disabled])',
    'option:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'details',
    '[tabindex]:not([tabindex="-1"], [disabled])',
    '[contenteditable]',
    '[controls]',
  ].join(', ')
  return [...element.querySelectorAll(selector)].filter(el => !el.getAttribute('aria-hidden'))
}

/**
 * Returns the centre position and viewport visibility of `element`.
 * @param {Element} element
 * @returns {ElementPosition}
 */
function getElementPosition(element) {
  const { x, y, width, height, top, left, bottom, right } = element.getBoundingClientRect()
  const inViewport = isInViewport({ top, left, bottom, right, width, height })
  return { element, x: x + width * 0.5, y: y + height * 0.5, inViewport }
}

/**
 * Returns positions of all focusable elements (scoped to open modal if present).
 * @returns {ElementPosition[]}
 */
function getFocusableElementPositions() {
  const root = document.querySelector('.modal.show') ?? document.body
  return getKeyboardFocusableElements(root)
    .map(getElementPosition)
    .filter(Boolean)
}

/**
 * Returns true if the element's rect overlaps the viewport.
 * @param {{top:number,left:number,bottom:number,right:number,width:number,height:number}} rect
 * @returns {boolean}
 */
function isInViewport({ top, left, bottom, right, width, height }) {
  return (
    top + height >= 0 &&
    left + width >= 0 &&
    bottom - height <= window.innerHeight &&
    right - width <= window.innerWidth
  )
}

/**
 * Returns focusable positions that lie in `direction` from `currentElement`.
 * Prefers on-screen elements; falls back to off-screen for horizontal directions.
 * @param {ElementPosition[]} all
 * @param {ElementPosition} currentElement
 * @param {string} direction
 * @returns {ElementPosition[]}
 */
function getElementsInDesiredDirection(all, currentElement, direction) {
  const desiredDir = Directions[direction]
  const inViewport = all.filter(pos =>
    pos.element !== currentElement.element &&
    getDirection(currentElement, pos) === desiredDir &&
    pos.inViewport &&
    pos.element.checkVisibility()
  )
  if (inViewport.length) return inViewport

  // For horizontal nav, include off-screen elements (e.g. carousels)
  if (direction === 'left' || direction === 'right') {
    return all.filter(pos =>
      pos.element !== currentElement.element &&
      getDirection(currentElement, pos) === desiredDir
    )
  }

  return []
}

/**
 * Moves focus to the nearest focusable element in `direction`.
 * @param {string} [direction='up']
 */
function navigateDPad(direction = 'up') {
  const focusable = getFocusableElementPositions()
  const current = (!document.activeElement || document.activeElement === document.body)
    ? focusable[0]
    : getElementPosition(document.activeElement)

  const candidates = getElementsInDesiredDirection(focusable, current, direction)
  if (!candidates.length) return

  const { element } = candidates.reduce((best, pos) => {
    const distance = getDistance(current, pos)
    return distance < best.distance ? { distance, element: pos.element } : best
  }, { distance: Infinity, element: null })

  const isInput = element.matches('input[type=text], input[type=url], input[type=number], textarea')
  let wasReadOnly = false
  if (isInput) {
    wasReadOnly = element.readOnly
    element.readOnly = true
  }

  element.focus()

  if (isInput && !wasReadOnly) setTimeout(() => { element.readOnly = false })
  element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
}

// Defer so keybind system can intercept first
queueMicrotask(() => {
  document.addEventListener('keydown', e => {
    if (DirectionKeyMap[e.key]) {
      e.preventDefault()
      lastInteractionMethod = 'dpad'
      navigateDPad(DirectionKeyMap[e.key])
    } else {
      lastInteractionMethod = 'keyboard'
    }
  })
})