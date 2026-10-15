// GLSL for the ink basin. One vertex shader (a full-screen quad that also hands each fragment
// its four neighbours) and a set of small fragment programs: the stable-fluids passes (splat,
// force, curl, vorticity, advect, divergence, pressure, gradient), a height-field wave step for
// the water surface, a scale/copy, a two-level bloom, and the display pass that turns scalar dye
// density into ink on porcelain (light) or luminous dye in black water (dark).
//
// Conventions: every simulation texture is square with uv in [0,1]², the basin centred at
// (0.5, 0.5) with radius uRim. Velocity is in uv units per second. GL's y axis points up, so
// 12 o'clock is +y and clockwise runs from +y toward +x.

export const VERT = `#version 300 es
precision highp float;
in vec2 aPos;
uniform vec2 uTexel;
out vec2 vUv;
out vec2 vL;
out vec2 vR;
out vec2 vT;
out vec2 vB;
void main() {
  vUv = aPos * 0.5 + 0.5;
  vL = vUv - vec2(uTexel.x, 0.0);
  vR = vUv + vec2(uTexel.x, 0.0);
  vT = vUv + vec2(0.0, uTexel.y);
  vB = vUv - vec2(0.0, uTexel.y);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

const HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 fragColor;
uniform float uRim;
uniform float uEdge;
float mask(vec2 uv) { return 1.0 - smoothstep(uRim - uEdge, uRim, length(uv - 0.5)); }
`

// Adds a gaussian blob (or a thin ring when uRing > 0) of uValue to the target.
export const SPLAT = HEAD + `
uniform sampler2D uTarget;
uniform vec2 uPoint;
uniform vec4 uValue;
uniform float uRadius;
uniform float uRing;
uniform vec4 uMax;
void main() {
  vec2 p = vUv - uPoint;
  float d2 = dot(p, p);
  float g;
  if (uRing > 0.0) { float dr = sqrt(d2) - uRing; g = exp(-dr * dr / uRadius); }
  else g = exp(-d2 / uRadius);
  vec4 base = texture(uTarget, vUv);
  fragColor = min(base + uValue * g * mask(vUv), uMax);
}`

// Adds a swirl (tangential, positive = counter-clockwise) and/or a radial push (positive =
// outward) inside a soft annulus [uR0, uR1] around uCenter. Minute vortex, hour ring, start
// splash and the reset drain are all this.
export const FORCE = HEAD + `
uniform sampler2D uTarget;
uniform vec2 uCenter;
uniform float uR0;
uniform float uR1;
uniform float uFeather;
uniform float uTangential;
uniform float uRadial;
void main() {
  vec2 p = vUv - uCenter;
  float r = length(p);
  vec2 rhat = r > 1e-5 ? p / r : vec2(0.0);
  vec2 that = vec2(-rhat.y, rhat.x);
  float band = smoothstep(uR0 - uFeather, uR0 + uFeather, r) * (1.0 - smoothstep(uR1 - uFeather, uR1 + uFeather, r));
  vec2 add = (uTangential * that + uRadial * rhat) * band;
  fragColor = vec4((texture(uTarget, vUv).xy + add) * mask(vUv), 0.0, 1.0);
}`

export const CURL = HEAD + `
uniform sampler2D uVelocity;
void main() {
  float L = texture(uVelocity, vL).y;
  float R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x;
  float B = texture(uVelocity, vB).x;
  fragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`

export const VORTICITY = HEAD + `
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float uCurlStrength;
uniform float uDt;
void main() {
  float L = texture(uCurl, vL).x;
  float R = texture(uCurl, vR).x;
  float T = texture(uCurl, vT).x;
  float B = texture(uCurl, vB).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 1e-4;
  force *= uCurlStrength * C;
  force.y *= -1.0;
  vec2 vel = texture(uVelocity, vUv).xy + force * uDt;
  fragColor = vec4(clamp(vel, -40.0, 40.0) * mask(vUv), 0.0, 1.0);
}`

// Semi-Lagrangian advection. The dye pass adds a background flow the velocity field never
// sees: a slow counter-clockwise spin that grows toward the rim, an inward draw at the rim and
// a gentle outward push around the centre, so blooms curl backwards and inwards as they age
// and nothing piles up under the digits.
export const ADVECT = HEAD + `
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform float uDt;
uniform float uDissipation;
uniform float uSubtract;
uniform float uFloor;
uniform float uSpin;
uniform float uDraw;
uniform float uPush;
vec2 background(vec2 uv) {
  vec2 p = uv - 0.5;
  float r = length(p);
  vec2 rhat = r > 1e-5 ? p / r : vec2(0.0);
  vec2 that = vec2(-rhat.y, rhat.x);
  float rn = r * 2.0;
  float spin = uSpin * smoothstep(0.2, 0.7, rn) * r;
  float push = uPush * (1.0 - smoothstep(0.2, 0.5, rn)) * smoothstep(0.0, 0.12, rn);
  float draw = uDraw * smoothstep(0.5, 0.85, rn);
  return that * spin + rhat * (push - draw);
}
void main() {
  vec2 vel = texture(uVelocity, vUv).xy + background(vUv);
  vec2 coord = vUv - uDt * vel;
  vec4 result = texture(uSource, coord);
  float decay = 1.0 + uDissipation * uDt;
  fragColor = max(result / decay - uSubtract * uDt, vec4(uFloor)) * mask(vUv);
}`

export const DIVERGENCE = HEAD + `
uniform sampler2D uVelocity;
void main() {
  float L = texture(uVelocity, vL).x;
  float R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y;
  float B = texture(uVelocity, vB).y;
  fragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`

export const PRESSURE = HEAD + `
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main() {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  float div = texture(uDivergence, vUv).x;
  fragColor = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
}`

export const GRADIENT = HEAD + `
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main() {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  vec2 vel = texture(uVelocity, vUv).xy - vec2(R - L, T - B);
  fragColor = vec4(vel * mask(vUv), 0.0, 1.0);
}`

// The water surface: a damped wave equation on (h, h_prev). The rim is a fixed edge, so
// ripples reflect off it the way they do in a bowl.
export const WAVE = HEAD + `
uniform sampler2D uWave;
uniform float uC2;
uniform float uDamp;
void main() {
  vec2 c = texture(uWave, vUv).xy;
  float L = texture(uWave, vL).x;
  float R = texture(uWave, vR).x;
  float T = texture(uWave, vT).x;
  float B = texture(uWave, vB).x;
  float lap = L + R + T + B - 4.0 * c.x;
  float edge = 1.0 - 0.14 * smoothstep(uRim - 0.09, uRim - 0.01, length(vUv - 0.5));
  float h = (2.0 * c.x - c.y + uC2 * lap) * uDamp * edge;
  fragColor = vec4(h * mask(vUv), c.x, 0.0, 1.0);
}`

export const SCALE = HEAD + `
uniform sampler2D uTexture;
uniform float uScale;
void main() { fragColor = texture(uTexture, vUv) * uScale; }`

export const DOWN = HEAD + `
uniform sampler2D uTexture;
uniform vec2 uOff;
void main() {
  float s = texture(uTexture, vUv + vec2(-uOff.x, -uOff.y)).r
          + texture(uTexture, vUv + vec2(uOff.x, -uOff.y)).r
          + texture(uTexture, vUv + vec2(-uOff.x, uOff.y)).r
          + texture(uTexture, vUv + vec2(uOff.x, uOff.y)).r;
  fragColor = vec4(s * 0.25, 0.0, 0.0, 1.0);
}`

export const BLUR = HEAD + `
uniform sampler2D uTexture;
uniform vec2 uDir;
void main() {
  float s = texture(uTexture, vUv).r * 0.2270270270;
  s += texture(uTexture, vUv + uDir * 1.3846153846).r * 0.3162162162;
  s += texture(uTexture, vUv - uDir * 1.3846153846).r * 0.3162162162;
  s += texture(uTexture, vUv + uDir * 3.2307692308).r * 0.0702702703;
  s += texture(uTexture, vUv - uDir * 3.2307692308).r * 0.0702702703;
  fragColor = vec4(s, 0.0, 0.0, 1.0);
}`

// Display. The height field (waves plus a little pressure) gives a normal; the dye is read
// through that surface with a small refraction; one light up and to the left of the viewer
// puts a glint on crests facing it. Light theme: Beer–Lambert transmission of the porcelain
// ground through ink whose absorption is the complement of the task colour, so dense ink goes
// toward black while thin ink stays a clean tint. Dark theme: the dye is additive light with a
// soft bloom. Everything is mixed in linear light and encoded at the end.
export const DISPLAY = HEAD + `
uniform sampler2D uDye;
uniform sampler2D uWave;
uniform sampler2D uPressure;
uniform sampler2D uBloom;
uniform vec2 uWaveTexel;
uniform vec3 uInk;
uniform vec3 uGround;
uniform float uDark;
uniform float uInkK;
uniform float uBloomAmt;
uniform float uRefract;
uniform float uSpec;
uniform float uDiffuse;
uniform float uNormal;
uniform float uWaveAmp;
uniform float uPressAmp;
uniform float uClear;
uniform float uSheen;
uniform float uAlive;
vec3 toLin(vec3 c) { return pow(c, vec3(2.2)); }
vec3 toSrgb(vec3 c) { return pow(max(c, vec3(0.0)), vec3(1.0 / 2.2)); }
float height(vec2 uv) { return texture(uWave, uv).x * uWaveAmp + texture(uPressure, uv).x * uPressAmp; }
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p);
  float m = mask(vUv);
  if (m <= 0.0) { fragColor = vec4(0.0); return; }

  vec2 d = uWaveTexel;
  float hx = height(vUv + vec2(d.x, 0.0)) - height(vUv - vec2(d.x, 0.0));
  float hy = height(vUv + vec2(0.0, d.y)) - height(vUv - vec2(0.0, d.y));
  vec3 n = normalize(vec3(-hx * uNormal, -hy * uNormal, 1.0));

  vec2 ruv = vUv + n.xy * uRefract;
  float dye = texture(uDye, ruv).r;
  float bloom = texture(uBloom, ruv).r;
  float clearing = mix(uClear, 1.0, smoothstep(0.17, 0.31, r));
  dye *= clearing * uAlive;
  bloom *= clearing * uAlive;

  vec3 L = normalize(vec3(-0.35, 0.75, 0.55));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, H), 0.0), 48.0);
  float diff = dot(n, L) - L.z;

  vec2 rhat = r > 1e-5 ? p / r : vec2(0.0);
  float wall = smoothstep(0.26, 0.5, r);
  float facing = dot(rhat, normalize(-L.xy));
  vec3 ground = toLin(uGround);
  ground *= 1.0 + wall * (facing * mix(0.05, 0.09, uDark) - mix(0.03, 0.01, uDark));
  vec2 sp = p - vec2(-0.13, 0.13);
  ground += uSheen * exp(-dot(sp, sp) / 0.05);

  vec3 ink = toLin(uInk);
  vec3 absorb = pow(max(vec3(1.0) - ink, vec3(0.0)), vec3(1.8));
  float density = dye + bloom * 0.35;
  vec3 lightCol = ground * exp(-uInkK * density * absorb);
  float glow = 1.0 - exp(-uInkK * dye);
  vec3 darkCol = ground + ink * glow + ink * bloom * uBloomAmt;
  vec3 col = mix(lightCol, darkCol, uDark);

  col *= 1.0 + diff * uDiffuse;
  col += spec * uSpec * mix(vec3(1.0), ink, 0.3 * uDark);

  fragColor = vec4(toSrgb(col) * m, m);
}`
