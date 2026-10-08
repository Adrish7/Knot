import { useEffect, useState } from 'react'

// The current time, refreshed every `intervalMs` while `active`; a plain snapshot otherwise.
export function useNow(active: boolean, intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [active, intervalMs])
  return active ? now : Date.now()
}
