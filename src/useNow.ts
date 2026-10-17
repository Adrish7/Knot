import { useEffect, useState } from 'react'
import { useActivity } from './activity'

// The current time, refreshed every `intervalMs` while `active`; a plain snapshot otherwise. While
// another app is in front it refreshes at most once a second, and not at all while the window is
// hidden; it catches up at once on return.
export function useNow(active: boolean, intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  const { hidden, away } = useActivity()
  const ticking = active && !hidden
  const every = away ? Math.max(intervalMs, 1000) : intervalMs
  useEffect(() => {
    if (!ticking) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), every)
    return () => window.clearInterval(timer)
  }, [ticking, every])
  return active ? now : Date.now()
}
