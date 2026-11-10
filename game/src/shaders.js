'use strict';
// GLSL for the pre-rendered renderer: baked sprites/tiles are composited into a G-buffer, lit in real time.
const RES_W = 1280, RES_H = 800;
const GLSL_COMMON = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
const vec3 CD = vec3(-0.61237244, -0.5, -0.61237244);
const vec3 CR = vec3(0.70710678, 0.0, -0.70710678);
const vec3 CU = vec3(-0.35355339, 0.8660254, -0.35355339);
const float PPM = 64.0, D0 = 30.0, DR = 60.0;
const vec2 RES = vec2(${RES_W}.0, ${RES_H}.0);
uniform vec3 uCam;    // camera target (world), pixel-snapped
vec2 toPix(vec3 P) { vec3 q = P - uCam; return vec2(RES.x * 0.5 + dot(q, CR) * PPM, RES.y * 0.5 - dot(q, CU) * PPM); }  // top-left origin
float tOf(vec3 P) { return D0 + dot(P - uCam, CD); }
vec3 fromPix(vec2 px, float t) { return uCam + CR * ((px.x - RES.x * 0.5) / PPM) + CU * ((RES.y * 0.5 - px.y) / PPM) - CD * D0 + CD * t; }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }
const float BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
float bayer(vec2 fc) { ivec2 b = ivec2(mod(fc, 4.0)); return (BAYER[b.y * 4 + b.x] + 0.5) / 16.0; }
`;

// ---------------------------------------------------------------- G-buffer: instanced baked sprites
const GB_VS = GLSL_COMMON + `
in vec2 aP;
in vec4 iPos;      // world anchor xyz, depth range (dr)
in vec4 iRect;     // atlas x, y, w, h
in vec4 iOff;      // crop offset x, y, anchor x, y (inside the bake cell)
in vec4 iMisc;     // flash, flags, alpha, scale
in vec4 iTint;     // rgb multiply, emissive boost
out vec2 vL; flat out vec4 vRect; flat out vec4 vPos; flat out vec4 vMisc; flat out vec4 vTint; flat out vec2 vOrigin;
void main() {
  vec2 s = floor(toPix(iPos.xyz) + 0.5);
  float sc = iMisc.w;
  vec2 tl = s + (iOff.xy - iOff.zw) * sc;
  vL = aP * iRect.zw * sc;
  vec2 p = tl + vL;
  vRect = iRect; vPos = iPos; vMisc = iMisc; vTint = iTint;
  vOrigin = tl - iOff.xy;      // screen position of the cell's top-left
  // the snapped anchor's world position (so depth matches the drawn pixels)
  gl_Position = vec4(p.x / RES.x * 2.0 - 1.0, 1.0 - p.y / RES.y * 2.0, 0.0, 1.0);
}`;
const GB_FS = GLSL_COMMON + `
uniform sampler2D tA, tB, tM;
uniform vec4 uCut;        // hero screen x, y (top-left px), radius px, hero depth t
uniform float uTime, uChar;   // uChar: character atlas (depth in the normal map, AO folded into albedo)
in vec2 vL; flat in vec4 vRect; flat in vec4 vPos; flat in vec4 vMisc; flat in vec4 vTint; flat in vec2 vOrigin;
layout(location = 0) out vec4 g0;   // albedo (sRGB) , ao
layout(location = 1) out vec4 g1;   // world normal (0..1), material byte
layout(location = 2) out vec4 g2;   // flash, highlight, emissive boost, 1
void main() {
  ivec2 lp = min(ivec2(vL / vMisc.w), ivec2(vRect.zw) - 1);
  ivec2 ap = ivec2(vRect.xy) + lp;
  vec4 m = texelFetch(tM, ap, 0);
  float cov = m.r * vMisc.z;
  // dithered coverage: soft edges become a fine screen-door pattern
  if (cov < bayer(gl_FragCoord.xy) * 0.9 + 0.05) discard;
  vec3 a = texelFetch(tA, ap, 0).rgb;
  vec3 b = texelFetch(tB, ap, 0).rgb;
  vec2 nv = b.xy * 2.0 - 1.0;
  vec3 N = normalize(CR * nv.x + CU * nv.y - CD * sqrt(max(0.0, 1.0 - dot(nv, nv))));
  float dz = (uChar > 0.5 && uChar < 1.5) ? b.z : (m.b * 255.0 * 256.0 + m.a * 255.0) / 65535.0;
  float ao = uChar > 0.5 ? 1.0 : b.z;
  float dr = (dz * 2.0 - 1.0) * vPos.w * vMisc.w;
  float t = tOf(vPos.xyz) + dr;
  // cutaway: walls and tall props in front of the hero open up around him
  if (vMisc.y > 0.5 && uCut.z > 0.0) {
    vec2 px = vec2(gl_FragCoord.x, RES.y - gl_FragCoord.y);
    vec2 d = (px - uCut.xy) / vec2(uCut.z * 0.75, uCut.z);
    float k = 1.0 - length(d);
    if (t < uCut.w - 0.35 && k > 0.0 && k * 3.0 > bayer(gl_FragCoord.xy)) {
      // keep the lowest course of stone so the room's outline stays readable
      vec3 P = fromPix(px, t);
      if (P.y > 0.45) discard;
    }
  }
  g0 = vec4(a * vTint.rgb, ao);
  g1 = vec4(N * 0.5 + 0.5, m.g);
  g2 = vec4(vMisc.x, uChar, vTint.a, 1.0);
  gl_FragDepth = clamp(t / DR, 0.0, 1.0);
}`;

// ---------------------------------------------------------------- deferred lighting
const NLIGHT = 24;
const LIGHT_FS = GLSL_COMMON + `
uniform sampler2D tG0, tG1, tG2, tDepth, tOcc, tDecal;
uniform vec4 uOccRect;          // world x0, z0, texels per metre, size
uniform vec4 uDecalRect;        // world x0, z0, size (m), unused
uniform vec4 uL[${NLIGHT}];      // xyz, radius
uniform vec4 uLc[${NLIGHT}];     // rgb * intensity, shadow flag
uniform int uNL;
uniform vec4 uCh[8];            // characters: x, z, radius, height
uniform vec3 uAmb;
uniform vec3 uSun;              // directional (moon) light colour; 0 = none
uniform vec3 uSunDir;           // towards the light
uniform float uTime, uEmis, uGrime, uWet, uV2;
uniform sampler2D tGrit;
uniform vec4 uFill; uniform vec3 uFillC;   // soft, shadowless fill from the hero's lantern that keeps figures readable
out vec4 oc;
float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vn3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h13(i), h13(i + vec3(1, 0, 0)), f.x), mix(h13(i + vec3(0, 1, 0)), h13(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h13(i + vec3(0, 0, 1)), h13(i + vec3(1, 0, 1)), f.x), mix(h13(i + vec3(0, 1, 1)), h13(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
float attn(float d, float r) { float x = clamp(1.0 - (d * d) / (r * r), 0.0, 1.0); return x * x / (1.0 + d * d * 0.35); }
float occH(vec2 xz) { vec2 uv = (xz - uOccRect.xy) * uOccRect.z / uOccRect.w; if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0; return texture(tOcc, uv).r * 12.0; }
// shadow from the level's occluder height grid: march towards the light
float gridShadow(vec3 P, vec3 L, float maxLen) {
  vec3 d = L - P; float len = min(length(d), maxLen); d = normalize(d);
  float s = 1.0, stepL = 0.16, t = 0.12;
  for (int i = 0; i < 40; i++) {
    if (t > len - 0.3) break;
    vec3 S = P + d * t;
    float h = occH(S.xz);
    s = min(s, clamp((S.y - h) * 6.0 + 1.0, 0.0, 1.0));
    if (s <= 0.0) break;
    t += stepL; stepL *= 1.04;
  }
  return s;
}
float charShadow(vec3 P, vec3 L) {
  float s = 1.0;
  for (int c = 0; c < 8; c++) {
    vec4 ch = uCh[c];
    if (ch.z <= 0.0) continue;
    vec3 a = vec3(ch.x, 0.15, ch.y), b = vec3(ch.x, ch.w, ch.y);
    if (length(P.xz - ch.xy) < ch.z * 1.1 && P.y > 0.12) continue;   // a character does not shadow itself
    vec3 d1 = L - P, d2 = b - a, r = P - a;
    float aa = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r), cc = dot(d1, r), bb = dot(d1, d2);
    float den = aa * e - bb * bb;
    float sP = den > 1e-6 ? clamp((bb * f - cc * e) / den, 0.0, 1.0) : 0.0;
    float tC = clamp((bb * sP + f) / e, 0.0, 1.0);
    sP = clamp((tC * bb - cc) / aa, 0.0, 1.0);
    if (sP < 0.01 || sP > 0.97) continue;
    vec3 q1 = P + d1 * sP, q2 = a + d2 * tC;
    float dist = length(q1 - q2);
    float pen = ch.z * (0.55 + 0.6 * length(q1 - P) / max(length(d1), 0.01));
    s *= mix(0.15, 1.0, smoothstep(ch.z * 0.35, pen + 0.12, dist));
  }
  return s;
}
void main() {
  ivec2 fp = ivec2(gl_FragCoord.xy);
  float z = texelFetch(tDepth, fp, 0).r;
  if (z >= 0.99999) { oc = vec4(0, 0, 0, 0); return; }
  vec4 g0 = texelFetch(tG0, fp, 0), g1 = texelFetch(tG1, fp, 0), g2 = texelFetch(tG2, fp, 0);
  vec2 px = vec2(gl_FragCoord.x, RES.y - gl_FragCoord.y);
  vec3 P = fromPix(px, z * DR);
  vec3 alb = pow(g0.rgb, vec3(2.2));
  vec3 N = normalize(g1.xyz * 2.0 - 1.0);
  float ao = g0.a, mat = g1.a;
  float gloss = mat < 0.5 ? mat * 2.0 : 0.0, em = mat > 0.5 ? (mat - 0.5) * 2.0 : 0.0;
  // runtime grime at scales the bake does not have
  if (uGrime > 0.0) {
    float n1 = vn3(P * 1.15) * 0.6 + vn3(P * 2.7 + 7.0) * 0.4, n2 = vn3(P * 6.0 + 3.0);
    alb *= mix(1.0, 0.72 + 0.4 * smoothstep(0.15, 0.75, n1), uGrime);
    alb = mix(alb, alb * vec3(0.86, 0.9, 0.76), smoothstep(0.55, 0.8, n2) * 0.5 * uGrime);
    gloss *= mix(1.0, 0.6 + 0.8 * smoothstep(0.3, 0.7, n2), uGrime);
  }
  float refl = 0.0, flatK = 0.0, isCh = step(0.5, g2.g) * step(0.001, uV2);
  if (uV2 > 0.0) {
    // creases and contours from the depth buffer: folds of cloth, gaps between ribs and stones go dark, and a figure
    // gets the dark line round it that the concept's painted sprites have
    float zc = z * DR;
    float z1 = texelFetch(tDepth, fp + ivec2(2, 0), 0).r * DR, z2 = texelFetch(tDepth, fp - ivec2(2, 0), 0).r * DR;
    float z3 = texelFetch(tDepth, fp + ivec2(0, 2), 0).r * DR, z4 = texelFetch(tDepth, fp - ivec2(0, 2), 0).r * DR;
    float lap = (min(z1, zc + 0.12) + min(z2, zc + 0.12) + min(z3, zc + 0.12) + min(z4, zc + 0.12)) * 0.25 - zc;   // < 0: neighbours nearer = a crease
    float crease = clamp(-lap * 22.0, 0.0, 1.0);
    float e1 = texelFetch(tDepth, fp + ivec2(1, 0), 0).r * DR, e2 = texelFetch(tDepth, fp - ivec2(1, 0), 0).r * DR, e3 = texelFetch(tDepth, fp + ivec2(0, 1), 0).r * DR, e4 = texelFetch(tDepth, fp - ivec2(0, 1), 0).r * DR;
    float edge = clamp((max(max(e1, e2), max(e3, e4)) - zc - 0.15) * 6.0, 0.0, 1.0);   // one pixel wide, or thin limbs turn black                                 // this pixel is on a silhouette
    if (isCh > 0.5) { crease = 0.0; edge = 0.0; }
    ao *= 1.0 - crease * mix(0.45, 0.55, isCh);
    alb *= 1.0 - edge * mix(0.0, 0.35, isCh) - crease * 0.1 * isCh;
    if (isCh > 0.5) {
      // figures: darker, grimier cloth and bone, so they read as shapes cut out of the firelight rather than pale dolls
      float lm = dot(alb, vec3(0.3, 0.55, 0.15));
      float sat = max(alb.r, max(alb.g, alb.b)) - min(alb.r, min(alb.g, alb.b));
      alb = mix(alb, lm * vec3(1.06, 0.97, 0.86), 0.35 * (1.0 - smoothstep(0.02, 0.12, sat)));   // greys go warm-dark, the reds and golds stay
      alb = pow(alb, vec3(1.1)) * 1.55;
    }
  }
  if (uV2 > 0.0 && g2.g < 0.5 && em <= 0.0) {
    // surface detail quilted from the concept plates, anchored in the world (triplanar): pits, chisel marks, cracks
    vec3 w = pow(abs(N), vec3(4.0)); w /= (w.x + w.y + w.z);
    vec3 Q = P * 0.72;
    vec3 tx = texture(tGrit, Q.zy).rgb, ty = texture(tGrit, Q.xz).rgb, tz = texture(tGrit, Q.xy).rgb;
    vec3 Q2 = P * 2.3 + 0.37;
    vec3 ux = texture(tGrit, Q2.zy).rgb, uy = texture(tGrit, Q2.xz).rgb, uz = texture(tGrit, Q2.xy).rgb;
    float hgt = (tx.b * w.x + ty.b * w.y + tz.b * w.z - 0.5) * 2.0 + (ux.b * w.x + uy.b * w.y + uz.b * w.z - 0.5);
    vec2 gxn = (tx.rg - 0.5) + (ux.rg - 0.5) * 0.6, gyn = (ty.rg - 0.5) + (uy.rg - 0.5) * 0.6, gzn = (tz.rg - 0.5) + (uz.rg - 0.5) * 0.6;
    vec3 bump = w.x * vec3(0.0, gxn.y, gxn.x) + w.y * vec3(gyn.x, 0.0, gyn.y) + w.z * vec3(gzn.x, gzn.y, 0.0);
    float flat_ = smoothstep(0.75, 0.95, N.y); flatK = flat_ * step(P.y, 0.2);                       // floors: gentler, or wet stone turns to foil
    N = normalize(N + vec3(0.0, 0.9, 0.0) * flat_ - bump * mix(1.5, 0.3, flat_) * uV2);
    alb *= clamp(1.0 + hgt * mix(0.42, 0.3, flat_) * uV2, 0.45, 1.5);
    ao *= clamp(1.0 + min(hgt, 0.0) * 0.5 * uV2, 0.5, 1.0);
    gloss *= clamp(1.0 + hgt * 0.5, 0.5, 1.5) * mix(1.0, 0.55, flat_);
    // standing water in the hollows of the floor: dark, flat, mirror-bright
    if (uWet > 0.0 && g1.y * 2.0 - 1.0 > 0.82 && P.y < 0.12) {
      float pn = vn3(vec3(P.xz * 0.42, 3.0)) * 0.65 + vn3(vec3(P.xz * 1.3, 7.0)) * 0.35 - hgt * 0.07 - (1.0 - ao) * 0.25;
      float pd = smoothstep(0.62 - 0.3 * uWet, 0.67 - 0.3 * uWet, pn);
      float damp = smoothstep(0.5 - 0.3 * uWet, 0.64 - 0.3 * uWet, pn);
      alb *= mix(1.0, 0.42, damp);
      gloss = mix(mix(gloss, max(gloss, 0.2), damp), 0.96, pd);
      N = normalize(mix(N, vec3(0.0, 1.0, 0.0), pd * 0.97));
      refl = pd * 0.6 + (damp - pd) * 0.08;
    }
  }
  // blood, wet and dust painted on the floor
  if (N.y > 0.6 && P.y < 0.5) {
    vec4 dc = texture(tDecal, (P.xz - uDecalRect.xy) / uDecalRect.z);
    alb = mix(alb, vec3(0.075, 0.004, 0.003), clamp(dc.r, 0.0, 1.0) * 0.93);
    alb = mix(alb, vec3(0.38, 0.35, 0.3), clamp(dc.b, 0.0, 1.0) * 0.55);
    gloss = max(gloss * (1.0 - dc.b), dc.g * 0.85);
    if (uV2 <= 0.0) gloss = max(gloss, uWet * smoothstep(0.55, 0.8, vn3(vec3(P.xz * 0.7, 1.0))) * 0.6);
  }
  vec3 V = -CD;
  if (uV2 > 0.0 && g2.g < 0.5 && P.y < 0.1) N = normalize(mix(N, vec3(0.0, 1.0, 0.0), 0.45 * smoothstep(0.3, 0.6, N.y)));   // raking light: the lips of the flagstones should not outshine their faces
  vec3 Ns = normalize(mix(N, vec3(0.0, 1.0, 0.0), 0.85 * flatK));   // highlights on the floor come from the slab, not from every chip in it
  vec3 col = alb * uAmb * (0.55 + (0.45 + 1.6 * uV2) * max(N.y, 0.0)) * ao;
  if (dot(uSun, uSun) > 0.0) {
    float ndl = max(dot(N, uSunDir), 0.0);
    if (ndl > 0.0) { float s = gridShadow(P + N * 0.04, P + uSunDir * 14.0, 14.0) * charShadow(P, P + uSunDir * 14.0); col += alb * ndl * uSun * s * (0.5 + 0.5 * ao); }
  }
  for (int i = 0; i < ${NLIGHT}; i++) {
    if (i >= uNL) break;
    vec3 Ld = uL[i].xyz - P; float d = length(Ld); if (d > uL[i].w) continue;
    Ld /= d;
    float ndl = dot(N, Ld);
    float wrap = clamp((ndl + 0.15) / 1.15, 0.0, 1.0);
    if (wrap <= 0.0) continue;
    float a = attn(d, uL[i].w);
    if (a < 0.002) continue;
    float s = 1.0;
    if (uLc[i].w > 0.5) s = gridShadow(P + N * 0.05, uL[i].xyz, 8.0);
    if (uLc[i].w > -0.5) s *= charShadow(P, uL[i].xyz);
    vec3 Hh = normalize(Ld + V);
    float spec = pow(max(dot(Ns, Hh), 0.0), 10.0 + gloss * (70.0 + 170.0 * uV2 * gloss)) * gloss * (2.2 + 3.0 * uV2 * gloss);
    col += (alb * wrap * (0.45 + 0.55 * ao) + spec * clamp(ndl, 0.0, 1.0)) * uLc[i].rgb * a * s;
    if (isCh > 0.5) col += uLc[i].rgb * a * s * pow(1.0 - max(dot(N, V), 0.0), 2.5) * clamp(ndl + 0.45, 0.0, 1.0) * (0.06 + alb * 2.2);   // firelight catching the edges
  }
  // contact darkening under characters
  for (int c = 0; c < 8; c++) {
    vec4 ch = uCh[c]; if (ch.z <= 0.0) continue;
    float dd = length(P.xz - ch.xy); col *= 1.0 - 0.5 * exp(-dd * dd / (ch.z * ch.z * 0.6)) * smoothstep(0.4, 0.0, P.y);
  }
  if (g2.g > 0.5 && uFill.w > 0.0) { float d = length(P - uFill.xyz); col += (1.0 + 0.2 * uV2) * alb * uFillC * clamp(1.0 - d / uFill.w, 0.0, 1.0) * (0.55 + 0.45 * max(dot(N, -CD), 0.0)); }
  col += alb * em * uEmis * 4.0 + vec3(1.0, 0.45, 0.12) * em * em * uEmis * 0.8;
  col += alb * g2.b;
  float fl = g2.r * g2.r; col += vec3(0.35, 0.25, 0.18) * fl;
  oc = vec4(col, refl);
}`;

// ---------------------------------------------------------------- forward FX (after lighting, depth tested)
const FLAME_VS = GLSL_COMMON + `
in vec2 aP;
uniform vec3 uW; uniform vec2 uSize;
out vec2 vUV; out float vT;
void main() {
  vUV = vec2(aP.x - 0.5, aP.y);
  vec2 b = toPix(uW);
  vec2 p = b + vec2(vUV.x * uSize.x, -aP.y * uSize.y + uSize.y * 0.12);
  vT = tOf(uW);
  gl_Position = vec4(p.x / RES.x * 2.0 - 1.0, 1.0 - p.y / RES.y * 2.0, vT / DR * 2.0 - 1.0 - 0.004, 1.0);
}`;
const FLAME_FS = GLSL_COMMON + `
uniform float uTime, uSeed, uGain, uMode; uniform vec3 uTintA, uTintB;
uniform vec4 uStyle;   // x tongues (1..4), y lean/sway, z speed, w width
uniform vec4 uStyle2;  // x blue root, y turbulence, z surge (flicker now, ~0.6..1.4), w tongue spread
in vec2 vUV; in float vT;
out vec4 oc;
float fbm2(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise2(p); p = p * 2.1 + 3.7; a *= 0.5; } return s; }
float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
void main() {
  vec2 uv = vUV; vec3 col;
  if (uMode > 0.5) {
    vec2 q = vec2(uv.x, (uv.y - 0.35) * 1.2);
    col = uTintA * exp(-dot(q, q) * 9.0) * 0.35;
    oc = vec4(col * uGain, 0.0); return;
  }
  float t = uTime * uStyle.z + uSeed * 10.0;
  // a draught that leans the whole fire now and then, plus its own restless sway
  float gust = sin(uTime * 0.37 + uSeed) * 0.6 + sin(uTime * 1.13 + uSeed * 2.3) * 0.4;
  float lean = uStyle.y * (gust * 0.7 + sin(t * 0.9) * 0.3);
  float y = uv.y;
  float TB = max(uStyle2.y, 0.3), SG = uStyle2.z > 0.0 ? uStyle2.z : 1.0;
  float n = fbm2(vec2(uv.x * 4.0 * TB + uSeed * 7.0, y * 3.0 * TB - t * 1.6));
  float n2 = fbm2(vec2(uv.x * 9.0 * TB - uSeed, y * 6.0 * TB - t * 2.7));
  float body = 0.0, core = 0.0;
  float NT = uStyle.x;
  for (int k = 0; k < 4; k++) {
    float fk = float(k); if (fk >= NT) break;
    float ks = uSeed * 3.1 + fk * 1.7;
    // each tongue has its own height that surges and sinks, and its own place in the bed of coals
    float hgt = (NT > 1.5 ? 0.62 : 0.86) + 0.3 * sin(t * (1.1 + fk * 0.43) + ks * 2.0) * (0.6 + 0.4 * sin(t * 0.31 + ks));
    if (k == 0) hgt = max(hgt, 0.8);
    hgt *= 0.72 + 0.28 * SG + 0.12 * (SG - 1.0) * fk;   // surges lift the tongues, gutters drop them
    float ox = ((fk - (NT - 1.0) * 0.5) * 0.18 * (uStyle2.w > 0.0 ? uStyle2.w : 1.0) + (h1(ks) - 0.5) * 0.12) * uStyle.w + sin(t * (0.5 + h1(ks + 1.0) * 0.6) + ks) * 0.05;
    float yy = y / max(hgt, 0.2);
    float x = uv.x - ox + (n - 0.5) * 0.35 * TB * yy + sin(t * 1.3 + yy * 5.0 + ks) * 0.045 * yy - lean * yy * yy * 0.5;
    float w = 0.44 * uStyle.w / sqrt(NT) * pow(max(1.0 - yy, 0.0), 0.85) * (0.55 + 0.45 * smoothstep(0.0, 0.25, yy));
    float d = abs(x) / max(w, 0.001);
    float b = smoothstep(1.0, 0.25, d + (n2 - 0.5) * 0.7) * smoothstep(1.0, 0.5, yy + (n - 0.5) * 0.45) * smoothstep(0.0, 0.07, y);
    body = max(body, b);
    core = max(core, smoothstep(0.5, 0.0, d) * smoothstep(0.65, 0.1, yy) * b);
  }
  // licks that tear off the top and rise away
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    float ph = fract(t * (0.55 + fk * 0.21) + h1(uSeed + fk));
    vec2 c = vec2(sin(t * 0.8 + fk * 2.0 + uSeed) * 0.12 * uStyle.w - lean * 0.3, 0.55 + ph * 0.45);
    vec2 q = (uv - c) / vec2(0.07 * uStyle.w, 0.11);
    body = max(body, exp(-dot(q, q)) * (1.0 - ph) * (0.6 + 0.4 * n2));
  }
  // colour: cooler red at the edges and tips, a white-gold heart, embers of variety from seed
  // (fork) a deeper, smokier fire: the heart takes the flame's own tint instead of white-gold, its heat varies per fire,
  // and the tips darken to soot-red, so torches no longer read as pale yellow cut-outs
  float heat = 0.25 + 0.35 * h1(uSeed * 5.7);
  vec3 tipC = uTintB * (0.55 + 0.35 * h1(uSeed * 3.3));
  vec3 heart = mix(uTintA, vec3(1.0, 0.66, 0.3), 0.45);
  col = mix(tipC, uTintA * 0.85, smoothstep(0.2, 0.95, body)) * body * (0.75 + 0.25 * body) + heart * core * heat * (0.75 + 0.3 * SG);
  // the blue root of a clean flame (candles, a few torches)
  float root = smoothstep(0.22, 0.0, y) * smoothstep(0.0, 0.03, y) * smoothstep(0.75, 0.1, abs(uv.x) / max(0.12 * uStyle.w, 0.01)) * uStyle2.x;
  col = mix(col, vec3(0.25, 0.45, 1.0) * body * 0.9, clamp(root, 0.0, 0.85));
  oc = vec4(col * uGain, 0.0);
}`;
const PART_VS = GLSL_COMMON + `
in vec4 aP;     // xyz world, w size (px)
in vec4 aC;     // rgb, a opacity (alpha mode)
out vec4 vC;
void main() {
  vec2 p = toPix(aP.xyz);
  gl_Position = vec4(p.x / RES.x * 2.0 - 1.0, 1.0 - p.y / RES.y * 2.0, tOf(aP.xyz) / DR * 2.0 - 1.0, 1.0);
  gl_PointSize = aP.w; vC = aC;
}`;
const PART_FS = `#version 300 es
precision highp float;
uniform float uAlphaMode;
in vec4 vC; out vec4 oc;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  if (uAlphaMode > 0.5) { float g = exp(-dot(q, q) * 9.0) * vC.a; oc = vec4(vC.rgb * g, g); }
  else { float g = smoothstep(0.5, 0.1, length(q)); oc = vec4(vC.rgb * g, 0.0); }
}`;
const TRAIL_VS = GLSL_COMMON + `
in vec4 aP;     // xyz world, w alpha
in vec4 aC;     // x: 0 hilt .. 1 tip; yzw colour
out float vA; out float vV; out vec3 vCol;
void main() {
  vec2 p = toPix(aP.xyz);
  gl_Position = vec4(p.x / RES.x * 2.0 - 1.0, 1.0 - p.y / RES.y * 2.0, tOf(aP.xyz) / DR * 2.0 - 1.0, 1.0);
  vA = aP.w; vV = aC.x; vCol = aC.yzw;
}`;
const TRAIL_FS = `#version 300 es
precision highp float;
in float vA; in float vV; in vec3 vCol; out vec4 oc;
void main() {
  float edge = smoothstep(0.3, 0.95, vV) * (0.35 + 0.65 * vV * vV);
  oc = vec4(vCol * vA * edge, 0.0);
}`;

const QUAD_VS = `#version 300 es
in vec2 aP; out vec2 vUV;
void main() { vUV = aP; gl_Position = vec4(aP * 2.0 - 1.0, 0.0, 1.0); }`;
const DECAL_VS = `#version 300 es
in vec2 aP; uniform vec4 uRect; out vec2 vQ;
void main() { vQ = aP * 2.0 - 1.0; vec2 p = uRect.xy + (aP - 0.5) * uRect.zw; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const DECAL_FS = `#version 300 es
precision highp float;
uniform vec4 uCol; uniform float uSeed, uShape; in vec2 vQ; out vec4 oc;
float hh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hh(i), hh(i + vec2(1, 0)), f.x), mix(hh(i + vec2(0, 1)), hh(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec2 q = vQ;
  float n = vn(q * 3.0 + uSeed * 17.0) * 0.6 + vn(q * 7.0 + uSeed * 5.0) * 0.4;
  float a;
  if (uShape > 1.5) {          // rune circle
    float r = length(q); float ring = smoothstep(0.04, 0.0, abs(r - 0.82)) + smoothstep(0.03, 0.0, abs(r - 0.68));
    float ang = atan(q.y, q.x); float star = smoothstep(0.03, 0.0, abs(r * cos(mod(ang, 1.2566) - 0.628) - 0.55)) * step(r, 0.68);
    a = clamp(ring + star, 0.0, 1.0) * (0.6 + 0.4 * n);
  } else if (uShape > 0.5) {   // smear
    vec2 s = vec2(q.x * 0.45, q.y * 1.6); a = smoothstep(0.75, 0.35, length(s) + (n - 0.5) * 0.8);
  } else {
    float d = length(q) + (n - 0.5) * 0.7;
    float blob = smoothstep(0.75, 0.45, d);
    vec2 c = floor(q * 5.0 + uSeed * 3.0); vec2 f = fract(q * 5.0 + uSeed * 3.0) - 0.5;
    float drop = step(0.82, hh(c + uSeed)) * smoothstep(0.25, 0.1, length(f)) * smoothstep(1.0, 0.5, length(q));
    a = max(blob, drop);
  }
  oc = uCol * a;
}`;

const ATMO_FS = GLSL_COMMON + `
uniform sampler2D tS, tDepth;
uniform vec4 uL[${NLIGHT}]; uniform vec4 uLc[${NLIGHT}]; uniform int uNL;
uniform float uTime, uFog, uMist, uFogTop, uV2;
uniform vec3 uFogCol;
out vec4 oc;
float attnA(float d, float r) { float x = clamp(1.0 - (d * d) / (r * r), 0.0, 1.0); return x * x / (1.0 + d * d * 0.35); }
void main() {
  ivec2 fp = ivec2(gl_FragCoord.xy);
  vec4 c4 = texelFetch(tS, fp, 0);
  vec3 c = c4.rgb;
  float dz = texelFetch(tDepth, fp, 0).r;
  vec2 px = vec2(gl_FragCoord.x, RES.y - gl_FragCoord.y);
  if (uV2 > 0.0 && c4.a > 0.01 && dz < 0.9999) {
    // the mirrored view ray climbs straight up the screen (0.866 * PPM px per metre) while its depth grows 0.5 per metre:
    // walk it until something in the scene stands in front of it
    vec3 Pw = fromPix(px, dz * DR);
    float rip = (vnoise2(Pw.xz * 5.0 + uTime * vec2(0.25, 0.1)) - 0.5) + (vnoise2(Pw.xz * 13.0 - uTime * 0.3) - 0.5) * 0.5;
    float t0 = dz * DR, sstep = 0.035, sr = 0.03; vec3 hit = vec3(0); float got = 0.0;
    for (int i = 0; i < 44; i++) {
      sr += sstep; sstep *= 1.07;
      vec2 q = gl_FragCoord.xy + vec2(rip * (2.0 + sr * 3.0), sr * 0.8660254 * PPM);
      if (q.y >= RES.y || q.x < 0.0 || q.x >= RES.x) break;
      float ds = texelFetch(tDepth, ivec2(q), 0).r * DR;
      float tr = t0 + sr * 0.5;
      if (ds < tr && tr - ds < 0.6 + sr * 0.5) { hit = texelFetch(tS, ivec2(q), 0).rgb; got = 1.0 - smoothstep(2.6, 4.2, sr); break; }
    }
    c = c * (1.0 - c4.a * 0.35) + hit * got * c4.a * 0.9;
  }
  vec3 O = fromPix(px, 0.0);
  float ts = dz > 0.9999 ? DR : dz * DR;
  // haze slab between the floor and uFogTop
  float s0 = (uFogTop - O.y) / CD.y, s1 = min((0.0 - O.y) / CD.y, ts);
  s0 = max(s0, 0.0);
  vec3 fog = vec3(0);
  if (s1 > s0) {
    for (int i = 0; i < ${NLIGHT}; i++) {
      if (i >= uNL) break;
      vec3 OL = O - uL[i].xyz; float b = dot(OL, CD), cc = dot(OL, OL);
      float h = sqrt(max(cc - b * b, 0.0) + 0.3);
      fog += uLc[i].rgb * (atan((s1 + b) / h) - atan((s0 + b) / h)) / h;
    }
    vec3 M = O + CD * (0.5 * (s0 + s1));
    fog *= uFog * (0.45 + 1.1 * vnoise2(M.xz * 0.35 + uTime * vec2(0.03, 0.012)));
    fog += uFogCol * (s1 - s0) * 0.02;
  }
  if (dz < 0.9999 && uMist > 0.0) {
    vec3 P = O + CD * ts;
    if (P.y < 1.0) {
      vec2 w = P.xz;
      float n = vnoise2(w * 0.55 + uTime * vec2(0.05, 0.022)) * 0.6 + vnoise2(w * 1.6 - uTime * vec2(0.03, 0.07)) * 0.4;
      float m = smoothstep(1.0, 0.0, P.y) * smoothstep(0.3, 0.85, n) * uMist;
      vec3 lit = uFogCol * 0.6 + vec3(0.02, 0.022, 0.03);
      vec3 Q = P + vec3(0.0, 0.25, 0.0);
      for (int i = 0; i < ${NLIGHT}; i++) { if (i >= uNL) break; lit += uLc[i].rgb * attnA(distance(Q, uL[i].xyz), uL[i].w); }
      c = c * (1.0 - m * 0.35) + lit * m * 0.05;
    }
  }
  oc = vec4(c + fog, 1.0);
}`;
const BRIGHT_FS = `#version 300 es
precision highp float;
uniform sampler2D tS; uniform vec2 uTexel; in vec2 vUV; out vec4 oc;
void main() {
  vec3 c = vec3(0);
  for (int y = 0; y < 2; y++) for (int x = 0; x < 2; x++) c += texture(tS, vUV + (vec2(x, y) - 0.5) * uTexel).rgb;
  c *= 0.25;
  float l = max(max(c.r, c.g), c.b);
  oc = vec4(c * max(l - 0.8, 0.0) / max(l, 1e-4), 1.0);
}`;
const BLUR_FS = `#version 300 es
precision highp float;
uniform sampler2D tS; uniform vec2 uDir; in vec2 vUV; out vec4 oc;
void main() {
  const float w[5] = float[5](0.227, 0.1945, 0.1216, 0.054, 0.0162);
  vec3 c = texture(tS, vUV).rgb * w[0];
  for (int i = 1; i < 5; i++) { c += texture(tS, vUV + uDir * float(i)).rgb * w[i]; c += texture(tS, vUV - uDir * float(i)).rgb * w[i]; }
  oc = vec4(c, 1.0);
}`;
const POST_FS = `#version 300 es
precision highp float;
uniform sampler2D tS, tB1, tB2; uniform float uTime, uExpo, uFade, uSat, uGrain, uDither, uVig, uBloom, uSharp, uV2; uniform vec2 uRes, uShake; uniform vec3 uTint, uLift, uGain; uniform vec4 uHaze[4];
in vec2 vUV; out vec4 oc;
float h(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  vec2 uv = vUV + uShake;
  for (int i = 0; i < 4; i++) {
    if (uHaze[i].w <= 0.0) continue;
    vec2 d = (uv - uHaze[i].xy) * vec2(1.6, 1.0);
    float k = smoothstep(uHaze[i].z, 0.0, length(d)) * step(uHaze[i].y - 0.01, uv.y);
    uv += (vec2(h(floor(uv * 260.0 + vec2(0.0, uTime * 40.0))), h(floor(uv * 250.0 - vec2(uTime * 30.0, 0.0)))) - 0.5) * 0.0018 * k * uHaze[i].w;
  }
  vec2 cd = (uv - 0.5); float ca = dot(cd, cd) * 0.006;
  vec3 c = vec3(texture(tS, uv + cd * ca).r, texture(tS, uv).g, texture(tS, uv - cd * ca).b);
  vec2 tx = 1.0 / vec2(${RES_W}.0, ${RES_H}.0);
  vec3 nb = (texture(tS, uv + vec2(tx.x, 0)).rgb + texture(tS, uv - vec2(tx.x, 0)).rgb + texture(tS, uv + vec2(0, tx.y)).rgb + texture(tS, uv - vec2(0, tx.y)).rgb) * 0.25;
  c = max(c + (c - nb) * uSharp, 0.0);
  vec3 bl = texture(tB1, uv).rgb * 0.7 + texture(tB2, uv).rgb * 0.9;
  c += bl * uBloom;
  c *= uExpo;
  c = aces(c);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSat);
  c = max(c - 0.006, 0.0) * 1.006;
  c *= mix(mix(vec3(0.9, 1.0, 0.94), vec3(1.0), uV2), vec3(1.0), smoothstep(0.0, 0.25, l));
  c = mix(c, c * uGain, smoothstep(0.2, 0.85, l));
  c += uLift * (1.0 - l);
  c = pow(max(c, 0.0), vec3(1.0 / 2.2));
  c = smoothstep(0.0, 1.0, c) * 0.25 + c * 0.75;
  if (uV2 > 0.0) {
    // the concept's palette: cold slate in the shadows, ember in the lights, blacks that stay black
    float lv = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(c, c * vec3(0.84, 0.97, 1.08), (1.0 - smoothstep(0.0, 0.3, lv)) * 0.7 * uV2);
    c = mix(c, c * vec3(1.08, 0.98, 0.86), smoothstep(0.35, 0.9, lv) * 0.6 * uV2);
    c = mix(c, smoothstep(0.02, 0.98, c), 0.35 * uV2);
  }
  vec2 q = vUV - 0.5; q.x *= 1.25;
  c *= 1.0 - smoothstep(0.28, 0.82, length(q) * (1.0 + 0.05 * sin(atan(q.y, q.x) * 3.0 + 1.0))) * uVig;
  c *= uTint;
  float lm = dot(c, vec3(0.299, 0.587, 0.114));
  vec2 gp = floor(vUV * uRes / 1.6);
  float g = (h(gp + fract(uTime * 7.13) * 400.0) + h(gp * 1.7 + fract(uTime * 3.7) * 300.0) - 1.0);
  c += g * uGrain * (0.35 + lm * (1.0 - lm) * 2.6);
  if (uDither > 0.0) {
    ivec2 bp = ivec2(mod(gl_FragCoord.xy, 4.0));
    const float BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
    float bd = BAYER[bp.y * 4 + bp.x] / 16.0 - 0.5;
    c = floor(c * uDither + 0.5 + bd) / uDither;
  }
  oc = vec4(c * uFade, 1.0);
}`;
