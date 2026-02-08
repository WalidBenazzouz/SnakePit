class Background {
    constructor(options = {}) {
        this.mode = options.mode ?? 2;

        this.opacity = options.opacity ?? 0.55;
        this.intensity = options.intensity ?? 1.1;
        this.speed = options.speed ?? 1.0;

        this.gridScale = options.gridScale ?? 22.0;

        // Base grid scale to reference for zooming
        this.baseGridScale = this.gridScale;

        this.lineWidth = options.lineWidth ?? 0.55; // fin
        this.gridContrast = options.gridContrast ?? 1.2;

        // default pointer attractor (mouse)
        this.pointerEnabled = true;
        this._pointer = { x: 0, y: 0 };

        this.offset = { x: 0, y: 0 }; // Camera offset

        // multi attractors (vehicle + bullets, etc.)
        this.maxAttractors = 12;
        this._attractors = []; // array of {x,y,radius,strength,waveStrength,waveFreq}

        this.bgColor = options.bgColor ?? [8, 12, 24];
        this.lineColor = options.lineColor ?? [90, 220, 255];

        this._pg = null;
        this._sh = null;

        this._initGraphics();
    }

    setMode(m) { this.mode = this._clampInt(m, 1, 8); }
    setOpacity(a) { this.opacity = this._clamp(a, 0, 1); }
    setIntensity(v) { this.intensity = this._clamp(v, 0, 4); }
    setSpeed(v) { this.speed = this._clamp(v, 0, 6); }

    setGrid(scalePx, lineWidthPx, contrast = this.gridContrast) {
        if (scalePx !== undefined) this.gridScale = Math.max(4, scalePx);
        if (lineWidthPx !== undefined) this.lineWidth = Math.max(0.15, lineWidthPx);
        if (contrast !== undefined) this.gridContrast = this._clamp(contrast, 0.2, 6);
    }

    setColors(bgRGB, lineRGB) {
        if (bgRGB) this.bgColor = bgRGB;
        if (lineRGB) this.lineColor = lineRGB;
    }

    setPointer(x, y) {
        this._pointer.x = x; this._pointer.y = y;
    }

    setOffset(x, y) {
        this.offset.x = x;
        this.offset.y = y;
    }

    setAttractors(list) {
        // list: array of attractor objects
        this._attractors = (list || []).slice(0, this.maxAttractors);
    }

    resize(w = width, h = height) {
        if (this._pg) this._pg.resizeCanvas(w, h);
    }

    draw() {
        if (!this._pg || !this._sh) return;

        // pointer = souris screen coords
        if (this.pointerEnabled) this.setPointer(mouseX, mouseY);

        const t = millis() / 1000;

        // pack attractors into uniform arrays (fixed size MAX)
        const MAX = this.maxAttractors;
        const pos = new Array(MAX * 2).fill(-9999);
        const params = new Array(MAX * 4).fill(0);
        const count = Math.min(MAX, this._attractors.length);

        for (let i = 0; i < count; i++) {
            const a = this._attractors[i];
            pos[i * 2 + 0] = a.x;
            pos[i * 2 + 1] = a.y;
            params[i * 4 + 0] = a.radius ?? 240;
            params[i * 4 + 1] = a.strength ?? 1.0;
            params[i * 4 + 2] = a.waveStrength ?? 0.45;
            params[i * 4 + 3] = a.waveFreq ?? 10.0;
        }

        this._pg.push();
        this._pg.clear();
        this._pg.noStroke();
        this._pg.shader(this._sh);

        this._sh.setUniform("u_resolution", [this._pg.width, this._pg.height]);
        this._sh.setUniform("u_time", t);
        this._sh.setUniform("u_speed", this.speed);
        this._sh.setUniform("u_mode", this.mode);

        this._sh.setUniform("u_gridScale", this.gridScale);
        this._sh.setUniform("u_lineWidth", this.lineWidth);
        this._sh.setUniform("u_contrast", this.gridContrast);

        // pointer as an extra attractor (always index 0 in shader)
        this._sh.setUniform("u_pointer", [this._pointer.x, this._pointer.y]);

        // Camera offset
        this._sh.setUniform("u_offset", [this.offset.x, this.offset.y]);

        this._sh.setUniform("u_attrCount", count);
        this._sh.setUniform("u_attrPos", pos);
        this._sh.setUniform("u_attrParams", params);

        this._sh.setUniform("u_bg", this.bgColor.map(v => v / 255));
        this._sh.setUniform("u_line", this.lineColor.map(v => v / 255));
        this._sh.setUniform("u_intensity", this.intensity);

        this._pg.plane(this._pg.width, this._pg.height);

        this._pg.resetShader();
        this._pg.pop();

        push();
        // Ensure we are in screen space (reset matrix if needed, though usually caller handles this)
        resetMatrix();
        tint(255, Math.floor(this.opacity * 255));
        image(this._pg, 0, 0, width, height);
        noTint();
        pop();
    }

    _initGraphics() {
        this._pg = createGraphics(width, height, WEBGL);
        this._pg.pixelDensity(1);
        try { this._pg.setAttributes('webgl2', false); } catch (e) { }

        const gl = this._pg.drawingContext;
        try {
            gl.disable(gl.DEPTH_TEST);
            gl.enable(gl.BLEND);
        } catch (e) { }

        this._sh = this._pg.createShader(this._vertSrc(), this._fragSrc());
    }

    _vertSrc() {
        return `
    precision mediump float;
    attribute vec3 aPosition;
    attribute vec2 aTexCoord;
    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;
    varying vec2 vUv;
    void main(){
      vUv = aTexCoord;
      gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
    }`;
    }

    _fragSrc() {
        // IMPORTANT: WebGL1 requires constant loop bounds -> MAX_ATTR fixed
        const MAX_ATTR = 12;
        return `
    precision mediump float;
    varying vec2 vUv;

    uniform vec2  u_resolution;
    uniform float u_time;
    uniform float u_speed;
    uniform int   u_mode;

    uniform float u_gridScale;
    uniform float u_lineWidth;
    uniform float u_contrast;

    uniform vec2  u_pointer;
    uniform vec2  u_offset;

    uniform int   u_attrCount;
    uniform float u_attrPos[${MAX_ATTR * 2}];     // x,y interleaved
    uniform float u_attrParams[${MAX_ATTR * 4}];  // radius,strength,waveStrength,waveFreq

    uniform vec3  u_bg;
    uniform vec3  u_line;
    uniform float u_intensity;

    float hash21(vec2 p){
      p = fract(p*vec2(123.34,345.45));
      p += dot(p,p+34.345);
      return fract(p.x*p.y);
    }
    float noise(vec2 p){
      vec2 i=floor(p), f=fract(p);
      float a=hash21(i), b=hash21(i+vec2(1,0));
      float c=hash21(i+vec2(0,1)), d=hash21(i+vec2(1,1));
      vec2 u=f*f*(3.0-2.0*f);
      return mix(a,b,u.x)+(c-a)*u.y*(1.0-u.x)+(d-b)*u.x*u.y;
    }

    float gridDist(vec2 p, float cell){
      vec2 g = abs(fract(p / cell) - 0.5);
      return min(g.x, g.y) * cell; // px distance to nearest line
    }
    float gridLine(vec2 p, float cell, float lw){
      float d = gridDist(p, cell);
      float aa = 0.9;
      return clamp(1.0 - smoothstep(lw, lw + aa, d), 0.0, 1.0);
    }
    float multiGrid(vec2 p, float cell, float lw, float mixAmt){
      float a = gridLine(p, cell, lw);
      float b = gridLine(p, cell*2.0, lw*1.15);
      return mix(a, max(a,b), mixAmt);
    }

    // warp contribution from an attractor
    vec2 warpFrom(vec2 px, vec2 center, float radius, float strength, float waveStrength, float waveFreq, float t){
      vec2 toM = px - center;
      float dist = length(toM);
      float R = max(1.0, radius);
      float falloff = exp(-(dist*dist)/(R*R));
      vec2 dir = (dist > 0.001) ? (toM / dist) : vec2(0.0);

      float warpAmp = strength * falloff;
      float wave = sin((dist / R) * waveFreq * 6.28318 - t*3.2);
      float waveAmp = waveStrength * falloff * wave;

      // pull
      return dir * (-warpAmp * 20.0 + waveAmp * 12.0);
    }

    void main(){
      float t = u_time * u_speed;
      vec2 px = vUv * u_resolution;

      // base drift
      vec2 drift = vec2(sin(t*0.28)*2.2, cos(t*0.24)*2.2);

      // pointer attractor (always)
      vec2 warp = warpFrom(px, u_pointer, 320.0, 1.05, 0.45, 10.0, t);

      // additional attractors (vehicle + bullets)
      for (int i=0; i<${MAX_ATTR}; i++){
        if (i >= u_attrCount) break;

        vec2 c;
        c.x = u_attrPos[i*2 + 0];
        c.y = u_attrPos[i*2 + 1];

        float radius = u_attrParams[i*4 + 0];
        float strength = u_attrParams[i*4 + 1];
        float waveStrength = u_attrParams[i*4 + 2];
        float waveFreq = u_attrParams[i*4 + 3];

        warp += warpFrom(px, c, radius, strength, waveStrength, waveFreq, t);
      }

      // Add camera offset to position for grid generation to simulate scrolling
      // We subtract warp/drift from px before adding offset? 
      // No, offset acts like movement of the underlying plane.
      // px is the screen coordinate.
      // The "world" coordinate p should be (px + offset).
      // Wrap effects should be relative to screen or world?
      // Usually deformation is screen-space (lens effect), but here we want snakes to deform the grid.
      // Since snakes move in world space, and we pass their screen coords, the warp is screen space.
      // So warp calculates displacement.
      // Final p = (px + warp + drift) + offset?
      
      vec2 p = px + warp + drift - u_offset; 

      // 8 grid styles
      float cell = u_gridScale;
      float lw = u_lineWidth;

      float lines = 0.0;
      float glow  = 0.0;

      if (u_mode == 1) {
        lines = gridLine(p, cell, lw);
        glow = lines;
      } else if (u_mode == 2) {
        lines = multiGrid(p, cell, lw, 0.85);
        glow = lines;
      } else if (u_mode == 3) {
        float k = 1.0 + (px.y / u_resolution.y) * 0.9;
        vec2 pp = vec2(p.x, p.y * k);
        lines = multiGrid(pp, cell, lw, 0.9);
        glow = lines * (0.75 + 0.6*(px.y/u_resolution.y));
      } else if (u_mode == 4) {
        float a = 0.52;
        mat2 Rm = mat2(cos(a), -sin(a), sin(a), cos(a));
        vec2 aa = Rm * (p - 0.5*u_resolution) + 0.5*u_resolution;
        vec2 bb = mat2(cos(-a), -sin(-a), sin(-a), cos(-a)) * (p - 0.5*u_resolution) + 0.5*u_resolution;
        float g1 = gridLine(aa, cell, lw);
        float g2 = gridLine(bb, cell, lw);
        lines = max(g1, g2);
        glow = lines;
      } else if (u_mode == 5) {
        vec2 j = vec2(noise(p*0.02 + t*1.2), noise(p*0.02 - t*1.0)) - 0.5;
        vec2 pp = p + j * 2.0;
        lines = multiGrid(pp, cell, lw, 0.8);
        glow = lines;
      } else if (u_mode == 6) {
        float pulse = 0.65 + 0.35*sin(t*2.0 + (px.x+px.y)*0.002);
        float lwp = lw * mix(0.75, 1.25, pulse);
        lines = multiGrid(p, cell, lwp, 0.85);
        glow = lines * pulse;
      } else if (u_mode == 7) {
        float scan = 0.55 + 0.45*sin(px.y*0.035 - t*5.0);
        float g = multiGrid(p, cell, lw, 0.85);
        lines = g * (0.75 + 0.35*scan);
        glow = g;
      } else {
        float g = multiGrid(p, cell, lw, 0.9);
        vec2 f = fract(p / cell);
        float ix = abs(f.x - 0.5);
        float iy = abs(f.y - 0.5);
        float inter = 1.0 - smoothstep(0.02, 0.11, min(ix, iy));
        lines = max(g, inter * 0.95);
        glow = g + inter * 1.25;
      }

      lines = pow(clamp(lines, 0.0, 1.0), 1.0 / max(0.001, u_contrast));

      // halo cheap: utilise distance aux lignes
      float d = gridDist(p, cell);
      float halo = 1.0 - smoothstep(lw*3.2, lw*3.2 + 1.2, d);
      halo *= 0.20;

      // coloration
      vec3 col = u_bg;
      col = mix(col, u_line, lines);
      col += u_line * (halo + glow * 0.07);

      // vignette légère
      vec2 vv = vUv - 0.5;
      float vign = 1.0 - 0.45 * dot(vv, vv);
      col *= vign;

      col *= u_intensity;
      gl_FragColor = vec4(col, 1.0);
    }`;
    }

    _clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
    _clampInt(x, a, b) { return Math.max(a, Math.min(b, Math.floor(x))); }
}
