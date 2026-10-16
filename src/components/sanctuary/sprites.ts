import hearthAsleep from '../../assets/sanctuary/hearth-asleep.avif'
import hearthAwake from '../../assets/sanctuary/hearth-awake.avif'
import hearthElder from '../../assets/sanctuary/hearth-elder.avif'
import hearthLively from '../../assets/sanctuary/hearth-lively.avif'
import hearthRadiant from '../../assets/sanctuary/hearth-radiant.avif'
import hearthSprout from '../../assets/sanctuary/hearth-sprout.avif'
import hearthStirring from '../../assets/sanctuary/hearth-stirring.avif'
import type { EnergyState, GrowthStage } from '../../sanctuary'

// Hearth's painted poses. The cut-outs are cropped to the figure, so the feet sit on the bottom
// edge. `w`/`h` are the source proportions; `ember` is the chest light as a fraction of the box;
// `mini` places the head in the 28px sidebar badge: [head width, face x, face y] as fractions.
export interface Sprite {
  src: string
  w: number
  h: number
  ember: [number, number]
  mini: [number, number, number]
  scale?: number // height relative to the standing pose
}

export const HEARTH: Record<EnergyState, Sprite> = {
  asleep: { src: hearthAsleep, w: 349, h: 528, ember: [0.5, 0.67], mini: [0.72, 0.5, 0.47], scale: 528 / 690 },
  stirring: { src: hearthStirring, w: 299, h: 534, ember: [0.5, 0.66], mini: [0.8, 0.5, 0.45], scale: 534 / 690 },
  awake: { src: hearthAwake, w: 338, h: 690, ember: [0.55, 0.54], mini: [0.62, 0.52, 0.34] },
  lively: { src: hearthLively, w: 388, h: 654, ember: [0.53, 0.55], mini: [0.55, 0.43, 0.34], scale: 654 / 690 },
  radiant: { src: hearthRadiant, w: 376, h: 676, ember: [0.505, 0.55], mini: [0.6, 0.49, 0.33], scale: 676 / 690 },
}

// The sprout and the elder have one painted pose each; energy shows through their light and motion.
export const STAGE_SPRITES: Partial<Record<GrowthStage, Sprite>> = {
  sprout: { src: hearthSprout, w: 282, h: 520, ember: [0.565, 0.62], mini: [0.78, 0.53, 0.38], scale: 0.62 },
  elder: { src: hearthElder, w: 459, h: 924, ember: [0.565, 0.575], mini: [0.55, 0.55, 0.38], scale: 1.18 },
}

export function hearthSprite(state: EnergyState, stage: GrowthStage): Sprite {
  return STAGE_SPRITES[stage] ?? HEARTH[state]
}
