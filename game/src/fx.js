'use strict';
// Particles, fires, floor decals and impact effects for the sprite renderer.
const FX = { decals: [], fires: [], freeze: 0, flashL: null };
class Pool {
  constructor(max, alpha) { this.max = max; this.alpha = alpha; this.p = []; }
  // o: {x,y,z,vx,vy,vz,c,c2,life,s,s2,a,g,drag,bounce,blood,shard,smoke}
  emit(o) { if (this.p.length >= this.max) return; const life = o.life || 1; this.p.push(Object.assign({ vx: 0, vy: 0, vz: 0, g: 0, drag: 0.3, s: 0.1, a: 1, c: [1, 1, 1] }, o, { life, max: life, s2: o.s2 ?? o.s ?? 0.1 })); }
  clear() { this.p.length = 0; }
  update(dt) {
    for (let i = this.p.length - 1; i >= 0; i--) {
      const p = this.p[i]; p.life -= dt; if (p.life <= 0) { this.p.splice(i, 1); continue; }
      p.vx -= p.vx * p.drag * dt; p.vz -= p.vz * p.drag * dt; p.vy -= (p.g + p.vy * p.drag) * dt;
      if (p.smoke) { p.vx += Math.sin(G.time * 0.7 + i) * 0.05 * dt; p.vz += 0.05 * dt; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.02 && p.g > 0) {
        if (p.blood) { if (Math.random() < 0.6) GFX.decal(p.x, p.z, 0.02 + Math.random() * 0.05, [0.9, 0.8, 0, 0]); this.p.splice(i, 1); continue; }
        p.y = 0.02; p.vy = -p.vy * (p.bounce || 0.2); p.vx *= 0.5; p.vz *= 0.5; if (p.bounce) p.bounce *= 0.5;
      }
    }
  }
}
FX.soft = new Pool(700, true);
FX.add = new Pool(1400, false);
function initFX() { }
function fxClearLevel() { FX.soft.clear(); FX.add.clear(); FX.decals = []; FX.fires = []; }
const PPMf = 64;
function fxBlood(x, y, z, n = 14, dir = null, col = [0.32, 0.02, 0.015]) {
  for (let i = 0; i < n; i++) {
    const sp = 1.2 + Math.random() * 2.6, a = (Math.random() - 0.5) * (dir ? 1.6 : TAU);
    let cx = dir ? dir[0] : 1, cz = dir ? dir[1] : 0;
    const vx = (cx * Math.cos(a) - cz * Math.sin(a)) * sp, vz = (cz * Math.cos(a) + cx * Math.sin(a)) * sp;
    FX.soft.emit({ x, y: y + (Math.random() - 0.3) * 0.3, z, vx, vy: 0.5 + Math.random() * 2.2, vz, life: 1.6, s: 0.035 + Math.random() * 0.04, c: col, g: 9, drag: 0.3, blood: true, a: 1, solid: true });
  }
  fxDecal('blood', x + (dir ? dir[0] * 0.25 : 0), z + (dir ? dir[1] * 0.25 : 0), 0.3 + n * 0.02);
}
function fxBoneChips(x, y, z, n = 10) {
  for (let i = 0; i < n; i++) { const a = Math.random() * TAU, sp = 1 + Math.random() * 2.5; FX.soft.emit({ x, y, z, vx: Math.cos(a) * sp, vy: 0.8 + Math.random() * 2.4, vz: Math.sin(a) * sp, life: 2 + Math.random() * 2, s: 0.03 + Math.random() * 0.03, c: [0.62, 0.56, 0.45], g: 9, drag: 0.2, bounce: 0.35, shard: true, solid: true }); }
  for (let i = 0; i < 5; i++) FX.soft.emit({ x, y, z, vx: (Math.random() - 0.5) * 1.2, vy: Math.random() * 0.6, vz: (Math.random() - 0.5) * 1.2, life: 1.2 + Math.random(), s: 0.22, s2: 0.5, c: [0.42, 0.39, 0.34], a: 0.18, drag: 1.8 });
  GFX.decal(x, z, 0.2 + n * 0.01, [0, 0, 0.55, 0]);
}
function fxSparks(x, y, z, n = 12, col = [1, 0.8, 0.4]) {
  for (let i = 0; i < n; i++) { const a = Math.random() * TAU, sp = 2.5 + Math.random() * 3.5; FX.add.emit({ x, y, z, vx: Math.cos(a) * sp, vy: Math.random() * 3 - 0.5, vz: Math.sin(a) * sp, life: 0.18 + Math.random() * 0.3, s: 0.03, c: [col[0] * 3, col[1] * 2.2, col[2] * 1.5], g: 9, drag: 2.5 }); }
}
function fxBurst(x, y, z, col, n = 30, sp = 3, size = 0.15, life = 0.6) {
  for (let i = 0; i < n; i++) { const a = Math.random() * TAU, b = Math.random() * Math.PI - Math.PI / 2, v = sp * (0.4 + Math.random() * 0.6); FX.add.emit({ x, y, z, vx: Math.cos(a) * Math.cos(b) * v, vy: Math.sin(b) * v + 0.5, vz: Math.sin(a) * Math.cos(b) * v, life: life * (0.6 + Math.random() * 0.6), s: size * 0.5, s2: size * 0.15, c: [col[0] * 2, col[1] * 2, col[2] * 2], drag: 2 }); }
}
function fxRing(x, z, col, r = 3, n = 60, y = 0.3) {
  for (let i = 0; i < n; i++) { const a = i / n * TAU; FX.add.emit({ x: x + Math.cos(a) * 0.3, y, z: z + Math.sin(a) * 0.3, vx: Math.cos(a) * r * 2.2, vy: 0.3, vz: Math.sin(a) * r * 2.2, life: 0.45, s: 0.12, s2: 0.04, c: [col[0] * 2.5, col[1] * 2.5, col[2] * 2.5], drag: 3.5 }); }
}
function fxTrail(x, y, z, col, s = 0.18, life = 0.35) { FX.add.emit({ x, y, z, vx: 0, vy: 0.2, vz: 0, life, s, s2: s * 0.3, c: [col[0] * 2, col[1] * 2, col[2] * 2], drag: 1 }); }
function fxSmoke(x, y, z, n = 6, col = [0.12, 0.11, 0.1]) { for (let i = 0; i < n; i++) FX.soft.emit({ x: x + (Math.random() - 0.5) * 0.4, y, z: z + (Math.random() - 0.5) * 0.4, vx: (Math.random() - 0.5) * 0.5, vy: 0.4 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 0.5, life: 1.5 + Math.random(), s: 0.25, s2: 0.7, c: col, a: 0.35, drag: 0.8, smoke: true }); }
function fxDust(cx, cz, dt) { }
// floor marks: blood, smear, rune (written into the renderer's decal map; kept per level so they survive level swaps)
function fxDecal(type, x, z, s = 1, rot = 0, parent, persist) {
  const rec = { type, x, z, s, rot, parent: null };
  rec.remove = () => { };
  if (type === 'rune') { rec.light = null; rec.temp = !persist; }
  paintDecal(rec);
  if (persist !== false) FX.decals.push(rec);
  // compatibility: old code removes warning decals via .parent.remove()
  rec.parent = { remove: () => { } };
  return rec;
}
function paintDecal(d) {
  if (d.type === 'blood') GFX.decal(d.x, d.z, d.s * 0.5, [0.85, 0.7, 0, 0]);
  else if (d.type === 'smear') GFX.decal(d.x, d.z, d.s * 0.5, [0.55, 0.3, 0, 0], 1);
  else if (d.type === 'rune') GFX.decal(d.x, d.z, d.s * 0.5, [0.6, 0, 0.0, 0], 2);
  else if (d.type === 'dust') GFX.decal(d.x, d.z, d.s * 0.5, [0, 0, 0.5, 0]);
}
function repaintDecals() { for (const d of FX.decals) paintDecal(d); }
// impact: sparks, a flash of light, a short freeze at the moment the blade connects
function fxImpact(x, y, z, big) {
  fxSparks(x, y, z, big ? 16 : 9, [1, 0.62, 0.32]);
  if (!FX.flashL) FX.flashL = addLight({ x, y, z, color: 0xffa060, intensity: 0, radius: 4, flicker: 0, priority: 4, noShadow: true });
  FX.flashL.x = x; FX.flashL.y = y; FX.flashL.z = z; FX.flashL.intensity = big ? 6 : 4; R3.lightSources.add(FX.flashL);
  FX.freeze = Math.max(FX.freeze, big ? 0.075 : 0.05);
}
// level fires: braziers, torches, candles (flames drawn by the renderer, embers + smoke here)
function fxFire(f, dt) {
  const big = (f.size || 1) > 1.1;
  if (f.smoke) { if (Math.random() < dt * 5) FX.soft.emit({ x: f.x + (Math.random() - 0.5) * 0.2, y: f.y, z: f.z + (Math.random() - 0.5) * 0.2, vx: 0.05, vy: 0.5 + Math.random() * 0.3, vz: 0.12, life: 4 + Math.random() * 2, s: 0.25, s2: 1.0, c: [0.06, 0.055, 0.05], a: 0.3, drag: 0.3, smoke: true }); return; }
  if ((f.size || 1) < 0.5) return;
  if (!f.look) f.look = flameLook(f);
  const sp = f.look.sparks || 1;
  if (Math.random() < dt * 0.05 * sp) for (let i = 0, n = 1 + (Math.random() * 2) | 0; i < n; i++) FX.add.emit({ x: f.x, y: f.y + 0.15, z: f.z, vx: (Math.random() - 0.5) * 1.0, vy: 0.9 + Math.random() * 1.2, vz: (Math.random() - 0.5) * 1.0, life: 0.5 + Math.random() * 0.7, s: 0.014, c: [1.6, 0.55, 0.12], c2: [0.45, 0.04, 0.0], drag: 0.6, g: 1.2 });
  if (Math.random() < dt * (big ? 2.2 : 0.4) * sp) FX.add.emit({ x: f.x + (Math.random() - 0.5) * (big ? 0.3 : 0.06), y: f.y + 0.1, z: f.z + (Math.random() - 0.5) * (big ? 0.3 : 0.06), vx: (Math.random() - 0.5) * 0.3, vy: 0.5 + Math.random() * 0.7, vz: (Math.random() - 0.5) * 0.3, life: 1.0 + Math.random() * 1.2, s: 0.016, c: [1.4, 0.45, 0.1], c2: [0.35, 0.03, 0.0], drag: 0.25, g: -0.2 });
  if (big && Math.random() < dt * 6) FX.soft.emit({ x: f.x + (Math.random() - 0.5) * 0.25, y: f.y + 0.4, z: f.z + (Math.random() - 0.5) * 0.25, vx: (Math.random() - 0.5) * 0.15, vy: 0.45 + Math.random() * 0.35, vz: (Math.random() - 0.5) * 0.15, life: 3.5 + Math.random() * 2.5, s: 0.28, s2: 0.6, c: [0.05, 0.045, 0.04], a: 0.32, drag: 0.4, g: -0.05, smoke: true });
}
function updateFX(dt) {
  FX.soft.update(dt); FX.add.update(dt);
  for (const f of FX.fires) if (GFX.onScreen(f.x, f.y, f.z, 200)) fxFire(f, dt);
  if (FX.flashL) { FX.flashL.intensity = Math.max(0, FX.flashL.intensity - dt * 50); if (FX.flashL.intensity <= 0) R3.lightSources.delete(FX.flashL); }
}
// every fire gets its own temper: candles burn thin and steady, torches lean and lick, braziers roar in several tongues
function flameLook(f) {
  const L = flameLook0(f), seed = L.seed, r = k => { const v = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
  const sullen = r(19) < 0.25;
  L.g *= sullen ? 0.62 : 0.8 + r(20) * 0.12; L.glow *= sullen ? 0.55 : 0.8; if (sullen) { L.h *= 0.78; L.tintA = [L.tintA[0] * 0.9, L.tintA[1] * 0.7, L.tintA[2] * 0.5]; L.sparks = (L.sparks || 1) * 0.3; }
  L.speed *= 0.8 + r(21) * 0.5;
  return L;
}
function flameLook0(f) {
  // each fire draws a temperament from its position: different heights, widths, leans, speeds, colours and flicker
  const sz = f.size || 1, seed = f.x * 3.17 + f.z * 1.31 + (f.y || 0), r = k => { const v = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
  const hue = r(1);                                 // 0 blood-red .. 1 amber (fork: deeper and wider than before)
  const A = [1.0, 0.18 + hue * 0.32, 0.02 + hue * 0.07], B = [0.4 + r(2) * 0.3, 0.025 + r(3) * 0.06, 0.004];
  const sullen = r(19) < 0.25;                      // a quarter of the fires burn low and smoky
  const kind = r(12);
  if (sz < 0.5) {
    // candles: steady and tall, restless and short, or guttering low
    const t = kind < 0.4 ? 'steady' : kind < 0.8 ? 'restless' : 'gutter';
    const hm = t === 'gutter' ? 0.65 : t === 'steady' ? 1.25 : 0.9;
    return { w: (3.5 + r(4) * 3) * (t === 'gutter' ? 1.15 : 1), h: (8 + r(5) * 6) * hm, g: 1.2 + r(6) * 0.4, glow: 0.22 + r(13) * 0.15, seed,
      style: [1, t === 'steady' ? 0.03 : 0.08 + r(7) * 0.12, t === 'steady' ? 1.1 + r(8) * 0.5 : 2.0 + r(8) * 1.2, 0.85 + r(14) * 0.2],
      style2: [0.35 + r(15) * 0.4, t === 'restless' ? 1.3 : 0.9, 1, 1], fl: t === 'gutter' ? 1.9 : t === 'steady' ? 0.6 : 1.3,
      tintA: [1.0, 0.5 + hue * 0.25, 0.14 + hue * 0.08], tintB: B, speed: 0.7 + r(9) * 0.7 };
  }
  if (sz > 1.1) {
    // braziers: three to four tongues, some roaring, some low and sullen
    const roar = kind > 0.45;
    return { w: (20 + r(4) * 9) * sz, h: (26 + r(5) * 16) * sz * (roar ? 1.15 : 0.85), g: 1.2 + r(6) * 0.35, glow: 0.6 + r(13) * 0.2, seed,
      style: [3 + (r(7) > 0.5 ? 1 : 0), 0.08 + r(8) * 0.16, roar ? 2.6 + r(9) * 1.4 : 1.7 + r(9) * 0.8, 1.0 + r(10) * 0.35],
      style2: [0, roar ? 1.25 + r(15) * 0.3 : 0.85, 1, 0.8 + r(16) * 0.6], fl: roar ? 1.4 : 1.0, tintA: A, tintB: B, speed: 0.8 + r(11) * 0.5, sparks: roar ? 1.6 : 0.8 };
  }
  // torches: one to three tongues, leaning in their own draught
  const NT = kind < 0.3 ? 1 : kind < 0.8 ? 2 : 3;
  return { w: (14 + r(4) * 9) * sz * (NT === 1 ? 0.8 : 1), h: (26 + r(5) * 18) * sz, g: 1.25 + r(6) * 0.35, glow: 0.6 + r(13) * 0.2, seed,
    style: [NT, 0.15 + r(8) * 0.35, 2.0 + r(9) * 2.0, 0.85 + r(10) * 0.35],
    style2: [r(15) < 0.25 ? 0.4 : 0, 0.9 + r(16) * 0.6, 1, 0.8 + r(14) * 0.5], fl: 1.0 + r(17) * 0.7, tintA: A, tintB: B, speed: 0.8 + r(11) * 0.6, sparks: 0.5 + r(18) };
}
function flameLookOld(f) {
  const sz = f.size || 1, seed = f.x * 3.17 + f.z * 1.31 + (f.y || 0), r = k => { const v = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
  const warm = r(1), A = [1.0, 0.36 + warm * 0.14, 0.06 + warm * 0.05], B = [0.55 + r(2) * 0.15, 0.06 + r(3) * 0.05, 0.01];
  if (sz < 0.5) return { w: 4 + r(4) * 2.5, h: 8 + r(5) * 5, g: 1.5 + r(6) * 0.3, glow: 0.3, seed, style: [1, 0.05 + r(7) * 0.08, 1.6 + r(8) * 0.9, 0.9], tintA: [1.0, 0.55 + warm * 0.15, 0.18], tintB: B, speed: 0.8 + r(9) * 0.4 };
  if (sz > 1.1) return { w: (22 + r(4) * 6) * sz, h: (30 + r(5) * 10) * sz, g: 1.6 + r(6) * 0.3, glow: 0.85, seed, style: [3 + (r(7) > 0.55 ? 1 : 0), 0.12 + r(8) * 0.1, 2.2 + r(9) * 1.0, 1.15 + r(10) * 0.2], tintA: A, tintB: B, speed: 0.9 + r(11) * 0.3 };
  return { w: (17 + r(4) * 6) * sz, h: (32 + r(5) * 12) * sz, g: 1.6 + r(6) * 0.3, glow: 0.8, seed, style: [2, 0.22 + r(8) * 0.18, 2.4 + r(9) * 1.2, 1.0], tintA: A, tintB: B, speed: 0.9 + r(11) * 0.4 };
}
// hand the particles to the renderer
FX.preRender = function () {
  const S = GFX.S;
  S.puffs = FX.soft.p.map(p => { const k = 1 - p.life / p.max, s = (p.s + (p.s2 - p.s) * k) * PPMf * (p.solid ? 1 : 2); return { x: p.x, y: p.y, z: p.z, size: Math.max(1.5, s), col: p.c, a: p.a, life: p.life, max: p.max, smoke: p.smoke, shard: p.shard || p.blood, glow: 0 }; });
  S.parts = FX.add.p.map(p => { const k = 1 - p.life / p.max, s = (p.s + (p.s2 - p.s) * k) * PPMf * 2; const c = p.c2 ? [p.c[0] + (p.c2[0] - p.c[0]) * k, p.c[1] + (p.c2[1] - p.c[1]) * k, p.c[2] + (p.c2[2] - p.c[2]) * k] : p.c; return { x: p.x, y: p.y, z: p.z, size: Math.max(1.5, s), col: c, life: p.life, max: p.max }; });
  // flames + heat haze near the camera
  S.flames.length = 0; S.haze = [];
  for (const f of FX.fires) {
    if (f.smoke) continue;
    const sz = f.size || 1;
    if (!f.look) f.look = flameLook(f);
    const L = f.look;
    S.flames.push({ x: f.x, y: f.y, z: f.z, w: L.w, h: L.h, g: L.g, glow: L.glow, seed: L.seed, style: L.style, style2: L.style2, fl: L.fl, tintA: f.tintA || L.tintA, tintB: f.tintB || L.tintB, speed: L.speed });
    if (sz > 1.1 && S.haze.length < 4 && GFX.onScreen(f.x, f.y, f.z, 0)) { const [x, y] = GFX.toScreen(f.x, f.y + 0.3, f.z); S.haze.push([x / GFX.W, 1 - y / GFX.H, 0.07, 1]); }
  }
  for (const g of FX.extraFlames || []) S.flames.push(g);
  if (FX.extraFlames) FX.extraFlames.length = Math.min(FX.extraFlames.length, 1);
};
