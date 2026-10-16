import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { EnergyState, GrowthStage } from '../../sanctuary'
import { HEARTH, STAGE_SPRITES, hearthSprite } from './sprites'

const LABELS: Record<EnergyState, string> = { asleep: 'asleep', stirring: 'stirring', awake: 'awake', lively: 'lively', radiant: 'radiant' }
const SIZE = 28

// Hearth's head and shoulders in a small circle, beside Time today. All poses are stacked and
// crossfaded so a change of state doesn't flash. A click bounces it and runs a ring out from the
// circle; it opens the Sanctuary, or, when the Sanctuary is already open (`here`), pokes the
// Hearth in the scene.
export function HearthBadge({ state, stage, here, cheer, onClick }: { state: EnergyState; stage: GrowthStage; here: boolean; cheer: boolean; onClick: () => void }) {
  const current = hearthSprite(state, stage)
  const sprites = STAGE_SPRITES[stage] ? [STAGE_SPRITES[stage]!] : Object.values(HEARTH)
  const [poked, setPoked] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const timer = useRef(0)
  useEffect(() => () => clearTimeout(timer.current), [])
  const click = () => {
    // Off and on again, so a quick second click restarts the bounce.
    flushSync(() => setPoked(false))
    void ref.current?.offsetWidth
    setPoked(true)
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setPoked(false), 700)
    onClick()
  }
  const label = `Hearth is ${LABELS[state]}.${here ? '' : ' Open the Sanctuary.'}`
  return (
    <button ref={ref} className={`hearth-badge is-${state} ${cheer ? 'is-cheer' : ''} ${poked ? 'is-poked' : ''}`} onClick={click} data-tour="foot-buddy" title={label} aria-label={label}>
      {sprites.map((sprite) => {
        // The head fills the circle: about 24px wide, the face a hair above the middle.
        const width = 24 / sprite.mini[0]
        const height = width * sprite.h / sprite.w
        return (
          <img
            key={sprite.src}
            src={sprite.src}
            alt=""
            draggable={false}
            className={sprite === current ? 'is-on' : ''}
            style={{ width, height, left: SIZE / 2 - sprite.mini[1] * width, top: SIZE / 2 + 0.5 - sprite.mini[2] * height }}
          />
        )
      })}
    </button>
  )
}
