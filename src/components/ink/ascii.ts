// The basin drawn in type. The same soft blobs of ink the controller hands in (each recent second's
// drop where it has drifted to by now, plus the pointer's touches) are summed onto a coarse grid of
// character cells, and each cell shows a glyph from a density ramp: faint water is a field of dots,
// thin ink is `·` and `:`, and the dense head of the trail climbs into stars. Cells near a step on
// the ramp flicker between neighbours a few times a second, so the ink fizzes as it spreads.
//
// Canvas 2D, no WebGL. The glyphs are rendered once into an atlas (again only when the ink colour
// or the theme changes) and each frame is one blit per inked cell; the dot field is cached.
//
// uv is [0,1]² with the basin centred at (0.5, 0.5) and y pointing up, as the controller works.

export const RIM = 0.485 // basin radius in uv
export const MAX_BLOBS = 56

export interface Look {
  ink: [number, number, number]
  ground: [number, number, number]
  dark: number
  inkK: number
  bloom: number
  clear: number
  sheen: number
  alive: number
  grain: number // changes a few times a second while the ink moves; picks the flicker
}

const RAMP = ['·', '∙', '•', '+', '*', '✢', '✳', '✶', '✻', '✽']
const DOT = '·'
const FLICKER = 0.85 // how far across a step a cell may wander, in steps
const FONT = 'ui-monospace, "SF Mono", Menlo, monospace'

type Vec3 = [number, number, number]

const css = (c: Vec3, a = 1) => `rgba(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)}, ${a})`
const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

// A cheap stable hash of a cell and the grain, in [0, 1).
function hash(c: number, r: number, g: number) {
  let h = Math.imul(c, 374761393) ^ Math.imul(r, 668265263) ^ Math.imul(g, 2246822519)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export class Glyphs {
  private readonly ctx: CanvasRenderingContext2D
  private readonly blobs = new Float32Array(MAX_BLOBS * 4)
  private count = 0
  private width = 1
  private height = 1
  private dpr = 1
  // the grid, in CSS px
  private cols = 0
  private rows = 0
  private cellW = 1
  private cellH = 1
  private offX = 0
  private offY = 0
  private dye = new Float32Array(0)
  private calm = new Float32Array(0) // per cell: how much ink the readout's calm centre lets through; 0 outside the rim
  private readonly atlas = document.createElement('canvas')
  private atlasKey = ''
  private readonly field = document.createElement('canvas')
  private fieldKey = ''

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) throw new Error('ink: no 2d context')
    this.ctx = ctx
  }

  resize(width: number, height: number) {
    this.width = width
    this.height = height
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = Math.round(width * this.dpr)
    const h = Math.round(height * this.dpr)
    if (this.canvas.width !== w) this.canvas.width = w
    if (this.canvas.height !== h) this.canvas.height = h

    // About sixty columns across whatever the size; cells are a monospace glyph's shape.
    this.cellW = Math.min(8, Math.max(5.5, width / 62))
    this.cellH = this.cellW * 1.55
    this.cols = Math.floor(width / this.cellW)
    this.rows = Math.floor(height / this.cellH)
    this.offX = (width - this.cols * this.cellW) / 2
    this.offY = (height - this.rows * this.cellH) / 2
    const n = this.cols * this.rows
    this.dye = new Float32Array(n)
    this.calm = new Float32Array(n)
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const [x, y] = this.uv(c, r)
        const d = Math.hypot(x - 0.5, y - 0.5)
        this.calm[r * this.cols + c] = d > RIM - 0.012 ? 0 : smoothstep(0.2, 0.36, d)
      }
    }
    this.atlasKey = ''
    this.fieldKey = ''
  }

  private uv(c: number, r: number): [number, number] {
    return [(this.offX + (c + 0.5) * this.cellW) / this.width, 1 - (this.offY + (r + 0.5) * this.cellH) / this.height]
  }

  clear() { this.count = 0 }

  add(x: number, y: number, radius: number, amount: number) {
    if (this.count >= MAX_BLOBS || amount <= 0.004) return
    const i = this.count++ * 4
    this.blobs[i] = x
    this.blobs[i + 1] = y
    this.blobs[i + 2] = radius * radius
    this.blobs[i + 3] = amount
  }

  // Each glyph of the ramp twice, in the ink and in its hot core (paler in the dark, deeper in the
  // light), one cell per glyph.
  private ensureAtlas(look: Look) {
    const ink = look.ink.map((v) => Math.round(v * 64) / 64) as Vec3
    const key = `${ink.join()}|${Math.round(look.dark * 16)}|${this.cellW}|${this.dpr}`
    if (key === this.atlasKey) return
    this.atlasKey = key
    const cw = Math.ceil(this.cellW * this.dpr)
    const ch = Math.ceil(this.cellH * this.dpr)
    this.atlas.width = cw * RAMP.length
    this.atlas.height = ch * 2
    const a = this.atlas.getContext('2d')
    if (!a) return
    a.clearRect(0, 0, this.atlas.width, this.atlas.height)
    a.font = `500 ${this.cellW * 1.45 * this.dpr}px ${FONT}`
    a.textAlign = 'center'
    a.textBaseline = 'middle'
    const hot = mix3(ink, look.dark > 0.5 ? [1, 1, 1] : [0, 0, 0], look.dark > 0.5 ? 0.45 : 0.22)
    for (const [row, colour] of [[0, ink], [1, hot]] as const) {
      a.fillStyle = css(colour)
      RAMP.forEach((glyph, i) => a.fillText(glyph, cw * (i + 0.5), ch * (row + 0.5)))
    }
  }

  // The still water: a faint dot in every cell, fading out under the readout.
  private ensureField(look: Look) {
    const key = `${Math.round(look.dark * 16)}|${this.cols}x${this.rows}|${this.dpr}`
    if (key === this.fieldKey) return
    this.fieldKey = key
    this.field.width = this.canvas.width
    this.field.height = this.canvas.height
    const f = this.field.getContext('2d')
    if (!f) return
    f.clearRect(0, 0, this.field.width, this.field.height)
    f.scale(this.dpr, this.dpr)
    f.font = `500 ${this.cellW * 1.45}px ${FONT}`
    f.textAlign = 'center'
    f.textBaseline = 'middle'
    const base: Vec3 = look.dark > 0.5 ? [1, 1, 1] : [0, 0, 0]
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const calm = this.calm[r * this.cols + c]
        if (calm <= 0) continue
        f.fillStyle = css(base, (look.dark > 0.5 ? 0.12 : 0.13) * (0.25 + 0.75 * calm))
        f.fillText(DOT, this.offX + (c + 0.5) * this.cellW, this.offY + (r + 0.5) * this.cellH)
      }
    }
    f.setTransform(1, 0, 0, 1, 0, 0)
  }

  draw(look: Look) {
    if (Math.min(2, window.devicePixelRatio || 1) !== this.dpr) this.resize(this.width, this.height)
    const { ctx, cols, rows, cellW, cellH, offX, offY, dye } = this
    this.ensureAtlas(look)
    this.ensureField(look)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.drawImage(this.field, 0, 0)

    // Splat each blob onto the cells within three of its radii.
    dye.fill(0)
    for (let i = 0; i < this.count; i++) {
      const bx = this.blobs[i * 4]
      const by = this.blobs[i * 4 + 1]
      const r2 = this.blobs[i * 4 + 2]
      const amount = this.blobs[i * 4 + 3]
      const reach = Math.sqrt(r2) * 3
      const c0 = Math.max(0, Math.floor(((bx - reach) * this.width - offX) / cellW))
      const c1 = Math.min(cols - 1, Math.ceil(((bx + reach) * this.width - offX) / cellW))
      const r0 = Math.max(0, Math.floor(((1 - by - reach) * this.height - offY) / cellH))
      const r1 = Math.min(rows - 1, Math.ceil(((1 - by + reach) * this.height - offY) / cellH))
      for (let r = r0; r <= r1; r++) {
        const y = 1 - (offY + (r + 0.5) * cellH) / this.height
        const dy2 = (y - by) * (y - by)
        for (let c = c0; c <= c1; c++) {
          const x = (offX + (c + 0.5) * cellW) / this.width
          const d2 = (x - bx) * (x - bx) + dy2
          dye[r * cols + c] += amount * Math.exp(-d2 / r2)
        }
      }
    }

    const cw = Math.ceil(cellW * this.dpr)
    const ch = Math.ceil(cellH * this.dpr)
    const steps = RAMP.length - 1
    const k = look.inkK * 0.8
    const clear = look.clear
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        const calm = this.calm[i]
        const raw = dye[i]
        if (raw <= 0.01 || calm <= 0) continue
        const amount = Math.min(raw, 1.6) * (clear + (1 - clear) * calm) * look.alive
        const level = 1 - Math.exp(-k * amount)
        if (level < 0.035) continue
        const step = Math.round(Math.min(steps, Math.max(0, level ** 0.8 * steps * 1.2 + (hash(c, r, look.grain) - 0.5) * FLICKER)))
        const hot = level > 0.8 ? 1 : 0
        ctx.globalAlpha = Math.min(1, 0.35 + level * 0.9)
        ctx.drawImage(this.atlas, step * cw, hot * ch, cw, ch, Math.round((offX + c * cellW) * this.dpr), Math.round((offY + r * cellH) * this.dpr), cw, ch)
      }
    }
    ctx.globalAlpha = 1
  }

  dispose() {
    this.atlas.width = this.atlas.height = 0
    this.field.width = this.field.height = 0
  }
}
