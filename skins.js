// ================== SHADER SKINS (Based on user's reference code) ==================
// Single WebGL buffer with u_mode switching for 8 different skins

const SKIN_VERT = `
precision mediump float;
attribute vec3 aPosition;
attribute vec2 aTexCoord;
uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
varying vec2 vUv;

void main() {
  vUv = aTexCoord;
  gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
}
`;

const SKIN_FRAG = `
precision mediump float;

varying vec2 vUv;

uniform vec2  u_resolution;
uniform float u_time;
uniform float u_speed;
uniform float u_scale;
uniform float u_intensity;
uniform float u_glow;
uniform float u_hue;
uniform float u_detail;
uniform float u_p1;
uniform float u_p2;
uniform float u_p3;
uniform int   u_mode;

// ---------- utils ----------
float hash21(vec2 p){
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f*f*(3.0 - 2.0*f);
  return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
}

float fbm(vec2 p){
  float f = 0.0;
  float a = 0.55;
  for (int i=0; i<4; i++){
    f += a * noise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return f;
}

vec3 hsv2rgb(vec3 c){
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float diskMask(vec2 uv){
  vec2 q = uv - 0.5;
  float r = length(q) * 2.0;
  float aa = 0.015;
  float inside = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
  return clamp(inside, 0.0, 1.0);
}

vec3 bloomFast(vec3 col, float r0, float glow){
  float edge = smoothstep(1.02, 0.70, r0);
  float halo = smoothstep(1.45, 0.95, r0);
  col += col * (glow * 0.18) * edge;
  col += col * (glow * 0.08) * halo;
  return col;
}

void main(){
  float t = u_time * u_speed;

  float mask = diskMask(vUv);
  if (mask <= 0.0) { gl_FragColor = vec4(0.0); return; }

  vec2 c = vUv - 0.5;
  float r0 = length(c) * 2.0;
  float ang = atan(c.y, c.x);

  float detailScale = mix(0.8, 2.6, u_detail);
  vec2 p = c * u_scale * detailScale;

  vec3 col = vec3(0.0);
  float hueBase = u_hue;

  // ================== MODES ==================
  if (u_mode == 1) {
    // Rainbow Stripes
    float stripes = sin(ang * mix(6.0, 18.0, u_p1) + t * mix(1.0, 8.0, u_p2) + r0 * 10.0);
    float tex = 0.68 + 0.30*stripes + (hash21(p*6.0 + t) - 0.5) * (0.08 + 0.18*u_p3);
    float hue = fract(hueBase + t * 0.08 + ang * (0.08 + 0.08*u_p3) + r0 * 0.12);
    col = hsv2rgb(vec3(hue, 1.0, 1.0)) * tex;

  } else if (u_mode == 2) {
    // Plasma Vortex
    float twist = mix(0.6, 2.4, u_p1);
    float swirl = ang + (1.2 - r0) * (1.6 + twist) + t * mix(0.4, 1.4, u_p2);
    float pl = sin(swirl * 5.0) + sin((p.x + t)*2.4) + sin((p.y - t)*2.4);
    pl *= 0.33;
    float n = fbm(p*0.9 + vec2(t*0.35, -t*0.25));
    float v = 0.50 + 0.40*pl + 0.30*(n-0.5);
    float sat = mix(0.55, 1.0, u_p3);
    float hue = fract(hueBase + 0.62 + 0.22*pl + t*0.05);
    col = hsv2rgb(vec3(hue, sat, 1.0)) * v;

  } else if (u_mode == 3) {
    // Electric Cells
    float cellScale = mix(0.8, 2.6, u_p1);
    vec2 q = p * cellScale;
    vec2 iq = floor(q);
    vec2 fq = fract(q);
    float best = 10.0;
    for (int y=-1; y<=1; y++){
      for (int x=-1; x<=1; x++){
        vec2 o = vec2(float(x), float(y));
        vec2 h = vec2(hash21(iq + o), hash21(iq + o + 7.13));
        vec2 pos = o + 0.2 + 0.6*sin(t*mix(0.4, 1.6, u_p2) + 6.2831*h);
        vec2 d = fq - pos;
        best = min(best, dot(d,d));
      }
    }
    float cell = exp(-best*mix(4.5, 10.0, u_p2));
    float zaps = 0.5 + 0.5*sin(ang*mix(6.0, 14.0, u_p3) + t*6.0 + fbm(p*2.5 + t)*3.0);
    float v = 0.18 + 1.45 * cell * zaps;
    float hue = fract(hueBase + 0.55 + 0.18*sin(t*0.7));
    col = hsv2rgb(vec3(hue, 0.9, 1.0)) * v;

  } else if (u_mode == 4) {
    // Starfield Glitter
    float dens = mix(2.5, 9.0, u_p1);
    float n = fbm(p*mix(1.2, 3.0, u_p2) + vec2(t*0.6, -t*0.4));
    float sparks = step(0.86 - 0.10*u_p3, fract(n*dens + hash21(p*11.0)));
    float arc = 0.5 + 0.5*sin(ang*mix(8.0, 22.0, u_p2) + t*mix(1.0, 6.0, u_p1));
    float v = 0.35 + 0.55*arc + mix(0.6, 1.6, u_p3)*sparks;
    float hue = fract(hueBase + 0.10 + t*0.08 + arc*0.10);
    col = hsv2rgb(vec3(hue, 0.9, 1.0)) * v;

  } else if (u_mode == 5) {
    // Water Surface
    float waveAmp = mix(0.20, 0.90, u_p1);
    float caustPow = mix(0.9, 2.4, u_p2);
    float sparkle = mix(0.0, 1.0, u_p3);
    float w1 = sin(p.x*1.4 + t*1.2) * 0.35 * waveAmp;
    float w2 = sin(p.y*1.2 - t*1.4) * 0.35 * waveAmp;
    float rip = sin((p.x+p.y)*1.2 + t*0.9) * 0.25 * waveAmp;
    float n = fbm(p*1.6 + vec2(t*0.25, t*0.18));
    float ca = sin((p.x + w1)*3.2 + t*1.8) + sin((p.y + w2)*3.0 - t*1.6);
    ca = 0.5 + 0.5 * ca;
    ca = pow(ca, caustPow);
    float glint = step(0.92 - 0.12*sparkle, fract(n*8.0 + hash21(p*18.0 + t)));
    float v = 0.32 + 0.55*ca + 0.26*(n-0.5) + rip*0.25 + glint*(0.6*sparkle);
    vec3 base = vec3(0.04, 0.50, 0.95);
    vec3 hi   = vec3(0.80, 0.98, 1.00);
    col = mix(base, hi, clamp(v, 0.0, 1.0));

  } else if (u_mode == 6) {
    // Sun Surface
    float gran = mix(0.8, 2.4, u_p1);
    float filament = mix(0.2, 1.2, u_p2);
    float flare = mix(0.0, 1.0, u_p3);
    float g = fbm(p*gran + vec2(t*0.10, -t*0.08));
    float fil = 0.5 + 0.5*sin(ang*8.0 + t*(0.8+1.2*filament) + fbm(p*(1.8+filament) + t)*4.0);
    float v = 0.20 + 1.05*g + 0.70*fil*(1.0 - r0);
    float rim = smoothstep(0.65, 1.05, r0);
    float bursts = step(0.88 - 0.15*flare, fract((g+fil)*6.0 + hash21(p*10.0)));
    v += rim * bursts * (0.6*flare);
    v = clamp(v, 0.0, 2.0);
    vec3 hot1 = vec3(1.00, 0.25, 0.05);
    vec3 hot2 = vec3(1.00, 0.78, 0.15);
    vec3 hot3 = vec3(1.00, 0.98, 0.85);
    col = mix(hot1, hot2, clamp(v*0.65, 0.0, 1.0));
    col = mix(col, hot3, clamp((v-0.9)*0.9, 0.0, 1.0));

  } else if (u_mode == 7) {
    // Smoke
    float turb = mix(0.4, 2.2, u_p1);
    float softness = mix(0.4, 1.6, u_p2);
    float tint = mix(0.0, 1.0, u_p3);
    vec2 flow = vec2(fbm(p*0.8 + t*0.15), fbm(p*0.8 - t*0.12));
    vec2 pp = p + (flow - 0.5) * (1.0 + turb);
    float n = fbm(pp*(0.9+0.6*softness) + vec2(t*0.22, -t*0.18));
    float wisps = fbm(pp*(1.8+1.2*softness) + vec2(-t*0.28, t*0.25));
    float v = 0.20 + 0.95*n + 0.60*(wisps-0.5);
    v *= (1.10 - 0.60*r0);
    v = clamp(v, 0.0, 1.0);
    vec3 cold = mix(vec3(0.06,0.07,0.08), vec3(0.88,0.92,0.98), v);
    vec3 warm = mix(vec3(0.10,0.07,0.05), vec3(0.96,0.90,0.82), v);
    col = mix(cold, warm, tint);

  } else {
    // Granular Ground
    float duneFreq = mix(0.6, 2.0, u_p1);
    float gritAmt  = mix(0.0, 1.4, u_p2);
    float colorMix = mix(0.0, 1.0, u_p3);
    float dune = 0.5 + 0.5*sin(p.x*1.2*duneFreq + t*0.45) * sin(p.y*1.0*duneFreq - t*0.35);
    float gr = noise(p*6.0 + vec2(t*0.3, -t*0.25));
    float grit = step(0.72 - 0.18*gritAmt, fract(gr*7.0 + hash21(p*11.0)));
    float v = 0.28 + 0.88*dune + 0.18*(gr-0.5) + gritAmt*0.45*grit;
    v = clamp(v, 0.0, 1.6);
    vec3 soil1 = vec3(0.18, 0.13, 0.09);
    vec3 soil2 = vec3(0.52, 0.42, 0.28);
    vec3 soil3 = vec3(0.86, 0.82, 0.72);
    vec3 sand = mix(soil1, soil2, clamp(v, 0.0, 1.0));
    sand = mix(sand, soil3, clamp((v-0.95)*1.1, 0.0, 1.0));
    vec3 mineral = hsv2rgb(vec3(fract(hueBase + 0.10), 0.25, 1.0));
    col = mix(sand, sand * mineral, colorMix);
  }

  // Vignette + intensity
  float vign = smoothstep(1.15, 0.10, r0);
  col *= (0.70 + 0.55*vign) * u_intensity;

  // Bloom
  col = bloomFast(col, r0, u_glow);

  // Hue tint (not on rainbow/glitter)
  if (u_mode != 1 && u_mode != 4) {
    vec3 tint = hsv2rgb(vec3(fract(hueBase), 0.35, 1.0));
    col = mix(col, col * tint, 0.18);
  }

  gl_FragColor = vec4(col, mask);
}
`;

// Default parameters per mode
const MODE_PARAMS = {
  1: { p1: 0.70, p2: 0.70, p3: 0.30, glow: 1.1 }, // Rainbow
  2: { p1: 0.60, p2: 0.55, p3: 0.85, glow: 1.1 }, // Plasma
  3: { p1: 0.55, p2: 0.70, p3: 0.75, glow: 1.1 }, // Electric
  4: { p1: 0.60, p2: 0.60, p3: 0.70, glow: 1.1 }, // Starfield
  5: { p1: 0.65, p2: 0.55, p3: 0.35, glow: 1.1 }, // Water
  6: { p1: 0.70, p2: 0.65, p3: 0.35, glow: 1.4 }, // Sun
  7: { p1: 0.65, p2: 0.55, p3: 0.10, glow: 1.0 }, // Smoke
  8: { p1: 0.55, p2: 0.55, p3: 0.25, glow: 1.1 }  // Ground
};

class SkinManager {
  constructor() {
    this.size = 128;
    this.buffer = null;
    this.shader = null;
    this.currentMode = 1;
    this.ready = false;

    this.init();
  }

  init() {
    try {
      // Create single WebGL buffer
      this.buffer = createGraphics(this.size, this.size, WEBGL);
      this.buffer.pixelDensity(1);
      this.buffer.noStroke();

      // Create shader
      this.shader = this.buffer.createShader(SKIN_VERT, SKIN_FRAG);
      this.ready = true;
      console.log("SkinManager initialized successfully");
    } catch (e) {
      console.error("SkinManager init failed:", e);
      this.ready = false;
    }
  }

  update(modeId) {
    if (!this.ready || !this.buffer || !this.shader) return;

    modeId = constrain(modeId, 1, 8);
    this.currentMode = modeId;

    let t = millis() / 1000;
    let params = MODE_PARAMS[modeId] || MODE_PARAMS[1];

    this.buffer.clear();
    this.buffer.shader(this.shader);

    this.shader.setUniform("u_resolution", [this.size, this.size]);
    this.shader.setUniform("u_time", t);
    this.shader.setUniform("u_speed", 1.0);
    this.shader.setUniform("u_scale", 3.0);
    this.shader.setUniform("u_intensity", 1.1);
    this.shader.setUniform("u_glow", params.glow);
    this.shader.setUniform("u_hue", 0.0);
    this.shader.setUniform("u_detail", 0.55);
    this.shader.setUniform("u_p1", params.p1);
    this.shader.setUniform("u_p2", params.p2);
    this.shader.setUniform("u_p3", params.p3);
    this.shader.setUniform("u_mode", modeId);

    this.buffer.plane(this.size, this.size);
  }

  getTexture() {
    return this.buffer;
  }
}
