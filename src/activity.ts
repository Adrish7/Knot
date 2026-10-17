import { useSyncExternalStore } from 'react'

// Whether the person is looking at Knot. `hidden`: the window is minimised, on another Space or
// fully covered, so nothing it draws can be seen. `away`: hidden, or another app is in front (the
// window may still be visible beside it). Everything that moves on its own checks this: while away
// the ambient motion holds still (`.is-away` on the root element pauses the CSS loops) and the
// clocks tick no faster than once a second; while hidden they stop.

export interface Activity { hidden: boolean; away: boolean }

let current: Activity = read()
const listeners = new Set<() => void>()

function read(): Activity {
  const hidden = document.hidden
  return { hidden, away: hidden || !document.hasFocus() }
}

function update() {
  const next = read()
  if (next.hidden === current.hidden && next.away === current.away) return
  current = next
  document.documentElement.classList.toggle('is-away', current.away)
  listeners.forEach((listener) => listener())
}

document.documentElement.classList.toggle('is-away', current.away)
window.addEventListener('focus', update)
window.addEventListener('blur', update)
document.addEventListener('visibilitychange', update)

export function activity() {
  return current
}

export function onActivity(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useActivity() {
  return useSyncExternalStore(onActivity, activity)
}
