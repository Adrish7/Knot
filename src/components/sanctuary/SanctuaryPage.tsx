import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import cinderAsleep from '../../assets/sanctuary/cinder-asleep.avif'
import cinderAwake from '../../assets/sanctuary/cinder-awake.avif'
import hollowDay from '../../assets/sanctuary/hollow-day.avif'
import hollowNight from '../../assets/sanctuary/hollow-night.avif'
import jarFull from '../../assets/sanctuary/jar-full.avif'
import jarHalf from '../../assets/sanctuary/jar-half.avif'
import jarLow from '../../assets/sanctuary/jar-low.avif'
import keepBook from '../../assets/sanctuary/keep-book.avif'
import keepChime from '../../assets/sanctuary/keep-chime.avif'
import keepMoth from '../../assets/sanctuary/keep-moth.avif'
import keepMushroom from '../../assets/sanctuary/keep-mushroom.avif'
import keepSprout from '../../assets/sanctuary/keep-sprout.avif'
import keepStarjar from '../../assets/sanctuary/keep-starjar.avif'
import keepTeacup from '../../assets/sanctuary/keep-teacup.avif'
import keepTelescope from '../../assets/sanctuary/keep-telescope.avif'
import { todayDate } from '../../format'
import { GROWTH_STAGES, KEEPSAKES } from '../../sanctuary'
import type { EnergyState, SanctuaryStats } from '../../sanctuary'
import type { SanctuaryState } from '../../types'
import { HEARTH, STAGE_SPRITES, hearthSprite } from './sprites'
import type { Sprite } from './sprites'
import './Sanctuary.css'

export interface SanctuaryPageProps {
  stats: SanctuaryStats
  state: SanctuaryState // keepsakes owned
  cinderAway: boolean // a stopwatch is running, so Cinder is on the Stopwatch page
  onBuy: (id: string) => boolean
}

// The hollow is one painted plate (1586 x 992), drawn `cover` into the world box. Everything in
// the scene is anchored in plate pixels and mapped through one registration, so it stays on its
// painted spot at any window size. Objects (sprites, the jar) scale with the plate; text objects
// (the energy plank, the slate, labels, the card) keep their type size and only move.

const PW = 1586
const PH = 992
const S0 = 0.7611 // the plate scale the design was drawn at (a 1280 x 800 window)
const EDGE = 10 // the world overhangs the scene by this much on every side, for the parallax
const SEEN_KEY = 'knot.sanctuary.lastSeenEarned'

interface Geo { S: number; OX: number; OY: number; W: number; H: number }

const LABELS: Record<EnergyState, string> = { asleep: 'Asleep', stirring: 'Stirring', awake: 'Awake', lively: 'Lively', radiant: 'Radiant' }
const FLIES: Record<EnergyState, number> = { asleep: 3, stirring: 7, awake: 12, lively: 20, radiant: 30 }

// The five painted lanterns: glass centre and radii, and where the flame sits.
const LAMPS = [
  { x: 178, y: 272, rx: 36, ry: 48, fy: 300 },
  { x: 270, y: 192, rx: 38, ry: 38, fy: 204 },
  { x: 365, y: 247, rx: 27, ry: 54, fy: 240 },
  { x: 440, y: 152, rx: 21, ry: 48, fy: 165 },
  { x: 515, y: 222, rx: 39, ry: 39, fy: 234 },
]

// Where each keepsake lives. `base` is the plate point under the object's bottom centre, `w` its
// width in plate px, `ratio` its height / width, `label` the label's top centre. The pebble and the
// vase are painted into the plate, so they only get a hit area and a halo.
interface Place { src?: string; w?: number; ratio?: number; base?: [number, number]; label: [number, number]; hang?: boolean; painted?: { at: [number, number]; r: number } }
const PLACES: Record<string, Place> = {
  pebble: { painted: { at: [415, 345], r: 56 }, label: [428, 386] },
  vase: { painted: { at: [480, 445], r: 66 }, label: [508, 500] },
  sprout: { src: keepSprout, w: 58, ratio: 240 / 167, base: [1078, 806], label: [1078, 814] },
  teacup: { src: keepTeacup, w: 62, ratio: 240 / 402, base: [700, 812], label: [700, 820] },
  starjar: { src: keepStarjar, w: 50, ratio: 240 / 214, base: [728, 690], label: [728, 700] },
  book: { src: keepBook, w: 60, ratio: 240 / 239, base: [380, 674], label: [380, 684] },
  mushroom: { src: keepMushroom, w: 74, ratio: 240 / 205, base: [626, 752], label: [626, 760] },
  moth: { src: keepMoth, w: 84, ratio: 240 / 273, base: [1352, 606], label: [1352, 616] },
  chime: { src: keepChime, w: 76, ratio: 240 / 173, base: [1372, 150], label: [1372, 160], hang: true },
  telescope: { src: keepTelescope, w: 76, ratio: 240 / 160, base: [1200, 866], label: [1200, 874] },
}

const JAR = { base: [392, 481] as const, w: 60, ratio: 300 / 215, label: [378, 500] as const, full: 160 }
const GROWTH = { x: 565, bottom: 640, notches: [617, 547, 446] }
const HEARTH_FEET = [905, 886] as const
const BW = 280 // Hearth's rig box, screen px at the design scale
const BH = 320
const CINDER = {
  asleep: { src: cinderAsleep, w: 276, h: 427, height: 148, ember: [0.5, 0.62], light: [0.52, 0.04], feet: [248, 706] },
  awake: { src: cinderAwake, w: 306, h: 601, height: 206, ember: [0.5, 0.6], light: [0.5, 0.03], feet: [252, 846] },
} as const
const CW = 200
const CH = 240

// A small seeded generator, so the motes and orbiting sparks land in the same places every time.
function seeded(seed: number) {
  let value = seed
  return () => { value = (value * 16807) % 2147483647; return (value - 1) / 2147483646 }
}
const rand = seeded(7)
const JAR_MOTES = Array.from({ length: 26 }, () => ({ x: 22 + rand() * 56, y: 30 + rand() * 58, d: 1.6 + rand() * 1.8, o: -rand() * 3 }))
const ORBIT = Array.from({ length: 9 }, () => ({ r: 62 + rand() * 70, d: 9 + rand() * 9, o: -rand() * 18 }))
const FLAME_DELAYS = LAMPS.map(() => -rand() * 3)

// Sprite height in px at the design scale: the standing poses are 272 tall, the sprout and the
// elder have their own heights.
function spriteHeight(sprite: Sprite) {
  if (sprite === STAGE_SPRITES.sprout) return 205
  if (sprite === STAGE_SPRITES.elder) return 335
  return sprite.h * 272 / 690
}

// Hours of sap -> plate y along the groove: linear between the notches, a little past Elder.
function sapY(sap: number) {
  const [sprout, hearth, elder] = GROWTH.notches
  const [, hearthFrom, elderFrom] = GROWTH_STAGES.map((stage) => stage.from)
  if (sap <= hearthFrom) return sprout + (sap / hearthFrom) * (hearth - sprout)
  if (sap <= elderFrom) return hearth + (sap - hearthFrom) / (elderFrom - hearthFrom) * (elder - hearth)
  return elder - Math.min(16, (sap - elderFrom) * 1.2)
}

const SLATE_DATE = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const smooth = (value: number, from: number, to: number) => clamp((value - from) / (to - from), 0, 1)
const plural = (count: number, one: string, many: string) => count === 1 ? one : many

function readSeen(): number | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    const value = raw === null ? NaN : Number(raw)
    return Number.isFinite(value) ? value : null
  } catch { return null }
}
function writeSeen(value: number) {
  try { localStorage.setItem(SEEN_KEY, String(value)) } catch { /* private mode: the reward just replays */ }
}

function useDocumentTheme() {
  const read = () => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
  const [theme, setTheme] = useState<'light' | 'dark'>(read)
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(read()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    setTheme(read())
    return () => observer.disconnect()
  }, [])
  return theme
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return reduced
}

// Restarts a CSS animation by bumping a key whenever `value` changes after the first render.
function useTick(value: number) {
  const [tick, setTick] = useState(0)
  const first = useRef(value)
  useEffect(() => { if (value !== first.current) { first.current = value; setTick((n) => n + 1) } }, [value])
  return tick
}

interface Spark { x: number; y: number; vx: number; vy: number; life: number }
interface Fly { x: number; y: number; c: [number, number, number]; r: number; t: number; sp: number; a: number; vx: number; vy: number; life: number }

export function SanctuaryPage({ stats, state, cinderAway, onBuy }: SanctuaryPageProps) {
  const theme = useDocumentTheme()
  const reduced = useReducedMotion()
  const sceneRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const emberRef = useRef<HTMLDivElement>(null)
  const jarRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const objectRefs = useRef(new Map<string, HTMLElement>())
  const clampRefs = useRef(new Map<string, HTMLElement>())
  const moteRefs = useRef<(HTMLDivElement | null)[]>([])
  const [geo, setGeo] = useState<Geo | null>(null)

  const [browse, setBrowse] = useState(false)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [cardId, setCardId] = useState<string>('starjar') // the card keeps its last content while it fades out
  const [cardPos, setCardPos] = useState<{ left: number; top: number; ax: number; ay: number } | null>(null)
  const [newId, setNewId] = useState<string | null>(null)
  const [jarDelta, setJarDelta] = useState<{ text: string; key: number } | null>(null)
  const [cheer, setCheer] = useState(false)

  // Shared with the canvas loop without re-running it.
  const fx = useRef({ geo: null as Geo | null, theme, flies: FLIES[stats.energyState], reduced, sparks: [] as Spark[], kick: () => {} })
  fx.current.theme = theme
  fx.current.flies = FLIES[stats.energyState]
  fx.current.reduced = reduced
  fx.current.geo = geo

  /* ---------- Registration: plate px -> world px, recomputed on resize ---------- */
  useLayoutEffect(() => {
    const world = worldRef.current
    if (!world) return
    const measure = () => {
      const W = world.clientWidth
      const H = world.clientHeight
      if (!W || !H) return
      const S = Math.max(W / PW, H / PH)
      setGeo((current) => current && current.W === W && current.H === H ? current : { S, OX: (W - PW * S) / 2, OY: (H - PH * S) / 2, W, H })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(world)
    return () => observer.disconnect()
  }, [])

  const S = geo?.S ?? S0
  const px = useCallback((x: number) => (geo?.OX ?? 0) + x * S, [geo, S])
  const py = useCallback((y: number) => (geo?.OY ?? 0) + y * S, [geo, S])
  const k = S / S0 // figures scale with the plate
  const ts = clamp(S / S0, 1, 1.2) // text objects may grow on a big window, never shrink
  const W = geo?.W ?? 0
  const H = geo?.H ?? 0
  // Keep a fixed-size text object inside the visible part of the world.
  const fitX = (left: number, width: number) => clamp(left, EDGE + 8, Math.max(EDGE + 8, W - EDGE - 8 - width))
  const fitY = (top: number, height: number) => clamp(top, EDGE + 8, Math.max(EDGE + 8, H - EDGE - 8 - height))

  // Labels are centred on their anchor; pull them back in where the window cuts the plate.
  useLayoutEffect(() => {
    if (!geo) return
    for (const node of clampRefs.current.values()) {
      const x = Number(node.dataset.x)
      const half = node.getBoundingClientRect().width / 2
      node.style.left = `${clamp(x, EDGE + 8 + half, Math.max(EDGE + 8 + half, geo.W - EDGE - 8 - half)).toFixed(1)}px`
    }
  })
  const clampRef = (key: string) => (node: HTMLElement | null) => { if (node) clampRefs.current.set(key, node); else clampRefs.current.delete(key) }

  /* ---------- Keepsakes ---------- */
  const owned = useMemo(() => new Set(state.keepsakes), [state.keepsakes])
  const nextUp = useMemo(() => KEEPSAKES.filter((item) => !owned.has(item.id)).sort((a, b) => a.price - b.price).slice(0, 3).map((item) => item.id), [owned])
  const ownedCount = KEEPSAKES.filter((item) => owned.has(item.id)).length

  /* ---------- The jar shows what has landed; a reward in flight is still on its way ---------- */
  const [landed, setLanded] = useState(() => {
    const seen = readSeen()
    return seen !== null && seen < stats.earned ? seen : stats.earned
  })
  const pending = Math.max(0, stats.earned - landed)
  const jarBalance = Math.max(0, stats.balance - pending)
  const jarLevel = clamp(jarBalance / JAR.full, 0, 1)
  const jarMotes = Math.round(jarLevel * JAR_MOTES.length)

  const tickJar = useCallback((delta: number) => {
    setJarDelta((current) => ({ text: `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`, key: (current?.key ?? 0) + 1 }))
  }, [])

  const addSparks = (x: number, y: number, count: number, speed: number, lift: number) => {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2
      const v = speed * (0.6 + Math.random())
      fx.current.sparks.push({ x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v - lift, life: 0.7 + Math.random() * 0.6 })
    }
    fx.current.kick()
  }

  /* ---------- Arrival reward: glimmers earned since the last visit fly from Hearth to the jar ---------- */
  const timers = useRef<number[]>([])
  useEffect(() => () => { timers.current.forEach((timer) => clearTimeout(timer)) }, [])
  const mountedAt = useRef(performance.now())
  useEffect(() => {
    const earned = stats.earned
    if (earned <= landed) {
      writeSeen(earned)
      if (earned < landed) setLanded(earned)
      return
    }
    const delta = earned - landed
    const start = window.setTimeout(() => {
      writeSeen(earned)
      const scene = sceneRef.current
      const ember = emberRef.current
      const jar = jarRef.current
      if (reduced || !scene || !ember || !jar) { setLanded(earned); tickJar(delta); return }
      setCheer(true)
      timers.current.push(window.setTimeout(() => setCheer(false), 1100))
      const box = scene.getBoundingClientRect()
      const e = ember.getBoundingClientRect()
      const j = jar.getBoundingClientRect()
      const p0 = [e.left + e.width / 2 - box.left, e.top + e.height / 2 - box.top]
      const p2 = [j.left + j.width / 2 - box.left, j.top + j.height * 0.5 - box.top]
      const p1 = [(p0[0] + p2[0]) / 2 + 40, Math.min(p0[1], p2[1]) - 90]
      const count = Math.min(5, delta)
      let first = true
      for (let i = 0; i < count; i += 1) {
        const node = moteRefs.current[i]
        if (!node) continue
        const frames: Keyframe[] = []
        const wobble = (i - (count - 1) / 2) * 14
        for (let f = 0; f <= 28; f += 1) {
          const t = f / 28
          const u = 1 - Math.pow(1 - t, 2.2)
          const cx = p1[0] + wobble
          const cy = p1[1] - Math.abs(wobble)
          const x = (1 - u) ** 2 * p0[0] + 2 * (1 - u) * u * cx + u * u * p2[0]
          const y = (1 - u) ** 2 * p0[1] + 2 * (1 - u) * u * cy + u * u * p2[1]
          frames.push({ offset: t, transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${(1 + Math.sin(u * Math.PI) * 0.7).toFixed(2)})`, opacity: t < 0.04 ? 0 : t > 0.96 ? 0.6 : 1 })
        }
        const animation = node.animate(frames, { duration: 900, delay: 260 + i * 150, fill: 'forwards' })
        animation.finished.then(() => {
          node.animate([{ opacity: 0.6 }, { opacity: 0 }], { duration: 120, fill: 'forwards' })
          if (first) {
            first = false
            setLanded(earned)
            tickJar(delta)
          }
          const g = fx.current.geo
          if (g) addSparks((p2[0] + EDGE - g.OX) / g.S, (p2[1] + EDGE - g.OY) / g.S, 5, 1.2, 0.8)
        }).catch(() => { /* cancelled on unmount */ })
      }
    }, Math.max(300, 900 - (performance.now() - mountedAt.current))) // on arrival, once the scene has painted
    return () => clearTimeout(start)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats.earned, landed])

  /* ---------- Card ---------- */
  const openCard = (id: string) => { setOpenId(id); setCardId(id) }
  const closeCard = useCallback(() => setOpenId(null), [])
  useEffect(() => {
    if (!openId) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') closeCard() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId, closeCard])

  // Tie the card to its object: above things low in the scene, else beside them, inside the scene.
  useLayoutEffect(() => {
    if (!openId) return
    const scene = sceneRef.current
    const node = objectRefs.current.get(openId)
    const card = cardRef.current
    if (!scene || !node || !card) return
    const s = scene.getBoundingClientRect()
    const r = node.getBoundingClientRect()
    const sw = scene.clientWidth
    const sh = scene.clientHeight
    const cw = card.offsetWidth
    const ch = card.offsetHeight
    const painted = Boolean(PLACES[openId]?.painted)
    const ax = r.left + r.width / 2 - s.left
    const ay = r.top + r.height * (painted ? 0.2 : 0.12) - s.top
    const objL = r.left - s.left
    const objR = objL + r.width
    const objT = r.top - s.top
    let left = objR + 26
    let top = ay - 18
    if (objT > sh * 0.5 && objT - ch - 22 > 14) {
      left = clamp(ax - cw * 0.35, 14, sw - cw - 14)
      top = objT - ch - 22
    } else {
      if (left + cw > sw - 14) left = objL - cw - 26
      if (left < 14) { left = clamp(ax - cw / 2, 14, sw - cw - 14); top = r.bottom - s.top + 20 }
    }
    top = clamp(top, 14, Math.max(14, sh - ch - 14))
    setCardPos({ left, top, ax, ay })
  }, [openId, geo, stats.balance, owned])

  const buy = (id: string) => {
    const item = KEEPSAKES.find((entry) => entry.id === id)
    const place = PLACES[id]
    if (!item || !place || !onBuy(id)) return
    closeCard()
    tickJar(-item.price)
    setNewId(id)
    timers.current.push(window.setTimeout(() => setNewId((current) => current === id ? null : current), 1400))
    const [x, y] = place.painted ? place.painted.at : [place.base![0], place.base![1] - place.w! * 0.5]
    addSparks(x, y, 22, 1.8, 1.2)
  }

  /* ---------- Parallax: the world drifts a few px against the pointer ---------- */
  const onPointerMove = (event: React.PointerEvent) => {
    const scene = sceneRef.current
    if (!scene || reduced || openId) return
    const r = scene.getBoundingClientRect()
    scene.style.setProperty('--mx', (((event.clientX - r.left) / r.width - 0.5) * 2).toFixed(3))
    scene.style.setProperty('--my', (((event.clientY - r.top) / r.height - 0.5) * 2).toFixed(3))
  }
  const resetParallax = () => { sceneRef.current?.style.setProperty('--mx', '0'); sceneRef.current?.style.setProperty('--my', '0') }
  useEffect(() => { if (openId) resetParallax() }, [openId])

  /* ---------- Fireflies, dust in the moon shaft, and sparks: one canvas, rAF only while shown ---------- */
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const r = seeded(11)
    const ZONES = [
      { x: 40, y: 380, w: 300, h: 540, c: [214, 255, 150] as [number, number, number], wgt: 3 },
      { x: 1330, y: 500, w: 220, h: 440, c: [214, 255, 150] as [number, number, number], wgt: 2 },
      { x: 120, y: 90, w: 460, h: 300, c: [255, 220, 150] as [number, number, number], wgt: 2 },
      { x: 560, y: 720, w: 600, h: 200, c: [255, 230, 170] as [number, number, number], wgt: 1 },
    ]
    const total = ZONES.reduce((sum, zone) => sum + zone.wgt, 0)
    const spawn = (): Fly => {
      let pick = r() * total
      let zone = ZONES[0]
      for (const z of ZONES) { pick -= z.wgt; if (pick <= 0) { zone = z; break } }
      return { x: zone.x + r() * zone.w, y: zone.y + r() * zone.h, c: zone.c, r: 1.4 + r() * 1.8, t: r() * 100, sp: 0.35 + r() * 0.5, a: 0, vx: (r() - 0.5) * 0.3, vy: (r() - 0.5) * 0.2, life: 1 }
    }
    const flies: Fly[] = []
    const dust = Array.from({ length: 48 }, () => ({ y: 560 + r() * 430, u: r(), r: 0.8 + r() * 1.4, t: r() * 100, sp: 0.15 + r() * 0.25 }))
    const shaftX = (y: number, u: number) => { const q = (y - 580) / 412; const left = 860 - 520 * q; const right = 1290 - 130 * q; return left + u * (right - left) }
    let size = { w: 0, h: 0, dpr: 1 }
    let raf = 0
    let last = performance.now()

    const draw = (dt: number, still: boolean) => {
      const { geo: g, theme: t, sparks } = fx.current
      if (!g) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      if (size.w !== g.W || size.h !== g.H || size.dpr !== dpr) {
        size = { w: g.W, h: g.H, dpr }
        canvas.width = Math.round(g.W * dpr)
        canvas.height = Math.round(g.H * dpr)
      }
      const light = t === 'light'
      const want = light ? Math.round(fx.current.flies * 0.5) : fx.current.flies
      while (flies.length < want) { const fly = spawn(); if (still) fly.a = 0.35 + r() * 0.5; flies.push(fly) }
      if (flies.length > want) { if (still) flies.length = want; else flies[flies.length - 1].life -= 0.02 * dt }
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.setTransform(dpr * g.S, 0, 0, dpr * g.S, dpr * g.OX, dpr * g.OY)
      ctx.globalCompositeOperation = 'lighter'
      const dustA = light ? 0.5 : 0.42
      for (const d of dust) {
        if (!still) { d.t += 0.01 * dt * d.sp; d.y += 0.12 * d.sp * dt; if (d.y > 985) d.y = 580 }
        const x = shaftX(d.y, d.u) + Math.sin(d.t * 2.1) * 10
        const a = dustA * (0.5 + 0.5 * Math.sin(d.t * 3.7)) * Math.min(1, (d.y - 580) / 60)
        ctx.fillStyle = light ? `rgba(255,236,200,${a.toFixed(3)})` : `rgba(200,220,255,${a.toFixed(3)})`
        ctx.beginPath(); ctx.arc(x, d.y, d.r, 0, 6.283); ctx.fill()
      }
      for (let i = flies.length - 1; i >= 0; i -= 1) {
        const f = flies[i]
        if (f.life <= 0) { flies.splice(i, 1); continue }
        if (!still) {
          f.t += 0.012 * dt * f.sp
          f.x += (f.vx + Math.sin(f.t * 1.7) * 0.25) * dt
          f.y += (f.vy + Math.cos(f.t * 1.3) * 0.2) * dt
          f.a += (((Math.sin(f.t * 3) + 1) / 2) ** 2 - f.a) * 0.05 * dt
        }
        const a = f.a * 0.9 * Math.min(1, f.life)
        const [cr, cg, cb] = light ? [255, 240, 200] : f.c
        const glow = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 6)
        glow.addColorStop(0, `rgba(${cr},${cg},${cb},${(a * 0.9).toFixed(3)})`)
        glow.addColorStop(0.3, `rgba(${cr},${cg},${cb},${(a * 0.35).toFixed(3)})`)
        glow.addColorStop(1, `rgba(${cr},${cg},${cb},0)`)
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 6, 0, 6.283); ctx.fill()
        ctx.fillStyle = `rgba(255,255,240,${(a * 0.9).toFixed(3)})`; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.7, 0, 6.283); ctx.fill()
      }
      for (let i = sparks.length - 1; i >= 0; i -= 1) {
        const s = sparks[i]
        s.x += s.vx * dt; s.y += s.vy * dt; s.vy -= 0.02 * dt; s.vx *= 0.985; s.life -= 0.022 * dt
        if (s.life <= 0) { sparks.splice(i, 1); continue }
        ctx.fillStyle = `rgba(255,225,160,${(s.life * 0.9).toFixed(3)})`
        ctx.beginPath(); ctx.arc(s.x, s.y, 2 + s.life * 1.5, 0, 6.283); ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'
    }

    // Reduced motion draws still frames and only runs while sparks are flying.
    const live = () => !document.hidden && (!fx.current.reduced || fx.current.sparks.length > 0)
    const frame = (now: number) => {
      raf = 0
      const dt = Math.min(50, now - last) / 16.7
      last = now
      draw(dt, false)
      if (live()) raf = requestAnimationFrame(frame)
      else if (fx.current.reduced) draw(0, true)
    }
    const kick = () => {
      if (raf || document.hidden) return
      if (live()) { last = performance.now(); raf = requestAnimationFrame(frame) } else draw(0, true)
    }
    fx.current.kick = kick
    const onVisibility = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0 } else kick() }
    document.addEventListener('visibilitychange', onVisibility)
    kick()
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisibility)
      fx.current.kick = () => {}
    }
  }, [])
  // Redraw (or restart) when what the canvas depends on changes.
  useEffect(() => { fx.current.kick() }, [geo, theme, reduced, stats.energyState])

  /* ---------- Derived view values ---------- */
  const lit = (i: number) => i < stats.lanterns ? 1 : i === stats.lanterns ? stats.partial : 0
  const litCount = Math.min(5, stats.lanterns)
  const stageIndex = GROWTH_STAGES.findIndex((stage) => stage.id === stats.growth.stage.id)
  const sapLevel = sapY(stats.sap)
  const sapText = stats.growth.next ? `${Math.max(1, Math.ceil(stats.growth.toNext))} h to ${stats.growth.next.name}` : `${Math.round(stats.sap)} h of sap`

  const hearth = hearthSprite(stats.energyState, stats.growth.stage.id)
  const hearthSet = STAGE_SPRITES[stats.growth.stage.id] ? [STAGE_SPRITES[stats.growth.stage.id]!] : Object.values(HEARTH)
  const hH = spriteHeight(hearth)
  const hW = hH * hearth.w / hearth.h
  const emberStyle = { left: (BW - hW) / 2 + hearth.ember[0] * hW, top: BH - hH + hearth.ember[1] * hH }

  const cinderPose = stats.energyState === 'asleep' ? 'asleep' : 'awake'
  const cinder = CINDER[cinderPose]
  const cH = cinder.height
  const cWd = cH * cinder.w / cinder.h

  const focusMin = Math.floor(stats.today.focusSeconds / 60)
  const breakMin = Math.round(stats.today.breakSeconds / 60)
  const date = SLATE_DATE.format(todayDate())
  const tickTasks = useTick(stats.today.tasksDone)
  const tickFocus = useTick(focusMin)
  const tickBreaks = useTick(breakMin)
  const tickDays = useTick(stats.today.focusDaysKept)

  // The sign hangs from a nail at plate (226, 326); the slate leans at (1218, 652).
  // Both are fixed-size; `ts` scales them about the nail and the top-left corner.
  const signLeft = fitX(px(226) - 80 * ts, 160 * ts) + 80 * ts // the plank's centre; it is a little wider with Radiant 100
  const signTop = py(326) + 20
  const slateLeft = fitX(px(1218), 187 * ts)
  const slateTop = fitY(py(652), 128 * ts)

  const at = (x: number, y: number): CSSProperties => ({ left: px(x), top: py(y) })
  const card = KEEPSAKES.find((item) => item.id === cardId) ?? KEEPSAKES[0]
  const cardOwned = owned.has(card.id)

  const pageStyle = { '--k': k.toFixed(4), '--ts': ts.toFixed(3) } as CSSProperties

  return (
    <main className="content-area sanctuary-page" data-energy={stats.energyState} data-cinder={cinderAway ? 'away' : 'home'} style={pageStyle}>
      <div
        className={`sanc-scene ${geo ? 'is-ready' : ''}`}
        ref={sceneRef}
        onPointerMove={onPointerMove}
        onPointerLeave={resetParallax}
        onClick={closeCard}
      >
        <div className="sanc-world" ref={worldRef}>
          <div className="sanc-plate" style={{ backgroundImage: `url(${hollowNight})` }} />
          <div className="sanc-plate is-day" style={{ backgroundImage: `url(${hollowDay})` }} />
          <div className="sanc-night" />

          <svg className="sanc-fx sanc-fx-light" viewBox={`0 0 ${PW} ${PH}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <defs>
              <radialGradient id="sancLampGlass"><stop offset="0" stopColor="#fff4d6" stopOpacity="1" /><stop offset=".5" stopColor="#ffd27e" stopOpacity=".75" /><stop offset="1" stopColor="#ffb860" stopOpacity="0" /></radialGradient>
              <radialGradient id="sancLampHalo"><stop offset="0" stopColor="#ffd58a" stopOpacity=".5" /><stop offset=".4" stopColor="#ffc26a" stopOpacity=".16" /><stop offset="1" stopColor="#ffb860" stopOpacity="0" /></radialGradient>
              <radialGradient id="sancLampWall"><stop offset="0" stopColor="#ffc98a" stopOpacity=".22" /><stop offset="1" stopColor="#ffb860" stopOpacity="0" /></radialGradient>
              <radialGradient id="sancKeepHalo"><stop offset="0" stopColor="#ffe6b8" stopOpacity=".42" /><stop offset=".5" stopColor="#ffd58a" stopOpacity=".12" /><stop offset="1" stopColor="#ffd58a" stopOpacity="0" /></radialGradient>
              <linearGradient id="sancShaft" x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="sanc-shaft-stop" stopOpacity=".28" /><stop offset=".55" className="sanc-shaft-stop" stopOpacity=".1" /><stop offset="1" className="sanc-shaft-stop" stopOpacity="0" /></linearGradient>
              <linearGradient id="sancSap" gradientUnits="userSpaceOnUse" x1="0" y1="640" x2="0" y2="430"><stop offset="0" stopColor="#ff8a2a" stopOpacity=".55" /><stop offset=".8" stopColor="#ffb24a" stopOpacity=".95" /><stop offset="1" stopColor="#ffe6a8" stopOpacity="1" /></linearGradient>
              <filter id="sancBlur4" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4" /></filter>
              <filter id="sancBlur14" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="14" /></filter>
              <filter id="sancBlur2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2" /></filter>
              <filter id="sancBlur6" x="-100%" y="-30%" width="300%" height="160%"><feGaussianBlur stdDeviation="6" /></filter>
            </defs>
            <g className="sanc-shaft" filter="url(#sancBlur14)" opacity=".9">
              <polygon points="860,600 1290,560 1160,992 340,992" fill="url(#sancShaft)" />
              <polygon points="980,590 1200,575 1080,992 760,992" fill="url(#sancShaft)" opacity=".6" />
            </g>
            {LAMPS.map((lamp, i) => (
              <g key={i} className="sanc-lamp" style={{ '--lit': lit(i).toFixed(2) } as CSSProperties}>
                <circle className="wall" cx={lamp.x} cy={lamp.y} r={230} fill="url(#sancLampWall)" />
                <circle className="halo" cx={lamp.x} cy={lamp.y} r={95} fill="url(#sancLampHalo)" />
                <ellipse className="glass" cx={lamp.x} cy={lamp.y} rx={lamp.rx} ry={lamp.ry} fill="url(#sancLampGlass)" filter="url(#sancBlur4)" />
              </g>
            ))}
            {KEEPSAKES.map((item) => {
              const place = PLACES[item.id]
              const on = owned.has(item.id)
              if (place.painted) return (
                <g key={item.id} className={`sanc-keep-halo ${on ? '' : 'is-off'}`}>
                  <circle cx={place.painted.at[0]} cy={place.painted.at[1]} r={place.painted.r} fill="url(#sancKeepHalo)" />
                  <circle cx={place.painted.at[0] + 4} cy={place.painted.at[1] - place.painted.r * 0.34} r={1.8} fill="#fff6dc" filter="url(#sancBlur2)" />
                </g>
              )
              return <circle key={item.id} className={`sanc-keep-halo ${on ? '' : 'is-off'}`} cx={place.base![0]} cy={place.base![1] - place.w! * 0.55} r={place.w! * 1.1} fill="url(#sancKeepHalo)" />
            })}
            <path d={`M${GROWTH.x} ${GROWTH.bottom} V ${sapLevel}`} stroke="#ffb24a" strokeWidth={9} fill="none" strokeLinecap="round" opacity={0.5} filter="url(#sancBlur6)" />
            <path d={`M${GROWTH.x} ${GROWTH.bottom} V ${sapLevel}`} stroke="url(#sancSap)" strokeWidth={2.4} fill="none" strokeLinecap="round" />
            <circle className="sanc-sap-tip" cx={GROWTH.x} cy={sapLevel} r={4.5} fill="#fff0c8" filter="url(#sancBlur2)" />
          </svg>

          {/* Keepsakes and the glimmer jar: Sol's cut-outs placed in plate space */}
          {KEEPSAKES.map((item) => {
            const place = PLACES[item.id]
            const isOwned = owned.has(item.id)
            const classes = ['sanc-ks', isOwned ? 'is-owned' : 'is-locked', place.painted ? 'is-painted' : '', place.hang ? 'is-hang' : '', openId === item.id ? 'is-open' : '', newId === item.id ? 'is-new' : ''].join(' ')
            const style: CSSProperties = place.painted
              ? { left: px(place.painted.at[0]), top: py(place.painted.at[1] + place.painted.r * 0.7), width: place.painted.r * 2 * S, height: place.painted.r * 1.6 * S }
              : { left: px(place.base![0]), top: py(place.base![1]), width: place.w! * S, height: place.w! * place.ratio! * S }
            return (
              <button
                key={item.id}
                ref={(node) => { if (node) objectRefs.current.set(item.id, node); else objectRefs.current.delete(item.id) }}
                className={classes}
                style={style}
                aria-label={isOwned ? `${item.name}, owned` : `${item.name}, ${item.price} glimmers`}
                onClick={(event) => { event.stopPropagation(); openCard(item.id) }}
                onPointerEnter={() => setHoverId(item.id)}
                onPointerLeave={() => setHoverId((current) => current === item.id ? null : current)}
                onFocus={() => setHoverId(item.id)}
                onBlur={() => setHoverId((current) => current === item.id ? null : current)}
              >
                {place.src && <><img src={place.src} alt="" draggable={false} /><i className="shadow" /></>}
              </button>
            )
          })}

          <div className="sanc-jar" ref={jarRef} style={{ left: px(JAR.base[0]), top: py(JAR.base[1]), width: JAR.w * S, height: JAR.w * JAR.ratio * S }} aria-hidden="true">
            <img src={jarLow} alt="" draggable={false} />
            <img src={jarHalf} alt="" draggable={false} style={{ opacity: smooth(jarLevel, 0.1, 0.45) }} />
            <img src={jarFull} alt="" draggable={false} style={{ opacity: smooth(jarLevel, 0.5, 0.95) }} />
            <i className="shadow" />
            <span className="motes">
              {JAR_MOTES.map((mote, i) => <i key={i} style={{ left: `${mote.x}%`, top: `${mote.y}%`, opacity: i < jarMotes ? 1 : 0, '--d': `${mote.d.toFixed(2)}s`, '--o': `${mote.o.toFixed(2)}s` } as CSSProperties} />)}
            </span>
          </div>

          {/* Ink layer: lantern flames and the carved growth marks */}
          <svg className="sanc-fx" viewBox={`0 0 ${PW} ${PH}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <defs><filter id="sancBlur3" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" /></filter></defs>
            <g className="sanc-carve-cut">
              {[`M${GROWTH.x} ${GROWTH.bottom} V ${GROWTH.notches[2] - 20}`, ...GROWTH.notches.map((y) => `M${GROWTH.x - 16} ${y} H ${GROWTH.x + 16}`)].map((d) => (
                <g key={d}>
                  <path d={d} stroke="rgba(255,232,196,.5)" strokeWidth={1.3} fill="none" transform="translate(0 2)" />
                  <path d={d} stroke="rgba(12,6,2,.85)" strokeWidth={3} fill="none" strokeLinecap="round" />
                </g>
              ))}
            </g>
            {LAMPS.map((lamp, i) => (
              <g key={i} className="sanc-lamp" style={{ '--lit': lit(i).toFixed(2) } as CSSProperties}>
                <ellipse className="flame" cx={lamp.x} cy={lamp.fy} rx={6} ry={12} fill="#ffe9b0" filter="url(#sancBlur3)" style={{ animationDelay: `${FLAME_DELAYS[i].toFixed(2)}s` }} />
                <ellipse className="flame" cx={lamp.x} cy={lamp.fy} rx={3.6} ry={8} fill="#fff8e6" filter="url(#sancBlur2)" />
                <ellipse className="core" cx={lamp.x} cy={lamp.fy + 2} rx={1.6} ry={4} fill="#ffffff" />
              </g>
            ))}
          </svg>

          {/* Labels: names under the objects, the growth carving */}
          {KEEPSAKES.map((item) => {
            const place = PLACES[item.id]
            const isOwned = owned.has(item.id)
            const shown = isOwned || browse || nextUp.includes(item.id) || hoverId === item.id || openId === item.id
            return (
              <div key={item.id} ref={clampRef(item.id)} data-x={px(place.label[0])} className={`sanc-label ${isOwned ? 'is-owned' : ''} ${shown ? '' : 'is-quiet'}`} style={{ top: py(place.label[1]) }}>
                <span>{item.name}</span>
                {!isOwned && <span className="price">{item.price}</span>}
              </div>
            )
          })}
          <div ref={clampRef('jar')} data-x={px(JAR.label[0])} className="sanc-label is-owned" style={{ top: py(JAR.label[1]) }}>
            <span>Glimmer jar</span><span className="price">{jarBalance}</span>
          </div>

          {jarDelta && <span key={jarDelta.key} className="sanc-jdelta" style={at(JAR.base[0], JAR.base[1] - JAR.w * JAR.ratio * 0.95)}>{jarDelta.text}</span>}

          <div className="sanc-carve is-head" style={at(GROWTH.x - 16, GROWTH.notches[2] - 60)}>Growth</div>
          <div className="sanc-carve is-sap" style={at(GROWTH.x - 16, GROWTH.notches[2] - 44)}>{sapText}</div>
          {GROWTH_STAGES.map((stage, i) => (
            <div key={stage.id} className={`sanc-carve ${i === stageIndex ? 'is-now' : i > stageIndex ? 'is-next' : ''}`} style={at(GROWTH.x + 26, GROWTH.notches[i] - 8)}>{stage.name}</div>
          ))}
          <div className="sanc-tour-box" data-tour="growth" style={{ left: px(GROWTH.x - 16) - 6, top: py(GROWTH.notches[2] - 60) - 6, width: Math.max(px(GROWTH.x + 26) + 62 * ts, px(GROWTH.x - 16) + 92 * ts) - px(GROWTH.x - 16) + 12, height: py(GROWTH.bottom) - py(GROWTH.notches[2] - 60) + 12 }} />
          <div className="sanc-tour-box" data-tour="lanterns" style={{ left: px(140), top: py(100), width: 416 * S, height: 222 * S }} />

          {/* Energy: a wooden plank hanging under the lanterns */}
          <div className="sanc-sign" style={{ left: signLeft, top: signTop }} aria-label={`Energy ${stats.energy} of 100, ${LABELS[stats.energyState]}`}>
            <i className="twine" /><i className="nail" />
            <div className="r1"><span>Energy</span><span className="note">{litCount} of 5 lit</span></div>
            <div className="r2"><b>{LABELS[stats.energyState]}</b><span className="num"><em>{stats.energy}</em> / 100</span></div>
            <div className="tally">
              {LAMPS.map((_, i) => <i key={i} style={{ '--f': lit(i).toFixed(2) } as CSSProperties} />)}
              <span className="t">resets 6 AM</span>
            </div>
          </div>

          {/* Today: a chalk slate leaning on the window rim */}
          <div className="sanc-slate" style={{ left: slateLeft, top: slateTop }}>
            <div className="t"><span>Today</span><span>{date}</span></div>
            <div className="g">
              <div><b key={`a${tickTasks}`} className={tickTasks ? 'tick' : ''}>{stats.today.tasksDone}</b><span>{plural(stats.today.tasksDone, 'task done', 'tasks done')}</span></div>
              <div>
                <b key={`b${tickFocus}`} className={tickFocus ? 'tick' : ''}><Duration minutes={focusMin} /></b>
                <span>focus</span>
              </div>
              <div><b key={`c${tickBreaks}`} className={tickBreaks ? 'tick' : ''}><Duration minutes={breakMin} /></b><span>breaks</span></div>
              <div><b key={`d${tickDays}`} className={tickDays ? 'tick' : ''}>{stats.today.focusDaysKept}</b><span>{plural(stats.today.focusDaysKept, 'focus day kept', 'focus days kept')}</span></div>
            </div>
          </div>

          <button
            className={`sanc-tag ${browse ? 'is-on' : ''}`}
            style={{ left: clamp(px(470), EDGE + 70, W - EDGE - 70), top: py(548) }}
            onClick={(event) => { event.stopPropagation(); setBrowse((value) => !value) }}
            aria-pressed={browse}
            title={browse ? 'Hide the names of keepsakes still to buy' : 'Show every keepsake’s name and price'}
          >
            Keepsakes · <b>{ownedCount} of {KEEPSAKES.length}</b>
          </button>

          <div ref={clampRef('away')} data-x={px(300)} className="sanc-away" style={{ top: py(832) }} aria-hidden={!cinderAway}>Cinder is with you on the stopwatch</div>

          {/* Cinder: asleep on the moss bed, or awake under the lanterns */}
          <div className={`sanc-buddy sanc-cinder is-${cinderPose}`} style={{ left: px(cinder.feet[0]) - CW / 2, top: py(cinder.feet[1]) - CH }} aria-hidden="true">
            <div className="spill" />
            <div className="shadow" />
            <div className="rig"><div className="breath">
              {(['asleep', 'awake'] as const).map((pose) => {
                const sprite = CINDER[pose]
                const height = sprite.height
                return <img key={pose} className={`sp ${pose === cinderPose ? 'is-on' : ''}`} src={sprite.src} alt="" draggable={false} style={{ height, width: height * sprite.w / sprite.h }} />
              })}
              <div className="ember" style={{ left: (CW - cWd) / 2 + cinder.ember[0] * cWd, top: CH - cH + cinder.ember[1] * cH }} />
              <div className={`light ${cinderPose === 'awake' ? 'is-on' : ''}`} style={{ left: (CW - cWd) / 2 + cinder.light[0] * cWd, top: CH - cH + cinder.light[1] * cH }} />
            </div></div>
          </div>

          {/* Hearth */}
          <div className={`sanc-buddy sanc-hearth ${cheer ? 'is-cheer' : ''}`} style={{ left: px(HEARTH_FEET[0]) - BW / 2, top: py(HEARTH_FEET[1]) - BH }} aria-hidden="true">
            <div className="wall" />
            <div className="backlight" />
            <div className="spill" />
            <div className="shadow" />
            <div className="rig"><div className="sway"><div className="breath">
              {hearthSet.map((sprite) => {
                const height = spriteHeight(sprite)
                return <img key={sprite.src} className={`sp ${sprite === hearth ? 'is-on' : ''}`} src={sprite.src} alt="" draggable={false} style={{ height, width: height * sprite.w / sprite.h }} />
              })}
              <div className="ember" ref={emberRef} style={emberStyle} />
            </div></div></div>
            <div className="orbit">
              {ORBIT.map((spark, i) => <i key={i} style={{ '--r': `${spark.r.toFixed(0)}px`, '--d': `${spark.d.toFixed(1)}s`, '--o': `${spark.o.toFixed(1)}s` } as CSSProperties} />)}
            </div>
          </div>

          <canvas ref={canvasRef} className="sanc-canvas" aria-hidden="true" />
        </div>
        <div className="sanc-scrim" />

        {/* The keepsake card: a parchment shop tag tied to its object */}
        <svg className="sanc-cardline" aria-hidden="true" style={{ opacity: openId && cardPos ? 1 : 0 }}>
          {cardPos && <>
            <line x1={cardPos.ax} y1={cardPos.ay} x2={cardPos.left + 14.5} y2={cardPos.top + 14.5} className="shade" />
            <line x1={cardPos.ax} y1={cardPos.ay} x2={cardPos.left + 14.5} y2={cardPos.top + 14.5} />
          </>}
        </svg>
        <div
          ref={cardRef}
          className={`sanc-card ${openId && cardPos ? 'is-on' : ''}`}
          role="dialog"
          aria-label={card.name}
          aria-hidden={!openId}
          style={cardPos ? { left: cardPos.left, top: cardPos.top } : undefined}
          onClick={(event) => event.stopPropagation()}
        >
          <i className="hole" />
          <button className="close" onClick={closeCard} aria-label="Close" tabIndex={openId ? 0 : -1}>
            <svg viewBox="0 0 24 24"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
          <div className="name">{card.name}</div>
          <div className="desc">{card.description}</div>
          <div className={`foot ${!cardOwned && stats.balance < card.price ? 'is-wrap' : ''}`}>
            {cardOwned ? <>
              <span className="price">{card.price ? `${card.price} glimmers` : 'Starter'}</span>
              <span className="owned"><i><svg viewBox="0 0 24 24"><path d="m5 12 5 5L20 7" /></svg></i>Owned</span>
            </> : stats.balance >= card.price ? <>
              <span className="price">{card.price} glimmers</span>
              <button className="buy" onClick={() => buy(card.id)} tabIndex={openId ? 0 : -1}>Buy for {card.price}</button>
            </> : <>
              <span className="price">{card.price} glimmers</span>
              <span className="short">Not enough glimmers · {card.price - stats.balance} more</span>
            </>}
          </div>
        </div>

        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="sanc-flymote" ref={(node) => { moteRefs.current[i] = node }} />)}
      </div>
    </main>
  )
}

// 2h, 2h 15m or 15m, with the units small: the chalk numbers are the hero.
function Duration({ minutes }: { minutes: number }) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return <>{rest}<small>m</small></>
  return <>{hours}<small>h</small>{rest > 0 && <>{'\u2009'}{rest}<small>m</small></>}</>
}
