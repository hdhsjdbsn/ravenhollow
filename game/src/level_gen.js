'use strict';
// Dungeon generation + geometry building.

const T_VOID = 0, T_FLOOR = 1, T_WALL = 2, T_LAVA = 3, T_WATER = 4;

const ZONES = {
  town: {
    name: 'Ravenhollow', wallH: 1.0, ambient: 0x5a5470, ambientI: 0.1, hemiI: 0.22, hemiSky: 0x9a6458, hemiGround: 0x1a1612,
    sun: [0xff9060, 0.85], grade: { lift: [0.006, 0.007, 0.016], gain: [1.1, 0.97, 0.88], sat: 0.72, vignette: 0.68, contrast: 0.26 },
    playerLight: [0xffd8a8, 7, 7.5], music: 'town',
  },
  abbey: {
    name: 'The Sunken Abbey', wallH: 2.3, ambient: 0x7a6a5e, ambientI: 0.034, hemiI: 0.03, gen: 'rooms',
    grade: { lift: [0.011, 0.006, 0.003], gain: [1.1, 0.97, 0.84], sat: 0.74, vignette: 0.74, contrast: 0.32 },
    torch: 0xff7a2c, playerLight: [0xffbf80, 13, 9], music: 'abbey', corridor: 2,
  },
  catacombs: {
    name: 'The Ossuary', wallH: 2.1, ambient: 0x6c6056, ambientI: 0.03, hemiI: 0.026, gen: 'rooms',
    grade: { lift: [0.010, 0.005, 0.003], gain: [1.08, 0.96, 0.84], sat: 0.68, vignette: 0.76, contrast: 0.34 },
    torch: 0xff6a24, torch2: 0xffa050, playerLight: [0xffbf80, 12.5, 8.8], music: 'catacombs', corridor: 2, small: true,
  },
  caves: {
    name: 'The Hollow Deep', wallH: 2.0, ambient: 0x705a40, ambientI: 0.035, hemiI: 0.04, gen: 'caves',
    grade: { lift: [0.012, 0.006, 0.002], gain: [1.07, 0.97, 0.86], sat: 0.8, vignette: 0.7, contrast: 0.28 },
    torch: 0xff9a40, playerLight: [0xffc890, 14, 9.5], music: 'caves', rocky: true,
  },
  abyss: {
    name: 'The Burning Abyss', wallH: 2.2, ambient: 0x902818, ambientI: 0.035, hemiI: 0.03, gen: 'caves',
    grade: { lift: [0.02, 0.003, 0.0], gain: [1.12, 0.92, 0.82], sat: 0.9, vignette: 0.7, contrast: 0.3 },
    torch: 0xff5020, playerLight: [0xffb080, 12, 9], music: 'abyss', rocky: true, lava: true,
  },
};
function zoneForDepth(d) { return d === 0 ? 'town' : d <= 3 ? 'abbey' : d <= 6 ? 'catacombs' : d <= 9 ? 'caves' : 'abyss'; }

class Level {
  constructor(depth, seed) {
    this.depth = depth; this.seed = seed; this.zoneName = zoneForDepth(depth); this.zone = ZONES[this.zoneName];
    this.rng = RNG(seed);
    this.props = []; this.lightSrc = []; this.spawns = []; this.objects = []; this.decals = [];
    this.rooms = [];
  }
  idx(x, z) { return z * this.w + x; }
  get(x, z) { return (x < 0 || z < 0 || x >= this.w || z >= this.h) ? T_VOID : this.t[z * this.w + x]; }
  set(x, z, v) { if (x >= 0 && z >= 0 && x < this.w && z < this.h) this.t[z * this.w + x] = v; }
  isFloor(x, z) { return this.get(x, z) === T_FLOOR; }
  walkable(x, z) { const ix = Math.floor(x), iz = Math.floor(z); return this.get(ix, iz) === T_FLOOR && !this.block[iz * this.w + ix]; }
  cellFree(ix, iz) { return this.get(ix, iz) === T_FLOOR && !this.block[iz * this.w + ix]; }
  blocksSight(ix, iz) { const v = this.get(ix, iz); return v === T_WALL || v === T_VOID; }
  // Walls on the camera side of open space are drawn low so rooms stay readable.
  isLowWall(x, z) {
    const open = (xx, zz) => { const v = this.get(xx, zz); return v === T_FLOOR || v === T_LAVA || v === T_WATER; };
    return open(x - 1, z) || open(x, z - 1) || open(x - 1, z - 1);
  }

  alloc(w, h) { this.w = w; this.h = h; this.t = new Uint8Array(w * h); this.block = new Uint8Array(w * h); this.explored = new Uint8Array(w * h); this.roomId = new Int16Array(w * h).fill(-1); }

  // ---------------- generators ----------------
  genRooms() {
    const R = this.rng, small = !!this.zone.small;
    const W = small ? 64 : 72, H = small ? 64 : 72;
    this.alloc(W, H);
    const rooms = [];
    const tries = 400;
    const want = small ? 16 : 12;
    // a big "nave" first (abbey only)
    if (!small) {
      const w = R.int(11, 15), h = R.int(8, 10);
      rooms.push({ x: R.int(15, W - w - 15), z: R.int(15, H - h - 15), w, h, type: 'nave' });
    }
    for (let i = 0; i < tries && rooms.length < want; i++) {
      const w = small ? R.int(4, 8) : R.int(5, 10), h = small ? R.int(4, 8) : R.int(5, 9);
      const x = R.int(2, W - w - 3), z = R.int(2, H - h - 3);
      let ok = true;
      for (const r of rooms) if (x < r.x + r.w + 4 && x + w + 4 > r.x && z < r.z + r.h + 4 && z + h + 4 > r.z) { ok = false; break; }
      if (ok) rooms.push({ x, z, w, h, type: 'room' });
    }
    rooms.forEach((r, i) => {
      r.id = i; r.cx = r.x + r.w / 2; r.cz = r.z + r.h / 2;
      for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) { this.set(x, z, T_FLOOR); this.roomId[this.idx(x, z)] = i; }
    });
    // connect with MST (Prim) + a few extra loops
    const conn = new Set([0]); const edges = [];
    while (conn.size < rooms.length) {
      let best = null, bd = 1e9;
      for (const a of conn) for (let b = 0; b < rooms.length; b++) {
        if (conn.has(b)) continue;
        const d = Math.abs(rooms[a].cx - rooms[b].cx) + Math.abs(rooms[a].cz - rooms[b].cz);
        if (d < bd) { bd = d; best = [a, b]; }
      }
      conn.add(best[1]); edges.push(best);
    }
    for (let k = 0; k < 3; k++) { const a = R.int(0, rooms.length - 1), b = R.int(0, rooms.length - 1); if (a !== b) edges.push([a, b]); }
    const cw = this.zone.corridor || 2;
    for (const [a, b] of edges) this.carveCorridor(rooms[a], rooms[b], cw, R);
    this.rooms = rooms;
    this.finishWalls();
    // special rooms
    rooms.forEach(r => { if (r.type !== 'nave') r.type = R.pick(small ? ['crypt', 'crypt', 'ossuary', 'tomb', 'prison', 'room'] : ['chapel', 'library', 'storage', 'hall', 'crypt', 'room']); });
  }
  carveCorridor(a, b, w, R) {
    let x = Math.floor(a.cx), z = Math.floor(a.cz);
    const tx = Math.floor(b.cx), tz = Math.floor(b.cz);
    const horizFirst = R() < 0.5;
    const carve = (x, z) => { for (let dz = 0; dz < w; dz++) for (let dx = 0; dx < w; dx++) if (this.get(x + dx, z + dz) !== T_FLOOR && x + dx > 0 && z + dz > 0 && x + dx < this.w - 1 && z + dz < this.h - 1) this.set(x + dx, z + dz, T_FLOOR); };
    const stepX = () => { while (x !== tx) { carve(x, z); x += Math.sign(tx - x); } };
    const stepZ = () => { while (z !== tz) { carve(x, z); z += Math.sign(tz - z); } };
    if (horizFirst) { stepX(); stepZ(); } else { stepZ(); stepX(); }
    carve(x, z);
  }
  genCaves() {
    const R = this.rng;
    const W = 72, H = 72;
    this.alloc(W, H);
    let g = new Uint8Array(W * H);
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) g[z * W + x] = (x < 2 || z < 2 || x > W - 3 || z > H - 3) ? 1 : (R() < 0.45 ? 1 : 0);
    for (let it = 0; it < 5; it++) {
      const n = new Uint8Array(W * H);
      for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
        let c = 0;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, zz = z + dz; c += (xx < 0 || zz < 0 || xx >= W || zz >= H) ? 1 : g[zz * W + xx]; }
        n[z * W + x] = (x < 2 || z < 2 || x > W - 3 || z > H - 3) ? 1 : (c >= 5 ? 1 : 0);
      }
      g = n;
    }
    for (let i = 0; i < W * H; i++) this.t[i] = g[i] ? T_VOID : T_FLOOR;
    // erode thin walls to widen passages
    // keep largest region
    this.keepLargestRegion();
    // carve some chambers as "rooms" for spawn/decor purposes
    const floors = [];
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (this.t[z * W + x] === T_FLOOR) floors.push([x, z]);
    const rooms = [];
    for (let i = 0; i < 300 && rooms.length < 14; i++) {
      const [x, z] = R.pick(floors);
      if (rooms.some(r => Math.abs(r.cx - x) + Math.abs(r.cz - z) < 12)) continue;
      // open a small chamber
      const rw = R.int(3, 5);
      for (let dz = -rw; dz <= rw; dz++) for (let dx = -rw; dx <= rw; dx++) if (dx * dx + dz * dz <= rw * rw && x + dx > 1 && z + dz > 1 && x + dx < W - 2 && z + dz < H - 2) this.set(x + dx, z + dz, T_FLOOR);
      rooms.push({ x: x - rw, z: z - rw, w: rw * 2 + 1, h: rw * 2 + 1, cx: x + 0.5, cz: z + 0.5, id: rooms.length, type: R.pick(['cave', 'cave', 'nest', 'pool', 'camp']) });
    }
    rooms.forEach(r => { for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) if (this.isFloor(x, z)) this.roomId[this.idx(x, z)] = r.id; });
    this.rooms = rooms;
    if (this.zone.lava) this.addLava(R);
    this.finishWalls();
  }
  addLava(R) {
    // lava pools in some open areas; validated so the map stays connected
    for (let k = 0; k < 10; k++) {
      const r = R.pick(this.rooms); if (!r) break;
      const cx = Math.floor(r.cx + R.int(-2, 2)), cz = Math.floor(r.cz + R.int(-2, 2)), rad = R.range(1.2, 2.4);
      const changed = [];
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
        if (dx * dx + dz * dz > rad * rad) continue;
        const x = cx + dx, z = cz + dz;
        if (this.isFloor(x, z)) { changed.push([x, z]); this.set(x, z, T_LAVA); }
      }
      if (!this.isConnected()) changed.forEach(([x, z]) => this.set(x, z, T_FLOOR));
      else r.lava = true;
    }
  }
  floodFrom(sx, sz, mark) {
    const W = this.w, st = [[sx, sz]]; mark[sz * W + sx] = 1; let n = 1;
    while (st.length) {
      const [x, z] = st.pop();
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, zz = z + dz, i = zz * W + xx;
        if (xx < 0 || zz < 0 || xx >= W || zz >= this.h || mark[i] || this.t[i] !== T_FLOOR) continue;
        mark[i] = 1; n++; st.push([xx, zz]);
      }
    }
    return n;
  }
  isConnected() {
    let total = 0, sx = -1, sz = -1;
    for (let i = 0; i < this.t.length; i++) if (this.t[i] === T_FLOOR) { total++; if (sx < 0) { sx = i % this.w; sz = Math.floor(i / this.w); } }
    if (sx < 0) return false;
    return this.floodFrom(sx, sz, new Uint8Array(this.t.length)) === total;
  }
  keepLargestRegion() {
    const W = this.w, mark = new Uint8Array(this.t.length);
    let best = null, bestN = 0;
    for (let i = 0; i < this.t.length; i++) {
      if (this.t[i] !== T_FLOOR || mark[i]) continue;
      const m2 = new Uint8Array(this.t.length);
      const n = this.floodFrom(i % W, Math.floor(i / W), m2);
      for (let j = 0; j < m2.length; j++) if (m2[j]) mark[j] = 1;
      if (n > bestN) { bestN = n; best = m2; }
    }
    for (let i = 0; i < this.t.length; i++) if (this.t[i] === T_FLOOR && !best[i]) this.t[i] = T_VOID;
  }
  finishWalls() {
    const W = this.w, H = this.h;
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      if (this.t[z * W + x] !== T_VOID) continue;
      let adj = false;
      for (let dz = -1; dz <= 1 && !adj; dz++) for (let dx = -1; dx <= 1; dx++) { const v = this.get(x + dx, z + dz); if (v === T_FLOOR || v === T_LAVA || v === T_WATER) { adj = true; break; } }
      if (adj) this.t[z * W + x] = T_WALL;
    }
  }

  generate() {
    if (this.zone.gen === 'caves') this.genCaves(); else this.genRooms();
    this.placeStairs();
  }

  randomFloorInRoom(r, R, margin = 1) {
    for (let i = 0; i < 60; i++) {
      const x = R.int(r.x + margin, r.x + r.w - 1 - margin), z = R.int(r.z + margin, r.z + r.h - 1 - margin);
      if (this.cellFree(x, z)) return [x, z];
    }
    return null;
  }
  placeStairs() {
    const R = this.rng;
    // up-stairs in one room, down-stairs in the farthest room (by BFS distance)
    const startRoom = this.rooms[R.int(0, this.rooms.length - 1)];
    this.startRoom = startRoom;
    const sp = this.findStairSpot(startRoom, R);
    this.stairsUp = sp;
    const dist = this.bfs(sp[0], sp[1]);
    let far = null, fd = -1;
    for (const r of this.rooms) {
      if (r === startRoom) continue;
      const d = dist[this.idx(Math.floor(r.cx), Math.floor(r.cz))];
      if (d > fd) { fd = d; far = r; }
    }
    this.endRoom = far || startRoom;
    if (this.depth < 12) this.stairsDown = this.findStairSpot(this.endRoom, R);
    else this.stairsDown = null;
  }
  findStairSpot(r, R) {
    // need a 2x2 free floor block with floor in front (+z)
    for (let i = 0; i < 200; i++) {
      const x = R.int(r.x, r.x + r.w - 2), z = R.int(r.z, r.z + r.h - 3);
      let ok = true;
      for (let dz = -1; dz <= 3 && ok; dz++) for (let dx = -1; dx <= 2; dx++) if (!this.isFloor(x + dx, z + dz)) { ok = false; break; }
      if (ok) return [x, z];
    }
    // fallback: center
    return [Math.floor(r.cx), Math.floor(r.cz)];
  }
  bfs(sx, sz, maxD = 9999) {
    const W = this.w, d = new Int32Array(this.t.length).fill(1e9);
    const q = new Int32Array(this.t.length); let qh = 0, qt = 0;
    d[sz * W + sx] = 0; q[qt++] = sz * W + sx;
    while (qh < qt) {
      const i = q[qh++], x = i % W, z = (i / W) | 0, nd = d[i] + 1;
      if (nd > maxD) continue;
      for (let k = 0; k < 4; k++) {
        const xx = x + (k === 0 ? 1 : k === 1 ? -1 : 0), zz = z + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (xx < 0 || zz < 0 || xx >= W || zz >= this.h) continue;
        const j = zz * W + xx;
        if (d[j] <= nd || this.t[j] !== T_FLOOR) continue;
        d[j] = nd; q[qt++] = j;
      }
    }
    return d;
  }

  // ---------------- monster spawns ----------------
  planSpawns(table) {
    const R = this.rng;
    for (const r of this.rooms) {
      if (r === this.startRoom) continue;
      const packs = r.w * r.h > 50 ? R.int(1, 3) : R.int(0, 2);
      for (let p = 0; p < packs; p++) {
        const c = this.randomFloorInRoom(r, R, 0); if (!c) continue;
        const def = R.weighted(table, e => e.w);
        const n = R.int(def.pack[0], def.pack[1]);
        for (let i = 0; i < n; i++) {
          const x = c[0] + R.range(-1.5, 1.5), z = c[1] + R.range(-1.5, 1.5);
          if (this.walkable(x, z)) this.spawns.push({ type: def.type, x, z });
        }
      }
    }
    // corridor wanderers
    for (let i = 0; i < 6; i++) {
      const x = R.int(1, this.w - 2), z = R.int(1, this.h - 2);
      if (!this.cellFree(x, z) || this.roomId[this.idx(x, z)] >= 0) continue;
      const s = this.stairsUp; if (s && Math.abs(s[0] - x) + Math.abs(s[1] - z) < 10) continue;
      this.spawns.push({ type: R.weighted(table, e => e.w).type, x: x + 0.5, z: z + 0.5 });
    }
  }
}

// Line of sight on the tile grid (DDA)
function hasLOS(level, x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0, d = Math.hypot(dx, dz);
  const steps = Math.ceil(d * 3);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (level.blocksSight(Math.floor(x0 + dx * t), Math.floor(z0 + dz * t))) return false;
  }
  return true;
}

