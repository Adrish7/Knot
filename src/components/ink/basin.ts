// The basin's one draw call. There is no simulation: the controller hands in a short list of soft
// round blobs of ink (where each recent second's drop has drifted to by now, plus the pointer's
// touches) and a single fragment pass sums them as gaussians and shades the water: ink on
// porcelain in light (Beer–Lambert, so dense ink stays saturated), luminous dye with a soft glow
// in dark. Everything is mixed in linear light and encoded at the end.
//
// uv is [0,1]² with the basin centred at (0.5, 0.5); GL's y points up, so 12 o'clock is +y.

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
}

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

// Each blob is (x, y, r², amount). The glow is the same blob widened, as if blurred.
const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec4 uBlobs[${MAX_BLOBS}];
uniform int uCount;
uniform float uEdge;
uniform vec3 uInk;
uniform vec3 uGround;
uniform float uDark;
uniform float uInkK;
uniform float uBloomAmt;
uniform float uClear;
uniform float uSheen;
uniform float uAlive;
const float RIM = ${RIM};
const float GLOW = 0.0008;
vec3 toLin(vec3 c) { return pow(c, vec3(2.2)); }
vec3 toSrgb(vec3 c) { return pow(max(c, vec3(0.0)), vec3(1.0 / 2.2)); }
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p);
  float m = 1.0 - smoothstep(RIM - uEdge, RIM, r);
  if (m <= 0.0) { fragColor = vec4(0.0); return; }

  float dye = 0.0;
  float bloom = 0.0;
  for (int i = 0; i < uCount; i++) {
    vec4 b = uBlobs[i];
    vec2 q = vUv - b.xy;
    float d2 = dot(q, q);
    float wide = b.z + GLOW;
    if (d2 > wide * 9.0) continue;
    dye += b.w * exp(-d2 / b.z);
    bloom += b.w * (b.z / wide) * exp(-d2 / wide);
  }
  float clearing = mix(uClear, 1.0, smoothstep(0.21, 0.36, r)) * uAlive;
  dye = min(dye, 1.6) * clearing;
  bloom = min(bloom, 1.6) * clearing;

  vec2 L = normalize(vec2(-0.35, 0.75));
  vec2 rhat = r > 1e-5 ? p / r : vec2(0.0);
  float wall = smoothstep(0.26, 0.5, r);
  float facing = dot(rhat, -L);
  vec3 ground = toLin(uGround);
  ground *= 1.0 + wall * (facing * mix(0.05, 0.09, uDark) - mix(0.03, 0.01, uDark));
  vec2 sp = p - vec2(-0.13, 0.13);
  ground += uSheen * exp(-dot(sp, sp) / 0.05);

  vec3 ink = toLin(uInk);
  vec3 absorb = pow(max(vec3(1.0) - ink, vec3(0.0)), vec3(1.8));
  vec3 lightCol = ground * exp(-uInkK * (dye + bloom * 0.35) * absorb);
  vec3 darkCol = ground + ink * (1.0 - exp(-uInkK * dye)) + ink * bloom * uBloomAmt;
  vec3 col = mix(lightCol, darkCol, uDark);

  fragColor = vec4(toSrgb(col) * m, m);
}`

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('ink: no shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`ink: compile ${gl.getShaderInfoLog(shader) ?? ''}`)
  return shader
}

export class Basin {
  private readonly gl: WebGL2RenderingContext
  private readonly program: WebGLProgram
  private readonly quad: WebGLBuffer
  private readonly u: Record<string, WebGLUniformLocation | null> = {}
  private readonly blobs = new Float32Array(MAX_BLOBS * 4)
  private count = 0
  private width = 1

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'low-power' })
    if (!gl) throw new Error('ink: no webgl2')
    this.gl = gl
    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('ink: no program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.bindAttribLocation(program, 0, 'aPos')
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`ink: link ${gl.getProgramInfoLog(program) ?? ''}`)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    this.program = program
    for (const name of ['uBlobs', 'uCount', 'uEdge', 'uInk', 'uGround', 'uDark', 'uInkK', 'uBloomAmt', 'uClear', 'uSheen', 'uAlive']) {
      this.u[name] = gl.getUniformLocation(program, name)
    }
    const quad = gl.createBuffer()
    if (!quad) throw new Error('ink: no buffer')
    this.quad = quad
    gl.bindBuffer(gl.ARRAY_BUFFER, quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.disable(gl.BLEND)
    gl.disable(gl.DEPTH_TEST)
  }

  resize(width: number, height: number) {
    this.width = width
    if (this.canvas.width !== width) this.canvas.width = width
    if (this.canvas.height !== height) this.canvas.height = height
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

  draw(look: Look) {
    const gl = this.gl
    const u = this.u
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.useProgram(this.program)
    if (this.count) gl.uniform4fv(u.uBlobs, this.blobs, 0, this.count * 4)
    gl.uniform1i(u.uCount, this.count)
    gl.uniform1f(u.uEdge, 1.2 / this.width)
    gl.uniform3f(u.uInk, look.ink[0], look.ink[1], look.ink[2])
    gl.uniform3f(u.uGround, look.ground[0], look.ground[1], look.ground[2])
    gl.uniform1f(u.uDark, look.dark)
    gl.uniform1f(u.uInkK, look.inkK)
    gl.uniform1f(u.uBloomAmt, look.bloom)
    gl.uniform1f(u.uClear, look.clear)
    gl.uniform1f(u.uSheen, look.sheen)
    gl.uniform1f(u.uAlive, look.alive)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  dispose() {
    this.gl.deleteProgram(this.program)
    this.gl.deleteBuffer(this.quad)
  }
}
