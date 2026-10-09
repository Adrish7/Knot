import { useEffect, useState } from 'react'
import type { AvailableUpdate, UpdateProgress } from './global'

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000

export interface UpdateApi {
  supported: boolean // false in the web build and in development
  version: string | null
  update: AvailableUpdate | null
  progress: UpdateProgress | null // set while an update downloads, installs and restarts
  checking: boolean
  checkNow: () => void
  install: () => void
}

// Asks the main process whether GitHub has a newer release: on launch, every few hours and when
// the window comes forward (the main process answers from a short cache, so focus is cheap).
export function useUpdate(onMessage: (message: string) => void): UpdateApi {
  const knot = window.knot
  const [version, setVersion] = useState<string | null>(null)
  const [update, setUpdate] = useState<AvailableUpdate | null>(null)
  const [progress, setProgress] = useState<UpdateProgress | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (!knot) return
    let active = true
    knot.version().then((value) => { if (active) setVersion(value) }).catch(() => {})
    const check = () => knot.checkForUpdate().then((found) => { if (active) setUpdate(found) }).catch(() => {})
    check()
    const timer = window.setInterval(check, CHECK_EVERY_MS)
    window.addEventListener('focus', check)
    const stopListening = knot.onUpdateProgress(setProgress)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('focus', check)
      stopListening()
    }
  }, [knot])

  const checkNow = () => {
    if (!knot || checking) return
    setChecking(true)
    knot.checkForUpdate(true)
      .then((found) => {
        setUpdate(found)
        if (!found) onMessage('Knot is up to date')
      })
      .catch(() => onMessage('Couldn’t check for updates'))
      .finally(() => setChecking(false))
  }

  const install = () => {
    if (!knot || progress) return
    setProgress({ phase: 'downloading', fraction: 0 })
    knot.installUpdate()
      .then((result) => {
        if (result.ok) return
        setProgress(null)
        if (result.message) onMessage(result.message)
      })
      .catch(() => {
        setProgress(null)
        onMessage('Couldn’t install the update')
      })
  }

  return { supported: Boolean(knot), version, update, progress, checking, checkNow, install }
}
