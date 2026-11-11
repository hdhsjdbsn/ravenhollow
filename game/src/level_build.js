'use strict';
// Turns a generated dungeon grid into placed baked pieces (floors, walls, props), lights, fires and an occluder map.

const KITS = {
  abbey: { set: 'crypt_abbey', floors: [['floor', 12], ['floor_crack', 4], ['floor_debris', 3], ['floor_bones', 1], ['floor_blood', 1]], walls: [['wall', 10], ['wall_b', 2], ['wall_arch', 3]], low: 'wall_low', torch: 0xff7a2c, crypt: true },
  catacombs: { set: 'crypt_ossuary', floors: [['floor', 10], ['floor_crack', 4], ['floor_debris', 3], ['floor_bones', 3], ['floor_blood', 1]], walls: [['wall', 6], ['wall_niche', 6], ['wall_bones', 3], ['wall_arch', 1], ['wall_b', 1]], low: 'wall_low', torch: 0xff6a24, crypt: true, ossuary: true },
  caves: { set: 'cave_caves', floors: [['floor', 12], ['floor_b', 4], ['floor_c', 3], ['floor_bones', 1]], walls: [['wall', 10], ['wall_b', 2]], low: 'wall_low', torch: 0xff9a40, caves: true },
  abyss: { set: 'cave_abyss', floors: [['floor', 12], ['floor_b', 3], ['floor_c', 3], ['floor_bones', 1]], walls: [['wall', 10], ['wall_b', 3]], low: 'wall_low', torch: 0xff5020, caves: true, abyss: true },
};
// colour, light and grade per zone
const LOOK = {
  // dusk, after the key art: a dying orange sun low in the west rakes the gables, cold slate everywhere it cannot reach
  town: { amb: [0.85, 0.9, 1.08], sun: [3.6, 1.6, 0.7], sunDir: [0.3, 0.42, 0.86], fog: 0.004, fogTop: 4, fogCol: [0.1, 0.095, 0.1], mist: 1.5, grime: 0.6, wet: 0.6, sat: 0.72, gain: [1.03, 1.0, 0.97], lift: [0.004, 0.003, 0.004], expo: 1.0, lantern: [1, 0.68, 0.38, 3.5, 6], v2: 1, bloom: 0.7, sharp: 0.28, lightK: 0.7, vig: 0.3, vista: [8.5, 0.6, 8.5, 1.5], camBack: 6 },
  // v2 look (2026-11-10, rolled out from the graphics test room): cold near-black shadows, ember lights, wet stone,
  // surface detail, no posterising. 'lightK' scales the level's own torches and braziers.
  abbey: { amb: [0.03, 0.033, 0.042], fog: 0.002, fogTop: 3.4, fogCol: [0.005, 0.005, 0.006], mist: 0.6, grime: 0.6, wet: 0.35, sat: 0.82, gain: [1.02, 1.0, 0.96], lift: [0.0, 0.0015, 0.003], expo: 0.9, lantern: [1, 0.66, 0.36, 5.5, 8], v2: 1, bloom: 0.8, sharp: 0.28, lightK: 0.7 },
  catacombs: { amb: [0.027, 0.032, 0.044], fog: 0.002, fogTop: 3.4, fogCol: [0.004, 0.005, 0.007], mist: 0.55, grime: 0.55, wet: 0.55, sat: 0.8, gain: [1.0, 1.0, 1.0], lift: [0.0, 0.0015, 0.004], expo: 0.9, lantern: [1, 0.64, 0.34, 5.5, 8], v2: 1, bloom: 0.8, sharp: 0.28, lightK: 0.65 },
  caves: { amb: [0.05, 0.062, 0.075], fog: 0.0022, fogTop: 3, fogCol: [0.003, 0.005, 0.006], mist: 0.9, grime: 0.5, wet: 0.75, sat: 0.82, gain: [0.98, 1.0, 1.02], lift: [0.0, 0.002, 0.004], expo: 1.05, lantern: [1, 0.7, 0.42, 8.5, 9.5], v2: 1, bloom: 0.8, sharp: 0.28, lightK: 1.3 },
  abyss: { amb: [0.1, 0.04, 0.026], fog: 0.003, fogTop: 3.4, fogCol: [0.02, 0.004, 0.0], mist: 0.6, grime: 0.5, wet: 0, sat: 0.9, gain: [1.08, 0.96, 0.84], lift: [0.008, 0.001, 0.0], expo: 1.02, lantern: [1, 0.66, 0.4, 8.5, 9.5], v2: 1, bloom: 0.9, sharp: 0.28, lightK: 1.2 },
};
function applyLook(name) {
  const L = LOOK[name] || LOOK.abbey, S = GFX.S;
  S.amb = L.amb; S.sun = L.sun || [0, 0, 0]; S.sunDir = L.sunDir || [0.4, 0.8, 0.3]; S.fog = L.fog; S.fogTop = L.fogTop; S.fogCol = L.fogCol; S.mist = L.mist; S.grime = L.grime; S.wet = L.wet;
  S.sat = L.sat; S.gain = L.gain; S.lift = L.lift; S.expo = L.expo * (G.settings.brightness || 1);
  if (S.vig0 === undefined) S.vig0 = S.vig; S.vig = L.vig ?? S.vig0;
  S.vista = L.vista || [0, 0, 0, 0];
  S.v2 = L.v2 || 0; S.bloom = L.bloom ?? 0.45; S.sharp = L.sharp ?? 0.5; S.dither = L.v2 ? 0 : 52;   // v2: smooth gradients, no posterising
}
function pickW(R, list) { let tot = 0; for (const e of list) tot += e[1]; let x = R() * tot; for (const e of list) { x -= e[1]; if (x <= 0) return e[0]; } return list[0][0]; }

// rotate a piece-local offset by a baked direction index (yaw = d * 90deg for 4-way pieces)
function rotOff(v, d, ndir = 4) {
  const a = d * TAU / ndir, c = Math.cos(a), s = Math.sin(a);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

Level.prototype.place = function (set, p, d, x, z, o = {}) {
  const e = { s: set, p, d: d || 0, f: o.f || 0, x, y: o.y || 0, z, cut: !!o.cut || (o.h || 0) >= 1.5 };
  this.statics.push(e);
  if (o.block) for (const [bx, bz] of (o.cells || [[Math.floor(x), Math.floor(z)]])) if (this.get(bx, bz) === T_FLOOR) this.block[this.idx(bx, bz)] = 1;
  if (o.h) this.occRect(x - (o.hw || 0.25), z - (o.hw || 0.25), x + (o.hw || 0.25), z + (o.hw || 0.25), o.h);
  // fires and lights baked into the piece description
  const meta = META[set] && META[set].anims[p];
  const ex = meta && meta.extra;
  if (ex && !o.noLights) {
    const nd = meta.ndir === 2 && meta.dirs && meta.dirs.length === 2 && meta.dirs[1] === 1 ? 4 : (meta.dirs ? Math.max(4, meta.dirs.length) : 4);
    if (ex.flames) for (const f of ex.flames) { const q = rotOff(f, d, nd); this.fires.push({ x: x + q[0], y: q[1], z: z + q[2], size: f[3] }); }
    if (ex.light) { const q = rotOff(ex.light, d, nd); this.lightSrc.push({ x: x + q[0], y: q[1], z: z + q[2], color: o.lightColor || this.kit.torch || 0xff8a3a, intensity: ex.light[3], radius: ex.light[4], flicker: 0.3 }); }
    if (ex.flames && !ex.light && ex.flames.length > 2) { const q = rotOff(ex.flames[0], d, nd); this.lightSrc.push({ x: x + q[0], y: q[1] + 0.3, z: z + q[2], color: 0xffa050, intensity: 2.6, radius: 3.2, flicker: 0.2, priority: -1 }); }
  }
  return e;
};
Level.prototype.occRect = function (x0, z0, x1, z1, h) {
  const P = 4, W = this.w * P;
  const v = Math.min(255, Math.round(h / 12 * 255));
  for (let z = Math.max(0, Math.floor(z0 * P)); z < Math.min(this.h * P, Math.ceil(z1 * P)); z++) for (let x = Math.max(0, Math.floor(x0 * P)); x < Math.min(W, Math.ceil(x1 * P)); x++) this.occ[z * W + x] = Math.max(this.occ[z * W + x], v);
};
// floors and walls from the grid
Level.prototype.buildTiles = function () {
  const K = this.kit = KITS[this.zoneName], R = RNG(this.seed + 31), W = this.w, Hh = this.h, set = K.set;
  this.statics = []; this.fires = []; this.lightSrc = this.lightSrc || [];
  this.occ = new Uint8Array(W * 4 * Hh * 4);
  const open = (x, z) => { const v = this.get(x, z); return v === T_FLOOR || v === T_LAVA || v === T_WATER; };
  for (let z = 0; z < Hh; z++) for (let x = 0; x < W; x++) {
    const v = this.get(x, z), cx = x + 0.5, cz = z + 0.5;
    if (v === T_FLOOR) this.place(set, pickW(R, K.floors), (R() * 4) | 0, cx, cz);
    else if (v === T_LAVA) { this.place(K.abyss ? set : 'cave_abyss', 'lava', (R() * 4) | 0, cx, cz); if (R() < 0.25) this.lightSrc.push({ x: cx, y: 0.4, z: cz, color: 0xff4010, intensity: 3, radius: 3.5, flicker: 0.4, noShadow: true }); }
    else if (v === T_WALL) {
      const low = open(x - 1, z) || open(x, z - 1) || open(x - 1, z - 1);
      if (low && !(open(x + 1, z) || open(x, z + 1))) { this.place(set, K.low, (R() * 4) | 0, cx, cz, { cut: false }); this.occRect(x, z, x + 1, z + 1, 0.6); }
      else {
        const fx = open(x + 1, z), fz = open(x, z + 1);
        let p = 'wall', d = (R() * 2) | 0;
        if (fx !== fz) { p = pickW(R, K.walls); d = fx ? 1 : 0; }
        if (K.caves) d = (R() * 4) | 0;
        this.place(set, p, d, cx, cz, { cut: true });
        this.occRect(x, z, x + 1, z + 1, 2.4);
      }
    }
  }
};
// a free floor cell next to the arrival stairs to flood-fill from. The old guard started two rows below the stairs, which
// is solid wall whenever the stairs sit against a south wall -- then every connectivity check passed and props could seal
// corridors.
Level.prototype.floodStart = function () {
  const s = this.stairsUp || [Math.floor(this.rooms[0].cx), Math.floor(this.rooms[0].cz)];
  for (let r = 1; r <= 4; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r + 1; dx++) {
    const x = s[0] + dx, z = s[1] + dz; if (this.cellFree(x, z)) return z * this.w + x;
  }
  return (s[1] + 2) * this.w + s[0];
};
// furniture, light sources, interactive objects
Level.prototype.decorate = function () {
  const R = this.rng, K = this.kit, Z = this.zoneName, set = K.set, C = 'crypt_common';
  const occupied = (x, z) => this.block[this.idx(x, z)];
  const near = (x, z, sx, sz, r) => Math.abs(x - sx) <= r && Math.abs(z - sz) <= r;
  const nearStairs = (x, z) => (this.stairsUp && near(x, z, this.stairsUp[0], this.stairsUp[1], 3)) || (this.stairsDown && near(x, z, this.stairsDown[0], this.stairsDown[1], 3));
  // connectivity guard: a blocking prop may never cut the level in two
  const reachCount = () => {
    const W = this.w, seen = new Uint8Array(this.t.length), st = [this.floodStart()];
    const oc = new Set(this.objects.map(o => this.idx(Math.floor(o.x), Math.floor(o.z))));
    let n = 0;
    while (st.length) { const i = st.pop(); if (seen[i]) continue; const x = i % W, z = (i / W) | 0; if (!this.cellFree(x, z) || oc.has(i)) continue; seen[i] = 1; n++; st.push(i + 1, i - 1, i + W, i - W); }
    return n;
  };
  const canBlock = cells => {
    for (const [x, z] of cells) if (!this.cellFree(x, z) || nearStairs(x, z)) return false;
    for (const [x, z] of cells) for (const o of this.objects) if (Math.abs(Math.floor(o.x) - x) <= 1 && Math.abs(Math.floor(o.z) - z) <= 1) return false;
    const r0 = reachCount();
    for (const [x, z] of cells) this.block[this.idx(x, z)] = 1;
    const ok = reachCount() >= r0 - cells.length;
    for (const [x, z] of cells) this.block[this.idx(x, z)] = 0;
    return ok;
  };
  const put = (s, p, x, z, d, block, o = {}) => { if (occupied(x, z) || (block && !canBlock([[x, z]]))) return null; return this.place(s, p, d, x + 0.5, z + 0.5, Object.assign({ block, h: block ? (o.h || 1) : 0 }, o)); };
  const wallDirOf = d => (d[0] === 0 ? 0 : 1);   // wall north (-z) -> piece dir 0, wall west (-x) -> dir 1
  // stairs
  if (this.stairsUp) {
    const [sx, sz] = this.stairsUp;
    this.place(K.caves ? C : set, 'stairs_up', 0, sx + 1, sz + 1, { block: true, cells: [[sx, sz], [sx + 1, sz]], h: 2.5, hw: 0.9 });
    this.lightSrc.push({ x: sx + 1, y: 2, z: sz + 2, color: 0xa0b8ff, intensity: 3, radius: 5, priority: 0 });
  }
  if (this.stairsDown) {
    const [sx, sz] = this.stairsDown;
    this.place(K.caves ? C : set, 'stairs_down', 0, sx + 1, sz + 1, { block: true, cells: [[sx, sz], [sx + 1, sz], [sx, sz + 1], [sx + 1, sz + 1]] });
    this.lightSrc.push({ x: sx + 1, y: 0.3, z: sz + 1, color: 0xff4020, intensity: 2.5, radius: 3.5, flicker: 0.3, noShadow: true });
  }
  // wall torches along the far (visible) walls
  const torchSpots = [];
  for (let z = 1; z < this.h - 1; z++) for (let x = 1; x < this.w - 1; x++) {
    if (!this.isFloor(x, z)) continue;
    for (const d of [[0, -1], [-1, 0]]) if (this.get(x + d[0], z + d[1]) === T_WALL && !this.isLowWall(x + d[0], z + d[1])) torchSpots.push([x, z, d]);
  }
  R.shuffle(torchSpots);
  const placed = [];
  const torchDensity = K.caves ? 11 : 6.5;
  if (!K.caves) for (const [x, z, d] of torchSpots) {
    if (placed.some(p => Math.abs(p[0] - x) + Math.abs(p[1] - z) < torchDensity)) continue;
    placed.push([x, z]);
    this.place(set, 'sconce', wallDirOf(d), x + 0.5, z + 0.5, { lightColor: K.torch });
  }
  // room furnishings
  for (const r of this.rooms) {
    const cells = [];
    for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) if (this.cellFree(x, z) && !nearStairs(x, z)) cells.push([x, z]);
    const edgeCells = cells.filter(([x, z]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => this.get(x + dx, z + dz) === T_WALL));
    const wallDir = (x, z) => { for (const d of [[0, -1], [-1, 0], [1, 0], [0, 1]]) if (this.get(x + d[0], z + d[1]) === T_WALL) return d; return [0, -1]; };
    const farWall = (x, z) => { for (const d of [[0, -1], [-1, 0]]) if (this.get(x + d[0], z + d[1]) === T_WALL && !this.isLowWall(x + d[0], z + d[1])) return d; return null; };
    const pickFar = () => { for (let k = 0; k < edgeCells.length; k++) { const c = edgeCells[k]; if (farWall(c[0], c[1])) { edgeCells.splice(k, 1); return c; } } return null; };
    const pickEdge = () => edgeCells.length ? edgeCells.splice(R.int(0, edgeCells.length - 1), 1)[0] : null;
    const facing = d => d[0] === 0 ? (d[1] < 0 ? 0 : 2) : (d[0] < 0 ? 1 : 3);   // a 4-way prop's back against wall d
    switch (r.type) {
      case 'nave': {
        for (let x = r.x + 2; x < r.x + r.w - 2; x += 3) { put(set, 'pillar', x, r.z + 1, 0, true, { h: 2.4 }); put(set, 'pillar', x, r.z + r.h - 2, 0, true, { h: 2.4 }); }
        const ax = Math.floor(r.cx), az = r.z + 2;
        if (!occupied(ax, az) && canBlock([[ax, az], [ax - 1, az], [ax + 1, az]])) { this.place(set, 'altar', 0, ax + 0.5, az + 0.3, { block: true, cells: [[ax, az], [ax - 1, az], [ax + 1, az]], h: 1 }); this.objects.push({ type: 'shrine', kind: 'altar', x: ax + 0.5, z: az + 0.9 }); }
        for (let z = az + 3; z < r.z + r.h - 2; z += 2) for (const ox of [-3, 2]) { const px = ax + ox; if (this.cellFree(px, z) && this.cellFree(px + 1, z) && canBlock([[px, z], [px + 1, z]])) this.place(set, 'pew', 0, px + 1, z + 0.5, { block: true, cells: [[px, z], [px + 1, z]], h: 0.9, hw: 0.9 }); }
        for (let i = 0; i < 3; i++) { const c = pickEdge(); if (c) put(C, 'candles_b', c[0], c[1], 0, false); }
        for (let i = 0; i < 2; i++) { const c = pickFar(); if (c) this.place(set, 'banner', wallDirOf(farWall(c[0], c[1])), c[0] + 0.5, c[1] + 0.5); }
        break;
      }
      case 'chapel': {
        const c = pickEdge(); if (c) { const d = wallDir(c[0], c[1]); if (put(set, 'altar', c[0], c[1], facing(d), true)) this.objects.push({ type: 'shrine', kind: 'altar', x: c[0] + 0.5 - d[0] * 0.8, z: c[1] + 0.5 - d[1] * 0.8 }); }
        for (let i = 0; i < 3; i++) { const e = pickEdge(); if (e) put(C, R() < 0.5 ? 'candles' : 'candles_b', e[0], e[1], 0, false); }
        break;
      }
      case 'library': {
        for (let i = 0; i < 5; i++) { const c = pickFar(); if (c) put(set, 'bookshelf', c[0], c[1], wallDirOf(farWall(c[0], c[1])), true, { h: 2 }); }
        const m = this.randomFloorInRoom(r, R, 1); if (m && put(set, 'lectern', m[0], m[1], (R() * 4) | 0, true)) this.objects.push({ type: 'lectern', x: m[0] + 0.5, z: m[1] + 0.5 });
        const t = this.randomFloorInRoom(r, R, 1); if (t) put(set, 'table', t[0], t[1], (R() * 2) | 0, true, { h: 0.9 });
        break;
      }
      case 'storage': for (let i = 0; i < 7; i++) { const c = pickEdge(); if (c) this.objects.push({ type: R() < 0.7 ? 'barrel' : 'crate', x: c[0] + 0.5, z: c[1] + 0.5 }); } break;
      case 'hall': {
        if (r.w >= 7 && r.h >= 7) for (const [dx, dz] of [[2, 2], [r.w - 3, 2], [2, r.h - 3], [r.w - 3, r.h - 3]]) put(set, R() < 0.7 ? 'pillar' : 'pillar_broken', r.x + dx, r.z + dz, 0, true, { h: 2.4 });
        const c = this.randomFloorInRoom(r, R, 2); if (c) put(set, 'brazier', c[0], c[1], 0, true, { lightColor: 0xff8a3a });
        break;
      }
      case 'crypt': case 'tomb': {
        for (let i = 0; i < (r.type === 'tomb' ? 4 : 2); i++) { const c = this.randomFloorInRoom(r, R, 1); if (c && this.cellFree(c[0], c[1] + 1) && canBlock([[c[0], c[1]], [c[0], c[1] + 1]])) { this.objects.push({ type: 'sarcophagus', x: c[0] + 0.5, z: c[1] + 1, rot: 0 }); this.block[this.idx(c[0], c[1])] = 1; this.block[this.idx(c[0], c[1] + 1)] = 1; } }
        for (let i = 0; i < 2; i++) { const e = pickEdge(); if (e) put(C, 'candles', e[0], e[1], 0, false); }
        if (r.type === 'tomb') { const e = pickEdge(); if (e) this.objects.push({ type: 'chest', x: e[0] + 0.5, z: e[1] + 0.5, rot: facing(wallDir(e[0], e[1])) }); }
        break;
      }
      case 'ossuary': {
        for (let i = 0; i < 4; i++) { const c = pickEdge(); if (c) put(C, R() < 0.5 ? 'skullpile' : 'bonepile', c[0], c[1], (R() * 2) | 0, false); }
        for (let i = 0; i < 2; i++) { const c = pickEdge(); if (c) this.objects.push({ type: 'coffin', x: c[0] + 0.5, z: c[1] + 0.5, rot: (R() * 4) | 0 }); }
        break;
      }
      case 'prison': {
        for (let i = 0; i < 2; i++) { const c = this.randomFloorInRoom(r, R, 1); if (c) put(C, 'cage', c[0], c[1], (R() * 4) | 0, true, { h: 2.6 }); }
        for (let i = 0; i < 3; i++) { const c = pickFar(); if (c) this.place(set, 'chains', wallDirOf(farWall(c[0], c[1])), c[0] + 0.5, c[1] + 0.5); }
        break;
      }
      case 'nest': {
        for (let i = 0; i < 3; i++) { const c = this.randomFloorInRoom(r, R, 0); if (c) put(set, 'web', c[0], c[1], 0, false); }
        for (let i = 0; i < 3; i++) { const c = this.randomFloorInRoom(r, R, 0); if (c) put(C, 'bonepile', c[0], c[1], (R() * 2) | 0, false); }
        break;
      }
      case 'camp': {
        const c = this.randomFloorInRoom(r, R, 1);
        if (c) put(set, 'campfire', c[0], c[1], 0, true, { h: 0.3 });
        for (let i = 0; i < 3; i++) { const e = pickEdge(); if (e) this.objects.push({ type: R() < 0.5 ? 'barrel' : 'crate', x: e[0] + 0.5, z: e[1] + 0.5 }); }
        break;
      }
      case 'pool': { const c = this.randomFloorInRoom(r, R, 1); if (c && !K.abyss) put(set, 'pool', c[0], c[1], (R() * 4) | 0, false); break; }
      default: break;
    }
    // clutter
    const clutter = K.caves ? 5 : 2;
    for (let i = 0; i < clutter; i++) {
      const c = pickEdge(); if (!c) break;
      const k = R();
      if (K.abyss) { if (k < 0.3) put(set, 'lavarock', c[0], c[1], (R() * 2) | 0, true, { h: 0.5 }); else if (k < 0.5) put(set, 'spikes', c[0], c[1], 0, true, { h: 1 }); else if (k < 0.62) put(set, 'impaled', c[0], c[1], (R() * 2) | 0, true, { h: 2 }); else if (k < 0.8) put(set, 'brazier', c[0], c[1], 0, true, { h: 1.1 }); else put(set, 'rocks', c[0], c[1], (R() * 2) | 0, false); }
      else if (K.caves) { if (k < 0.4) put(set, 'stalagmite', c[0], c[1], (R() * 2) | 0, true, { h: 1.6 }); else if (k < 0.65) { if (put(set, 'mushrooms', c[0], c[1], 0, false)) this.lightSrc.push({ x: c[0] + 0.5, y: 0.5, z: c[1] + 0.5, color: 0x50c8a0, intensity: 1.8, radius: 3.2, flicker: 0.05, noShadow: true }); } else if (k < 0.85) put(set, 'rocks', c[0], c[1], (R() * 2) | 0, false); else put(C, 'bonepile', c[0], c[1], (R() * 2) | 0, false); }
      else { if (k < 0.35) this.objects.push({ type: 'barrel', x: c[0] + 0.5, z: c[1] + 0.5 }); else if (k < 0.55) put(C, 'rubble', c[0], c[1], (R() * 2) | 0, false); else if (k < 0.75) put(C, 'bonepile', c[0], c[1], (R() * 2) | 0, false); else if (k < 0.82) put(C, 'urns', c[0], c[1], (R() * 2) | 0, false); else if (K.ossuary) put(C, 'web', c[0], c[1], 0, false); }
    }
    if (K.caves && R() < 0.65) { const c = this.randomFloorInRoom(r, R, 1); if (c) put(set, 'brazier', c[0], c[1], 0, true, { h: 1.1, lightColor: K.abyss ? 0xff5020 : 0xff9a40 }); }
    if (R() < 0.12 && r !== this.startRoom) { const c = this.randomFloorInRoom(r, R, 1); if (c && canBlock([c])) { this.objects.push({ type: 'shrine', kind: 'shrine', x: c[0] + 0.5, z: c[1] + 0.5 }); this.block[this.idx(c[0], c[1])] = 1; } }
    if (R() < 0.18) { const c = pickEdge(); if (c) this.objects.push({ type: 'chest', x: c[0] + 0.5, z: c[1] + 0.5, rot: facing(wallDir(c[0], c[1])) }); }
  }
  // crypt walls: banners, statues with candles, candle clusters; free-standing gibbets, sarcophagi, braziers, crosses, urns
  if (K.crypt) {
    const used = new Set(), wallCells = [];
    for (let z = 1; z < this.h - 1; z++) for (let x = 1; x < this.w - 1; x++) {
      if (!this.cellFree(x, z) || nearStairs(x, z) || placed.some(p => p[0] === x && p[1] === z)) continue;
      for (const d of [[0, -1], [-1, 0]]) if (this.get(x + d[0], z + d[1]) === T_WALL && !this.isLowWall(x + d[0], z + d[1])) wallCells.push([x, z, d]);
    }
    R.shuffle(wallCells);
    const P = K.ossuary ? { banner: 0.06, statue: 0.05, candles: 0.14 } : { banner: 0.12, statue: 0.06, candles: 0.08 };
    for (const [x, z, d] of wallCells) {
      const key = x + ',' + z; if (used.has(key)) continue;
      const k = R();
      if (k < P.banner) this.place(set, 'banner', wallDirOf(d), x + 0.5, z + 0.5);
      else if (k < P.banner + P.statue) { if (!canBlock([[x, z]])) continue; this.place(set, 'statue', wallDirOf(d), x + 0.5, z + 0.5, { block: true, cells: [[x, z]], h: 1.8 }); this.lightSrc.push({ x: x + 0.5 - d[0] * 0.1, y: 0.8, z: z + 0.5 - d[1] * 0.1, color: 0xffa050, intensity: 3.2, radius: 3.6, flicker: 0.2, priority: -1 }); }
      else if (k < P.banner + P.statue + P.candles) { this.place(C, R() < 0.5 ? 'candles' : 'candles_b', 0, x + 0.5 + d[0] * 0.2, z + 0.5 + d[1] * 0.2); }
      else continue;
      used.add(key); used.add((x + 1) + ',' + z); used.add(x + ',' + (z + 1)); used.add((x - 1) + ',' + z); used.add(x + ',' + (z - 1));
    }
    for (const r of this.rooms) {
      if (r === this.startRoom && R() < 0.5) continue;
      const area = r.w * r.h;
      if (area >= 30 && R() < 0.45) { const c = this.randomFloorInRoom(r, R, 2); if (c) put(C, 'cage', c[0], c[1], (R() * 4) | 0, true, { h: 2.6 }); }
      if (R() < (K.ossuary ? 0.5 : 0.3)) { const c = this.randomFloorInRoom(r, R, 1); if (c && this.cellFree(c[0], c[1] + 1) && canBlock([[c[0], c[1]], [c[0], c[1] + 1]])) { this.place(C, 'sarcophagus', 0, c[0] + 0.5, c[1] + 1, { block: true, cells: [[c[0], c[1]], [c[0], c[1] + 1]], h: 0.8, hw: 0.5 }); this.lightSrc.push({ x: c[0] + 0.5, y: 1.0, z: c[1] + 1, color: 0xffa050, intensity: 2.0, radius: 3, flicker: 0.2, priority: -1 }); } }
      if (R() < 0.5) { const c = this.randomFloorInRoom(r, R, 1); if (c) put(set, 'brazier', c[0], c[1], 0, true, { h: 1.1, lightColor: 0xff7a2c }); }
      for (let i = 0; i < (K.ossuary ? 3 : 1); i++) if (R() < 0.6) { const c = this.randomFloorInRoom(r, R, 0); if (c) { const cross = R() < 0.5; put(C, cross ? 'cross' : 'bonepile', c[0], c[1], (R() * 4) | 0, cross, { h: 1.1 }); } }
      if (R() < 0.5) { const c = this.randomFloorInRoom(r, R, 0); if (c) put(C, 'urns', c[0], c[1], (R() * 2) | 0, false); }
    }
  }
  // corridors: occasional rubble / bones
  for (let i = 0; i < 25; i++) {
    const x = R.int(1, this.w - 2), z = R.int(1, this.h - 2);
    if (!this.cellFree(x, z) || this.roomId[this.idx(x, z)] >= 0 || nearStairs(x, z)) continue;
    put(K.caves ? set : C, K.caves ? 'rocks' : (R() < 0.5 ? 'rubble' : 'bonepile'), x, z, (R() * 2) | 0, false);
  }
  // decals
  for (let i = 0; i < 26; i++) { const r = R.pick(this.rooms); const c = this.randomFloorInRoom(r, R, 0); if (c) this.decals.push({ type: 'blood', x: c[0] + R(), z: c[1] + R(), s: R.range(0.6, 1.8), rot: R() * TAU }); }
  if (K.crypt) for (let i = 0; i < 12; i++) { const r = R.pick(this.rooms); const c = this.randomFloorInRoom(r, R, 0); if (c) this.decals.push({ type: 'smear', x: c[0] + R(), z: c[1] + R(), s: R.range(0.8, 1.5), rot: R() * TAU }); }
  if (K.abyss || (K.ossuary && R() < 0.5)) { const r = R.pick(this.rooms); this.decals.push({ type: 'rune', x: r.cx, z: r.cz, s: 3.2 }); }
  // last pass: barrels, crates, chests and coffins become solid when spawned, but were set along the walls without the
  // connectivity guard -- in a doorway or a narrow passage they could seal it (with the graves beside them). Drop any
  // that would cut part of the level off.
  {
    const SOLID = new Set(['barrel', 'crate', 'chest', 'coffin']), W = this.w;
    const extra = new Set();
    const flood = () => {
      const seen = new Uint8Array(this.t.length), st = [this.floodStart()]; let n = 0;
      while (st.length) { const i = st.pop(); if (seen[i]) continue; const x = i % W, z = (i / W) | 0; if (!this.cellFree(x, z) || extra.has(i)) continue; seen[i] = 1; n++; st.push(i + 1, i - 1, i + W, i - W); }
      return n;
    };
    let base = flood();
    this.objects = this.objects.filter(o => {
      if (!SOLID.has(o.type)) return true;
      const i = this.idx(Math.floor(o.x), Math.floor(o.z));
      extra.add(i); const n = flood();
      if (n < base - 1) { extra.delete(i); return false; }
      base = n; return true;
    });
  }
};
