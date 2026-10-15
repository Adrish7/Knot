// A small WebGL2 stable-fluids solver masked to a disc, plus a height-field wave layer and the
// display pass. Nothing here knows about time, seconds or pointers: the controller in ink.ts
// decides what to inject and when to step; this file only pushes texels around.
//
// Textures (all square, half float, linear filtered, clamped):
//   velocity  RG16F  simRes     uv units per second
//   pressure  R16F   simRes
//   divergence, curl  R16F  simRes
//   wave      RG16F  waveRes    (h, h_prev)
//   dye       R16F   dyeRes     scalar ink density
//   bloom     R16F   dyeRes/4   blurred dye for the dark theme's glow and the light theme's feathered edge

import * as S from './shaders'

interface Target {
  texture: WebGLTexture
  fbo: WebGLFramebuffer
  width: number
  height: number
  texel: [number, number]
}

interface Pair {
  read: Target
  write: Target
  swap(): void
}

class Program {
  readonly program: WebGLProgram
  readonly uniforms: Record<string, WebGLUniformLocation | null> = {}
  constructor(gl: WebGL2RenderingContext, vert: WebGLShader, source: string) {
    const frag = compile(gl, gl.FRAGMENT_SHADER, source)
    const program = gl.createProgram()
    if (!program) throw new Error('ink: no program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`ink: link ${gl.getProgramInfoLog(program) ?? ''}`)
    gl.deleteShader(frag)
    this.program = program
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i)
      if (info) this.uniforms[info.name] = gl.getUniformLocation(program, info.name)
    }
  }
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('ink: no shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`ink: compile ${gl.getShaderInfoLog(shader) ?? ''}`)
  return shader
}

export interface SimParams {
  dt: number
  velocityDissipation: number
  dyeDissipation: number
  dyeSubtract: number
  curl: number
  spin: number
  draw: number
  push: number
  waveC2: number
  waveDamp: number
  waveSubsteps: number
  pressureIterations: number
}

export interface DisplayParams {
  ink: [number, number, number]
  ground: [number, number, number]
  dark: number
  inkK: number
  bloom: number
  refract: number
  spec: number
  diffuse: number
  normal: number
  waveAmp: number
  pressAmp: number
  clear: number
  sheen: number
  alive: number
}

export const RIM = 0.485 // basin radius in uv

export class Fluid {
  readonly gl: WebGL2RenderingContext
  private readonly vert: WebGLShader
  private readonly quad: WebGLBuffer
  private readonly programs: Record<string, Program>
  private velocity!: Pair
  private pressure!: Pair
  private dye!: Pair
  private wave!: Pair
  private divergence!: Target
  private curl!: Target
  private bloomA!: Target
  private bloomB!: Target
  private width = 0
  private height = 0
  readonly timer: { ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null; queries: WebGLQuery[]; last: number | null } = { ext: null, queries: [], last: null }

  constructor(private readonly canvas: HTMLCanvasElement, private readonly simRes: number, private readonly waveRes: number, private readonly dyeRes: number) {
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'low-power' })
    if (!gl) throw new Error('ink: no webgl2')
    this.gl = gl
    if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) throw new Error('ink: no float render targets')
    const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null
    this.timer.ext = timer
    this.vert = compile(gl, gl.VERTEX_SHADER, S.VERT)
    const quad = gl.createBuffer()
    if (!quad) throw new Error('ink: no buffer')
    this.quad = quad
    gl.bindBuffer(gl.ARRAY_BUFFER, quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.disable(gl.BLEND)
    gl.disable(gl.DEPTH_TEST)
    this.programs = {
      splat: new Program(gl, this.vert, S.SPLAT),
      force: new Program(gl, this.vert, S.FORCE),
      curl: new Program(gl, this.vert, S.CURL),
      vorticity: new Program(gl, this.vert, S.VORTICITY),
      advect: new Program(gl, this.vert, S.ADVECT),
      divergence: new Program(gl, this.vert, S.DIVERGENCE),
      pressure: new Program(gl, this.vert, S.PRESSURE),
      gradient: new Program(gl, this.vert, S.GRADIENT),
      wave: new Program(gl, this.vert, S.WAVE),
      scale: new Program(gl, this.vert, S.SCALE),
      down: new Program(gl, this.vert, S.DOWN),
      blur: new Program(gl, this.vert, S.BLUR),
      display: new Program(gl, this.vert, S.DISPLAY),
    }
    this.allocate()
  }

  private target(size: number, internal: number, format: number): Target {
    const gl = this.gl
    const texture = gl.createTexture()
    const fbo = gl.createFramebuffer()
    if (!texture || !fbo) throw new Error('ink: no texture')
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, size, size, 0, format, gl.HALF_FLOAT, null)
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('ink: incomplete framebuffer')
    gl.viewport(0, 0, size, size)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    return { texture, fbo, width: size, height: size, texel: [1 / size, 1 / size] }
  }

  private pair(size: number, internal: number, format: number): Pair {
    const a = this.target(size, internal, format)
    const b = this.target(size, internal, format)
    const pair = { read: a, write: b, swap() { const t = pair.read; pair.read = pair.write; pair.write = t } }
    return pair
  }

  private allocate() {
    const gl = this.gl
    this.velocity = this.pair(this.simRes, gl.RG16F, gl.RG)
    this.pressure = this.pair(this.simRes, gl.R16F, gl.RED)
    this.divergence = this.target(this.simRes, gl.R16F, gl.RED)
    this.curl = this.target(this.simRes, gl.R16F, gl.RED)
    this.wave = this.pair(this.waveRes, gl.RG16F, gl.RG)
    this.dye = this.pair(this.dyeRes, gl.R16F, gl.RED)
    const bloomRes = Math.round(this.dyeRes / 4)
    this.bloomA = this.target(bloomRes, gl.R16F, gl.RED)
    this.bloomB = this.target(bloomRes, gl.R16F, gl.RED)
  }

  resize(width: number, height: number) {
    this.width = width
    this.height = height
    if (this.canvas.width !== width) this.canvas.width = width
    if (this.canvas.height !== height) this.canvas.height = height
  }

  // --- drawing helpers ----------------------------------------------------------------------

  private use(name: string, texel: [number, number], edgeTexels = 1.5) {
    const gl = this.gl
    const program = this.programs[name]
    gl.useProgram(program.program)
    gl.uniform2f(program.uniforms.uTexel, texel[0], texel[1])
    gl.uniform1f(program.uniforms.uRim, RIM)
    gl.uniform1f(program.uniforms.uEdge, texel[0] * edgeTexels)
    return program
  }

  private bind(program: Program, name: string, target: Target, unit: number) {
    const gl = this.gl
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, target.texture)
    gl.uniform1i(program.uniforms[name], unit)
  }

  private blit(target: Target | null) {
    const gl = this.gl
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
      gl.viewport(0, 0, target.width, target.height)
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, this.width, this.height)
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  private clearTarget(target: Target) {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
    gl.viewport(0, 0, target.width, target.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  // --- injections -----------------------------------------------------------------------------

  private splat(pair: Pair, x: number, y: number, value: [number, number, number, number], radius: number, max: number, ring = 0) {
    const gl = this.gl
    const program = this.use('splat', pair.read.texel)
    this.bind(program, 'uTarget', pair.read, 0)
    gl.uniform2f(program.uniforms.uPoint, x, y)
    gl.uniform4f(program.uniforms.uValue, value[0], value[1], value[2], value[3])
    gl.uniform1f(program.uniforms.uRadius, radius * radius)
    gl.uniform1f(program.uniforms.uRing, ring)
    gl.uniform4f(program.uniforms.uMax, max, max, max, max)
    this.blit(pair.write)
    pair.swap()
  }

  splatDye(x: number, y: number, amount: number, radius: number, max = 1.6) {
    this.splat(this.dye, x, y, [amount, 0, 0, 0], radius, max)
  }

  splatVelocity(x: number, y: number, vx: number, vy: number, radius: number) {
    this.splat(this.velocity, x, y, [vx, vy, 0, 0], radius, 1e9)
  }

  splatWave(x: number, y: number, amount: number, radius: number, ring = 0) {
    this.splat(this.wave, x, y, [amount, 0, 0, 0], radius, 1e9, ring)
  }

  force(cx: number, cy: number, r0: number, r1: number, feather: number, tangential: number, radial: number) {
    const gl = this.gl
    const program = this.use('force', this.velocity.read.texel)
    this.bind(program, 'uTarget', this.velocity.read, 0)
    gl.uniform2f(program.uniforms.uCenter, cx, cy)
    gl.uniform1f(program.uniforms.uR0, r0)
    gl.uniform1f(program.uniforms.uR1, r1)
    gl.uniform1f(program.uniforms.uFeather, feather)
    gl.uniform1f(program.uniforms.uTangential, tangential)
    gl.uniform1f(program.uniforms.uRadial, radial)
    this.blit(this.velocity.write)
    this.velocity.swap()
  }

  clearDye() { this.clearTarget(this.dye.read); this.clearTarget(this.dye.write) }
  clearVelocity() { this.clearTarget(this.velocity.read); this.clearTarget(this.velocity.write); this.clearTarget(this.pressure.read); this.clearTarget(this.pressure.write) }
  clearWave() { this.clearTarget(this.wave.read); this.clearTarget(this.wave.write) }

  // --- one fixed step -------------------------------------------------------------------------

  step(p: SimParams) {
    const gl = this.gl
    const texel = this.velocity.read.texel

    let program = this.use('curl', texel)
    this.bind(program, 'uVelocity', this.velocity.read, 0)
    this.blit(this.curl)

    program = this.use('vorticity', texel)
    this.bind(program, 'uVelocity', this.velocity.read, 0)
    this.bind(program, 'uCurl', this.curl, 1)
    gl.uniform1f(program.uniforms.uCurlStrength, p.curl)
    gl.uniform1f(program.uniforms.uDt, p.dt)
    this.blit(this.velocity.write)
    this.velocity.swap()

    program = this.use('divergence', texel)
    this.bind(program, 'uVelocity', this.velocity.read, 0)
    this.blit(this.divergence)

    program = this.use('scale', texel)
    this.bind(program, 'uTexture', this.pressure.read, 0)
    gl.uniform1f(program.uniforms.uScale, 0.8)
    this.blit(this.pressure.write)
    this.pressure.swap()

    program = this.use('pressure', texel)
    this.bind(program, 'uDivergence', this.divergence, 1)
    for (let i = 0; i < p.pressureIterations; i++) {
      this.bind(program, 'uPressure', this.pressure.read, 0)
      this.blit(this.pressure.write)
      this.pressure.swap()
    }

    program = this.use('gradient', texel)
    this.bind(program, 'uPressure', this.pressure.read, 0)
    this.bind(program, 'uVelocity', this.velocity.read, 1)
    this.blit(this.velocity.write)
    this.velocity.swap()

    program = this.use('advect', texel)
    this.bind(program, 'uVelocity', this.velocity.read, 0)
    this.bind(program, 'uSource', this.velocity.read, 1)
    gl.uniform1f(program.uniforms.uDt, p.dt)
    gl.uniform1f(program.uniforms.uDissipation, p.velocityDissipation)
    gl.uniform1f(program.uniforms.uSubtract, 0)
    gl.uniform1f(program.uniforms.uFloor, -1e9)
    gl.uniform1f(program.uniforms.uSpin, 0)
    gl.uniform1f(program.uniforms.uDraw, 0)
    gl.uniform1f(program.uniforms.uPush, 0)
    this.blit(this.velocity.write)
    this.velocity.swap()

    program = this.use('advect', this.dye.read.texel)
    this.bind(program, 'uVelocity', this.velocity.read, 0)
    this.bind(program, 'uSource', this.dye.read, 1)
    gl.uniform1f(program.uniforms.uDt, p.dt)
    gl.uniform1f(program.uniforms.uDissipation, p.dyeDissipation)
    gl.uniform1f(program.uniforms.uSubtract, p.dyeSubtract)
    gl.uniform1f(program.uniforms.uFloor, 0)
    gl.uniform1f(program.uniforms.uSpin, p.spin)
    gl.uniform1f(program.uniforms.uDraw, p.draw)
    gl.uniform1f(program.uniforms.uPush, p.push)
    this.blit(this.dye.write)
    this.dye.swap()

    program = this.use('wave', this.wave.read.texel)
    gl.uniform1f(program.uniforms.uC2, p.waveC2)
    gl.uniform1f(program.uniforms.uDamp, p.waveDamp)
    for (let i = 0; i < p.waveSubsteps; i++) {
      this.bind(program, 'uWave', this.wave.read, 0)
      this.blit(this.wave.write)
      this.wave.swap()
    }
  }

  // --- display --------------------------------------------------------------------------------

  render(d: DisplayParams) {
    const gl = this.gl
    const timing = this.beginTimer()

    let program = this.use('down', this.bloomA.texel)
    this.bind(program, 'uTexture', this.dye.read, 0)
    gl.uniform2f(program.uniforms.uOff, this.dye.read.texel[0], this.dye.read.texel[1])
    this.blit(this.bloomA)
    program = this.use('blur', this.bloomA.texel)
    this.bind(program, 'uTexture', this.bloomA, 0)
    gl.uniform2f(program.uniforms.uDir, this.bloomA.texel[0], 0)
    this.blit(this.bloomB)
    this.bind(program, 'uTexture', this.bloomB, 0)
    gl.uniform2f(program.uniforms.uDir, 0, this.bloomA.texel[1])
    this.blit(this.bloomA)

    program = this.use('display', [1 / this.width, 1 / this.height], 1.2)
    this.bind(program, 'uDye', this.dye.read, 0)
    this.bind(program, 'uWave', this.wave.read, 1)
    this.bind(program, 'uPressure', this.pressure.read, 2)
    this.bind(program, 'uBloom', this.bloomA, 3)
    const u = program.uniforms
    gl.uniform2f(u.uWaveTexel, this.wave.read.texel[0], this.wave.read.texel[1])
    gl.uniform3f(u.uInk, d.ink[0], d.ink[1], d.ink[2])
    gl.uniform3f(u.uGround, d.ground[0], d.ground[1], d.ground[2])
    gl.uniform1f(u.uDark, d.dark)
    gl.uniform1f(u.uInkK, d.inkK)
    gl.uniform1f(u.uBloomAmt, d.bloom)
    gl.uniform1f(u.uRefract, d.refract)
    gl.uniform1f(u.uSpec, d.spec)
    gl.uniform1f(u.uDiffuse, d.diffuse)
    gl.uniform1f(u.uNormal, d.normal)
    gl.uniform1f(u.uWaveAmp, d.waveAmp)
    gl.uniform1f(u.uPressAmp, d.pressAmp)
    gl.uniform1f(u.uClear, d.clear)
    gl.uniform1f(u.uSheen, d.sheen)
    gl.uniform1f(u.uAlive, d.alive)
    this.blit(null)

    if (timing) this.endTimer()
  }

  // GPU time per frame, when the browser exposes timer queries (it often does not on Metal).
  private beginTimer() {
    const gl = this.gl
    const ext = this.timer.ext
    if (!ext) return false
    for (const query of this.timer.queries.splice(0)) {
      const available = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) as boolean
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT) as boolean
      if (available && !disjoint) this.timer.last = (gl.getQueryParameter(query, gl.QUERY_RESULT) as number) / 1e6
      if (available || disjoint) gl.deleteQuery(query)
      else this.timer.queries.push(query)
    }
    if (this.timer.queries.length) return false
    const query = gl.createQuery()
    if (!query) return false
    gl.beginQuery(ext.TIME_ELAPSED_EXT, query)
    this.timer.queries.push(query)
    return true
  }

  private endTimer() {
    const ext = this.timer.ext
    if (ext) this.gl.endQuery(ext.TIME_ELAPSED_EXT)
  }

  dispose() {
    const gl = this.gl
    for (const pair of [this.velocity, this.pressure, this.dye, this.wave]) {
      for (const t of [pair.read, pair.write]) { gl.deleteTexture(t.texture); gl.deleteFramebuffer(t.fbo) }
    }
    for (const t of [this.divergence, this.curl, this.bloomA, this.bloomB]) { gl.deleteTexture(t.texture); gl.deleteFramebuffer(t.fbo) }
    for (const program of Object.values(this.programs)) gl.deleteProgram(program.program)
    gl.deleteShader(this.vert)
    gl.deleteBuffer(this.quad)
  }
}
