'use strict';
// Bridge between the game logic and the sprite renderer: a tiny scene graph, light registry,
// sprite-set loading, animated sprite visuals and the per-frame draw.

// ---------------------------------------------------------------- minimal scene graph
class P3 { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } }
class Node {
  constructor() { this.position = new P3(); this.rotation = { x: 0, y: 0, z: 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; } }; this.visible = true; this.parent = null; this.children = []; this.userData = {}; }
  add(c) { if (c.parent) c.parent.remove(c); c.parent = this; this.children.push(c); return this; }
  remove(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parent = null; }
  traverse(f) { f(this); for (const c of this.children.slice()) c.traverse(f); }
}
const R3 = { camShake: 0, scene: new Node(), lightSources: new Set(), camTarget: new P3(), zoom: 1 };

// ---------------------------------------------------------------- lights (game-side records → renderer lights)
function addLight(src) { R3.lightSources.add(src); return src; }
function removeLight(src) { R3.lightSources.delete(src); }
function clearLights() { R3.lightSources.clear(); }
const hexRGB = h => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
let _lseed = 0;
function syncLights() {
  const out = GFX.S.lights; out.length = 0;
  for (const l of R3.lightSources) {
    if (!l._c || l._hex !== l.color) { l._hex = l.color; l._c = typeof l.color === 'number' ? hexRGB(l.color) : (l.color || [1, 0.6, 0.3]); l._seed = l._seed ?? (_lseed++ * 1.37); }
    if (!(l.intensity > 0)) continue;
    out.push({ p: [l.x, l.y, l.z], c: l._c, i: l.intensity, r: l.radius || 5, f: (l.flicker || 0) * 3, seed: l._seed, pri: l.priority || 0, shadow: l.noShadow ? false : undefined, noChar: l.noChar });
  }
}

// ---------------------------------------------------------------- projection helpers for the DOM UI
function viewRect() {
  const cv = document.getElementById('gl'); const r = cv.getBoundingClientRect();
  const s = Math.min(r.width / GFX.W, r.height / GFX.H);
  return { x: r.left + (r.width - GFX.W * s) / 2, y: r.top + (r.height - GFX.H * s) / 2, s };
}
function worldToScreen(x, y, z, out = {}) {
  const [sx, sy] = GFX.toScreen(x, y, z), v = viewRect();
  out.x = v.x + sx * v.s; out.y = v.y + sy * v.s; out.vis = sx > -50 && sx < GFX.W + 50 && sy > -50 && sy < GFX.H + 50;
  return out;
}
function screenToGame(cx, cy) { const v = viewRect(); return [(cx - v.x) / v.s, (cy - v.y) / v.s]; }
function screenToGround(cx, cy, out = new P3()) {
  const [gx, gy] = screenToGame(cx, cy);
  const [x, z] = GFX.screenToFloor(gx, gy, 0);
  return out.set(x, 0, z);
}

// ---------------------------------------------------------------- sprite sets
const ASSET_BASE = 'assets/';
const SETS = {};          // name -> GFX sheet
window.META = window.META || {};
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('could not load ' + src)); document.head.appendChild(s); }); }
const _loading = {};
function loadSet(name) {
  if (SETS[name]) return Promise.resolve(SETS[name]);
  if (_loading[name]) return _loading[name];
  return (_loading[name] = (async () => {
    if (!META[name]) await loadScript(ASSET_BASE + name + '.js');
    const sh = await GFX.loadSheet(name, ASSET_BASE, META[name]);
    SETS[name] = sh; return sh;
  })());
}
async function loadSets(names, progress) {
  let n = 0;
  await Promise.all(names.map(async nm => { await loadSet(nm); n++; if (progress) progress(n / names.length, nm); }));
}
function unloadSetsExcept(keep) { for (const nm of Object.keys(SETS)) if (!keep.includes(nm)) { GFX.freeSheet(nm); delete SETS[nm]; delete _loading[nm]; } }

// which sprite set (and tint / scale) shows each monster
const MONSTER_SPRITES = {
  risen: { set: 'risen' }, plague: { set: 'risen', tint: [0.72, 0.92, 0.55], scale: 1.12 },
  thrall: { set: 'skeleton', stride: 1.25 }, cryptGuard: { set: 'skeleton', tint: [0.62, 0.58, 0.55], scale: 1.08, stride: 1.25 },
  bat: { set: 'bat', stride: 2.5 }, bloodBat: { set: 'bat', tint: [1.25, 0.55, 0.5], scale: 1.2, stride: 2.5 },
  acolyte: { set: 'acolyte' }, flameWitch: { set: 'acolyte', tint: [1.6, 0.75, 0.5], glow: 0.15 },
  boneArcher: { set: 'archer' }, graveHound: { set: 'hound', stride: 2.2 }, ghoul: { set: 'ghoul' },
  wraith: { set: 'wraith', stride: 1.8 }, tormented: { set: 'wraith', tint: [1.6, 0.6, 0.45], glow: 0.2, stride: 1.8 },
  lurker: { set: 'spider', stride: 1.6 }, spiderling: { set: 'spiderling', stride: 1.2 }, webMother: { set: 'mother', stride: 2.5 },
  pitImp: { set: 'imp', stride: 0.9 }, impShaman: { set: 'imp', tint: [0.7, 0.75, 1.2], stride: 0.9 }, emberImp: { set: 'imp', tint: [1.5, 0.85, 0.5], glow: 0.25, stride: 0.9 },
  brute: { set: 'golem', stride: 1.4 }, magmaBrute: { set: 'golem_magma', stride: 1.4 },
  hellspawn: { set: 'hellspawn' }, abyssKnight: { set: 'hellspawn', tint: [0.55, 0.5, 0.55], scale: 1.1 },
  flayer: { set: 'flayer', stride: 1.6 }, hollowKing: { set: 'bishop', stride: 2.0 }, vaelzhor: { set: 'vael', stride: 2.4 },
};
const ZONE_SETS = {
  town: ['town_town', 'crypt_common', 'villager_greta', 'villager_ysolde', 'villager_osric', 'villager_tam'],
  abbey: ['crypt_abbey', 'crypt_common', 'risen', 'skeleton', 'bat', 'acolyte', 'archer', 'flayer'],
  catacombs: ['crypt_ossuary', 'crypt_common', 'skeleton', 'hound', 'ghoul', 'wraith', 'risen', 'archer', 'bishop'],
  caves: ['cave_caves', 'crypt_common', 'spider', 'spiderling', 'imp', 'golem', 'bat', 'mother'],
  abyss: ['cave_abyss', 'crypt_common', 'hellspawn', 'acolyte', 'imp', 'golem_magma', 'wraith', 'vael'],
};
const ALWAYS_SETS = [HSET + '_body', 'items_g'];

// ---------------------------------------------------------------- animated sprite visual (hero, monsters, NPCs)
const NDIR = 16;
const dirOfAngle = (a, n = NDIR) => ((Math.round(a / (TAU / n)) % n) + n) % n;
class SpriteVis {
  constructor(setName, o = {}) {
    this.set = setName; this.obj = new Node(); this.obj.vis = this;
    this.tint = o.tint || null; this.scale = o.scale || 1; this.glowAdd = o.glow || 0; this.stride = o.stride || 1.3;
    this.hero = !!o.hero; this.anim = 'idle'; this.t = Math.random() * 3; this.dur = 1; this.speed = 0;
    this.flash = 0; this.alpha = 1; this.style = {}; this.glow = [0, 0, 0]; this.cur = 0; this.trail = [];
    const self = this;
    this.mat = { userData: { glow: { value: { set(r, g, b) { self.glow[0] = r; self.glow[1] = g; self.glow[2] = b; } } }, flash: { value: { set() { } } } } };
    this.mesh = { castShadow: false };
  }
  get sheet() { return SETS[this.set]; }
  // paper-doll layers drawn with the same animation frame as the base sheet (hero equipment)
  setLayers(list) { this.layers = list; }
  has(a) { const s = this.sheet; return !!(s && s.meta.anims[a]); }
  resolve(a) {
    if (this.has(a)) return a;
    if (a === 'cast') return this.has('attack3') ? 'attack3' : 'attack';
    if (a === 'block') return 'hit';
    return this.has('idle') ? 'idle' : Object.keys(this.sheet ? this.sheet.meta.anims : { idle: 1 })[0];
  }
  play(name, dur = 1, force = false) {
    let a = name;
    // the Penitent chains three different blows when attacking in quick succession
    if (this.hero && name === 'attack' && !window.ACTION) {   // the action fork chains its own combo
      const chain = this.lastAtkEnd !== undefined && G.time - this.lastAtkEnd < 0.55;
      this.combo = chain ? ((this.combo || 0) + 1) % 3 : 0;
      a = ['attack', 'attack2', 'attack3'][this.combo];
    }
    a = this.resolve(a);
    if (this.anim === a && !force && this.req === name) return;
    if (this.hero && /^attack/.test(this.anim) && !/^attack/.test(a)) this.lastAtkEnd = G.time;
    this.anim = a; this.req = name; this.t = 0; this.dur = dur || 1; this.trailF = -1;
  }
  update(dt, speed) { this.t += dt; this.speed = speed || 0; if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 5); }
  frame() {
    const S = this.sheet; if (!S) return null;
    const A = S.meta.anims[this.anim] || S.meta.anims.idle; if (!A) return null;
    let f;
    if (A.loop) {
      const period = this.anim === 'walk' ? (this.speed > 0.1 ? this.stride / this.speed : 1) : (this.anim === 'idle' ? 2.6 : this.dur);
      f = Math.floor(((this.t / period) % 1) * A.n);
    } else f = Math.min(A.n - 1, Math.max(0, Math.floor(this.t / Math.max(0.05, this.dur) * A.n)));
    return { A, f, c: A.loop ? f : Math.min(A.n - 1, this.t / Math.max(0.05, this.dur) * A.n) };
  }
  dir(n = NDIR) {
    // smooth turning: chase the logical facing, show the nearest of the baked directions (16 for the hero, 8 for most monsters)
    const target = this.obj.rotation.y;
    let d = target - this.cur; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
    const st = 14 * (G.dt || 0.016); this.cur += Math.abs(d) < st || Math.abs(d) > 2.6 ? d : Math.sign(d) * st;
    return dirOfAngle(this.cur, n);
  }
  draw() {
    if (!this.obj.visible || this.alpha <= 0) return;
    const F = this.frame(); if (!F) return;
    const p = this.obj.position, d = this.dir(F.A.frames.length);
    const g = this.glow, ge = (g[0] + g[1] + g[2]) * 3 + this.glowAdd;
    let tint = this.tint;
    if (g[0] + g[1] + g[2] > 0.01) { const b = this.tint || [1, 1, 1], k = 4; tint = [b[0] + g[0] * k, b[1] + g[1] * k, b[2] + g[2] * k]; }
    const o = { flash: this.flash, tint, emis: ge, alpha: this.alpha, scale: this.scale, cut: false };
    GFX.sprite(this.sheet, this.anim, d, F.f, p.x, p.y, p.z, o);
    if (this.layers) for (const L of this.layers) { const sh = SETS[L.set]; if (sh && sh.meta.anims[this.anim]) GFX.sprite(sh, this.anim, d, F.f, p.x, p.y, p.z, L.tint ? Object.assign({}, o, { tint: L.tint }) : o); }
    this.lastDir = d; this.lastF = F;
    if (/^attack/.test(this.anim) && F.A.sword) this.updateTrail(F, d);
  }
  // sword trail: the baked hilt/tip positions, slerped between frames, make a fading ribbon
  swordAt(A, d, c) {
    const S = A.sword && A.sword[d]; if (!S) return null;
    const i = Math.max(0, Math.min(A.n - 1, Math.floor(c))), j = Math.min(A.n - 1, i + 1), f = c - i;
    const a = S[i], b = S[j]; if (!a || !b) return null;
    const sc = this.scale, p = this.obj.position;
    const h = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    let da = [a[3] - a[0], a[4] - a[1], a[5] - a[2]], db = [b[3] - b[0], b[4] - b[1], b[5] - b[2]];
    const la = Math.hypot(...da), lb = Math.hypot(...db); da = da.map(v => v / la); db = db.map(v => v / lb);
    const dot = clamp(da[0] * db[0] + da[1] * db[1] + da[2] * db[2], -1, 1), om = Math.acos(dot);
    let dv; if (om < 1e-3) dv = da; else { const s0 = Math.sin((1 - f) * om) / Math.sin(om), s1 = Math.sin(f * om) / Math.sin(om); dv = [da[0] * s0 + db[0] * s1, da[1] * s0 + db[1] * s1, da[2] * s0 + db[2] * s1]; }
    const L = la + (lb - la) * f;
    return [p.x + h[0] * sc, p.y + h[1] * sc, p.z + h[2] * sc, p.x + (h[0] + dv[0] * L) * sc, p.y + (h[1] + dv[1] * L) * sc, p.z + (h[2] + dv[2] * L) * sc];
  }
  updateTrail(F, d) {
    const u = F.c / F.A.n;
    if (u < 0.36 || u > 0.74) { this.trailF = -1; return; }
    const from = this.trailF < 0 ? F.c - 0.4 : this.trailF;
    const n = Math.max(1, Math.round((F.c - from) * 6));
    for (let k = 1; k <= n; k++) { const s = this.swordAt(F.A, d, from + (F.c - from) * k / n); if (s) this.trail.push({ s, time: G.time }); }
    this.trailF = F.c;
  }
  drawTrail() {
    const life = this.trailLife || 0.16;
    this.trail = this.trail.filter(s => G.time - s.time < life);
    const n = this.trail.length; if (n < 2) return;
    const pts = this.trail.map((s, i) => { const age = (G.time - s.time) / life; return [...s.s, (1 - age) * (1 - age) * (i / (n - 1)) * (this.hero ? 0.9 : 0.5)]; });
    GFX.S.trails.push({ pts, col: this.trailCol || (this.hero ? [1.0, 0.85, 0.65] : [0.75, 0.45, 0.25]) });
  }
  lanternAt() {
    const F = this.lastF; if (!F || !F.A.lantern) return null;
    const L = F.A.lantern[this.lastDir]; if (!L) return null;
    const q = L[F.f]; if (!q) return null;
    const p = this.obj.position;
    return [p.x + q[0] * this.scale, p.y + q[1] * this.scale, p.z + q[2] * this.scale];
  }
  dispose() { }
}

// ---------------------------------------------------------------- static props placed in the level (tiles, furniture)
// entry: { s: set, p: piece, d: dir, f: frame, x, y, z, cut, b: [minx, maxx, miny, maxy] screen bounds relative to the anchor }
function propBounds(e) {
  const sh = SETS[e.s]; if (!sh) return null;
  const A = sh.meta.anims[e.p]; if (!A) { console.warn('missing piece', e.s, e.p); return null; }
  const di = A.dirs ? Math.max(0, A.dirs.indexOf(e.d)) : e.d;
  e.di = di;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const fr of A.frames[di] || A.frames[0]) { x0 = Math.min(x0, fr[4] - A.anchor[0]); x1 = Math.max(x1, fr[4] + fr[2] - A.anchor[0]); y0 = Math.min(y0, fr[5] - A.anchor[1]); y1 = Math.max(y1, fr[5] + fr[3] - A.anchor[1]); }
  e.b = [x0, x1, y0, y1];
  return e.b;
}
function drawStatic(list) {
  const W = GFX.W, H = GFX.H;
  let n = 0;
  for (const e of list) {
    if (e.hidden) continue;
    if (!e.b && !propBounds(e)) continue;
    const [sx, sy] = GFX.toScreen(e.x, e.y || 0, e.z);
    if (sx + e.b[1] < -4 || sx + e.b[0] > W + 4 || sy + e.b[3] < -4 || sy + e.b[2] > H + 4) continue;
    GFX.sprite(SETS[e.s], e.p, e.di, e.f || 0, e.x, e.y || 0, e.z, e.o || (e.cut ? CUT_OPT : null));
    n++;
  }
  return n;
}
const CUT_OPT = { cut: true };

// ---------------------------------------------------------------- frame
function renderWorld() {
  const t = G.time;
  // camera + shake
  GFX.S.shake = Math.min(14, (R3.camShake || 0) * 26);
  R3.camShake = Math.max(0, (R3.camShake || 0) - G.dt * 2.2);
  GFX.setCamera(R3.camTarget.x, 0, R3.camTarget.z);
  syncLights();
  // static level geometry
  if (WORLD.level && WORLD.level.statics) drawStatic(WORLD.level.statics);
  // everything hung under the scene / level roots
  const chars = GFX.S.chars;
  GFX.S.glows.length = 0;
  const visit = node => {
    if (!node.visible) return;
    if (node.vis) { node.vis.draw(); if (node.vis.trail.length) node.vis.drawTrail(); }
    else if (node.draw) node.draw();
    for (const c of node.children) visit(c);
  };
  visit(R3.scene);
  if (WORLD.root) visit(WORLD.root);
  // characters shadow the lights: hero + nearby monsters as capsules
  const H = WORLD.hero;
  if (H && H.vis && H.alive) chars.push([H.x, H.z, 0.27, 1.7]);
  for (const m of WORLD.monsters) if (m.alive && m.vis && m.vis.obj.visible && chars.length < 8 && H && m.dist(H) < 10) chars.push([m.x, m.z, (m.radius || 0.3) * 0.85, (m.T.boss ? 3 : 1.6) * (m.vis.scale || 1)]);
  GFX.S.cut = H && H.alive ? [H.x, 1.0, H.z, 92] : null;
  FX.preRender();
  GFX.render(t);
}
