import type { EnergyState, GrowthStage } from '../../sanctuary'
import { HEARTH, STAGE_SPRITES, hearthSprite } from './sprites'

const LABELS: Record<EnergyState, string> = { asleep: 'asleep', stirring: 'stirring', awake: 'awake', lively: 'lively', radiant: 'radiant' }
const SIZE = 28

// Hearth's head and shoulders in a small circle, beside Time today. All poses are stacked and
// crossfaded so a change of state doesn't flash.
export function HearthBadge({ state, stage, cheer, onClick }: { state: EnergyState; stage: GrowthStage; cheer: boolean; onClick: () => void }) {
  const current = hearthSprite(state, stage)
  const sprites = STAGE_SPRITES[stage] ? [STAGE_SPRITES[stage]!] : Object.values(HEARTH)
  return (
    <button className={`hearth-badge is-${state} ${cheer ? 'is-cheer' : ''}`} onClick={onClick} data-tour="foot-buddy" title={`Hearth is ${LABELS[state]}. Open the Sanctuary.`} aria-label={`Hearth is ${LABELS[state]}. Open the Sanctuary`}>
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
