'use strict';
// The village of Ravenhollow: a night-time hamlet in a valley, the ruined chapel at its north edge.

const TOWN_W = 46, TOWN_H = 46;
const TOWN_NPCS = {
  greta: { name: 'Greta the Smith', title: 'Blacksmith', x: 29.6, z: 21.4, rot: -2.4 },
  ysolde: { name: 'Mother Ysolde', title: 'Healer', x: 15.6, z: 20.6, rot: 2.6 },
  osric: { name: 'Father Osric', title: 'Elder', x: 20.6, z: 21.0, rot: 2.2 },
  tam: { name: 'Tam the Peddler', title: 'Peddler', x: 28.6, z: 28.4, rot: -2.8 },
};
const T = 'town_town', CM = 'crypt_common';

function buildTown() {
  const L = new Level(0, 777);
  L.alloc(TOWN_W, TOWN_H);
  const N = makeNoise(9), R = RNG(4242);
  const cx = 23, cz = 23;
  for (let z = 0; z < TOWN_H; z++) for (let x = 0; x < TOWN_W; x++) {
    const r = 19.5 + N.perlin(x * 0.15, z * 0.15) * 2.5;
    if (Math.hypot(x - cx, z - cz) < r && x > 1 && z > 2 && x < TOWN_W - 2 && z < TOWN_H - 2) L.t[z * TOWN_W + x] = T_FLOOR;
  }
  L.finishWalls();
  L.rooms = [{ x: 18, z: 18, w: 10, h: 10, cx: 23, cz: 23, id: 0, type: 'square' }];
  L.startRoom = L.rooms[0];
  L.stairsUp = null; L.stairsDown = [22, 4];
  L.townSpawn = [23.5, 25.5];
  L.kit = { set: T, torch: 0xffa050 };
  L.statics = []; L.fires = []; L.lightSrc = [];
  L.occ = new Uint8Array(TOWN_W * 4 * TOWN_H * 4);
  const block = (x0, z0, w, d) => { for (let z = Math.floor(z0); z < Math.ceil(z0 + d); z++) for (let x = Math.floor(x0); x < Math.ceil(x0 + w); x++) if (L.get(x, z) === T_FLOOR) L.block[L.idx(x, z)] = 1; };
  const add = (s, p, x, z, d = 0, o = {}) => { const e = L.place(s, p, d, x, z, o); if (o.block) { block(x - o.block[0] / 2, z - o.block[1] / 2, o.block[0], o.block[1]); if (o.h) L.occRect(x - o.block[0] / 2, z - o.block[1] / 2, x + o.block[0] / 2, z + o.block[1] / 2, o.h); } return e; };
  // ---- cobblestone paths ----
  const pathCells = new Set();
  const paint = (x0, z0, x1, z1, w) => {
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) * 2);
    for (let i = 0; i <= n; i++) {
      const t = i / n, px = lerp(x0, x1, t), pz = lerp(z0, z1, t);
      for (let dz = -w; dz <= w; dz++) for (let dx = -w; dx <= w; dx++) { const x = Math.floor(px + dx), z = Math.floor(pz + dz); if (Math.hypot(dx, dz) <= w + N.perlin(x * 0.4, z * 0.4) * 0.7 && L.get(x, z) === T_FLOOR) pathCells.add(z * TOWN_W + x); }
    }
  };
  paint(23, 42, 23, 26, 0.9); paint(23, 22, 23, 6, 0.9); paint(6, 24, 40, 24, 0.8); paint(23, 23, 30, 20, 0.7); paint(23, 23, 16, 19, 0.7); paint(23, 25, 29, 29, 0.6);
  for (let z = 19; z <= 27; z++) for (let x = 19; x <= 27; x++) if (Math.hypot(x - 23, z - 23.5) < 3.4 + N.perlin(x * 0.5, z * 0.5)) pathCells.add(z * TOWN_W + x);
  const nearPath = (x, z) => { for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (pathCells.has((z + dz) * TOWN_W + x + dx)) return true; return false; };
  // ---- ground and the rocky rim ----
  const open = (x, z) => L.get(x, z) === T_FLOOR;
  for (let z = 0; z < TOWN_H; z++) for (let x = 0; x < TOWN_W; x++) {
    const v = L.get(x, z), px = x + 0.5, pz = z + 0.5;
    if (v === T_FLOOR) {
      const idx = z * TOWN_W + x;
      let p;
      if (pathCells.has(idx)) p = 'cobble';
      else if (nearPath(x, z) && R() < 0.6) p = 'cobble_edge';
      else { const n = N.perlin(x * 0.18 + 3, z * 0.18); p = n > 0.25 ? 'mud' : R() < 0.35 ? 'grass_b' : 'grass'; }
      L.place(T, p, (R() * 4) | 0, px, pz);
    } else if (v === T_WALL) {
      const low = open(x - 1, z) || open(x, z - 1) || open(x - 1, z - 1);
      if (low && !(open(x + 1, z) || open(x, z + 1))) { L.place(T, 'cliff_low', (R() * 4) | 0, px, pz); L.occRect(x, z, x + 1, z + 1, 0.5); }
      else { L.place(T, 'cliff', (R() * 4) | 0, px, pz, { cut: true }); L.occRect(x, z, x + 1, z + 1, 1.7); }
    }
  }
  // ---- houses (footprints swap at 90 degrees) ----
  const house = (piece, x, z, w, d, dir, lit, opts = {}) => {
    const sw = dir % 2 ? d : w, sd = dir % 2 ? w : d;
    add(T, piece, x, z, dir, { block: [sw, sd], h: 3.6, cut: true });
    if (lit) { const a = dir * Math.PI / 2, fx = x + Math.sin(a) * (d / 2 + 0.7), fz = z + Math.cos(a) * (d / 2 + 0.7); L.lightSrc.push({ x: fx, y: 1.2, z: fz, color: 0xff9a50, intensity: 3.2, radius: 4.5, flicker: 0.1 }); }
    const ex = META[T] && META[T].anims[piece] && META[T].anims[piece].extra;
    if (ex && ex.chimney) { const q = rotOff(ex.chimney, dir, 4); L.fires.push({ smoke: true, x: x + q[0], y: q[1], z: z + q[2] }); }
  };
  house('house_a', 31.5, 17.5, 4.2, 3.4, 3, true);          // smithy
  house('house_d', 14.0, 16.8, 4.6, 3.4, 0, true);          // healer
  house('house_b', 15.5, 30.5, 3.6, 3.0, 2, true);          // elder's house
  house('house_c', 9.5, 23.5, 3.4, 3.0, 1, false);
  house('house_b', 35.5, 27.5, 3.6, 3.0, 3, false);
  house('house_c', 11.0, 10.5, 3.4, 3.0, 0, false);
  house('house_a', 31.0, 34.5, 4.2, 3.4, 2, true);
  house('house_c', 20.0, 36.5, 3.4, 3.0, 2, false);
  // ---- smithy yard ----
  add(T, 'forge', 33.6, 21.0, 3, { block: [1.2, 1.4], h: 1.2 });
  add(T, 'anvil', 31.4, 21.8, 0, { block: [0.7, 0.7] });
  add(CM, 'barrel', 34.2, 19.2, 0, { block: [0.6, 0.6] }); add(CM, 'crate', 34.3, 23.3, 0, { block: [0.6, 0.6] });
  // ---- healer's garden ----
  add(T, 'cauldron', 17.0, 18.6, 0, { block: [0.8, 0.8] });
  L.lightSrc.push({ x: 17.0, y: 0.8, z: 18.6, color: 0x80ff60, intensity: 2.5, radius: 3.5, flicker: 0.2 }); L.fires.push({ x: 17.0, y: 0.08, z: 18.6, size: 0.6 });
  // ---- town square ----
  add(T, 'well', 23.5, 24.0, 0, { block: [1.4, 1.4], h: 2 });
  add(T, 'waystone', 26.8, 21.2, 0, { block: [1.2, 1.2], h: 2 });
  L.waystone = { x: 26.8, z: 21.2 };
  L.lightSrc.push({ x: 26.8, y: 2.2, z: 21.6, color: 0x6080ff, intensity: 3, radius: 4, flicker: 0.05 });
  add(T, 'campfire', 19.2, 26.8, 0, { block: [1, 1] });
  add(T, 'hay', 17.4, 27.6, 0); add(T, 'hay', 20.6, 28.6, 1);
  add(T, 'cart', 30.6, 29.6, 1, { block: [1.6, 1.6], h: 1.2 });
  add(T, 'sacks', 29.6, 30.8, 0); add(T, 'sacks', 31.6, 28.4, 1); add(CM, 'crate', 32.0, 30.6, 1, { block: [0.6, 0.6] });
  for (const [x, z, d] of [[21.0, 31.0, 0], [25.5, 14.0, 2], [27.0, 25.8, 3], [12.0, 24.8, 1], [35.0, 24.8, 2]]) { add(T, 'lamp', x, z, d, { block: [0.5, 0.5], h: 2.3 }); }
  // ---- graveyard ----
  for (let i = 0; i < 16; i++) {
    const gx = 30 + (i % 4) * 1.6 + R() * 0.3, gz = 6.5 + Math.floor(i / 4) * 1.5 + R() * 0.3;
    if (L.get(Math.floor(gx), Math.floor(gz)) !== T_FLOOR) continue;
    add(T, 'tomb' + (i % 3), gx, gz, (R() * 4) | 0, { block: [0.5, 0.4], h: 0.8 });
  }
  for (let i = 0; i < 7; i++) add(T, 'fence', 29.5 + i, 13.3, 0);
  add(T, 'tree0', 36.5, 8.5, 0, { block: [0.6, 0.6], h: 3 }); add(T, 'tree2', 28.5, 6.0, 1, { block: [0.6, 0.6], h: 3 });
  L.lightSrc.push({ x: 33.0, y: 1.0, z: 9.0, color: 0x6ab0a0, intensity: 1.5, radius: 6, flicker: 0.1 });
  // ---- the chapel ruin and the way down ----
  add(T, 'chapel', 23.0, 4.6, 0, { noLights: false });
  block(20.4, 3.8, 5.2, 0.8); L.occRect(20.4, 3.8, 25.6, 4.6, 4.5);
  block(22, 4, 2, 1.4);
  for (const [x, z, p] of [[19.5, 7.5, 'rock'], [26.5, 7.3, 'rock']]) add(T, p, x, z, (R() * 4) | 0, { block: [0.6, 0.6] });
  add(CM, 'rubble', 21.0, 6.5, 0); add(CM, 'rubble', 25.6, 6.0, 1); add(CM, 'rubble', 18.0, 5.0, 0);
  for (const [x, z] of [[17.6, 9.2], [16.4, 11.0], [28.4, 10.6], [19.0, 12.6], [27.2, 12.4]]) if (L.get(Math.floor(x), Math.floor(z)) === T_FLOOR) add(CM, 'cross', x, z, (R() * 4) | 0, { block: [0.5, 0.4], h: 1.1 });
  add(CM, 'cage', 15.6, 13.4, 1, { block: [0.6, 0.6], h: 2.6 });
  // ---- trees: dead oaks and black pines along the rim ----
  for (const [x, z, k] of [[18.0, 15.0, 2], [29.6, 15.2, 1], [8.6, 18.6, 0], [38.2, 30.6, 1], [12.6, 34.6, 2]]) if (L.get(Math.floor(x), Math.floor(z)) === T_FLOOR) add(T, 'tree' + k, x, z, (R() * 4) | 0, { block: [0.6, 0.6], h: 3 });
  for (let i = 0; i < 70; i++) {
    const a = R() * TAU, rr = 17 + R() * 4;
    const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
    const ix = Math.floor(x), iz = Math.floor(z);
    if (L.get(ix, iz) !== T_FLOOR || L.block[L.idx(ix, iz)] || pathCells.has(iz * TOWN_W + ix)) continue;
    if (Math.abs(x - 23) < 4 && z < 10) continue;
    if (R() < 0.6) add(T, 'tree' + R.int(0, 2), x, z, (R() * 4) | 0, { block: [0.6, 0.6], h: 3 });
    else add(T, 'pine', x, z, (R() * 2) | 0, { block: [0.6, 0.6], h: 3.5 });
  }
  for (let i = 0; i < 25; i++) { const x = R.range(5, 41), z = R.range(5, 41); const ix = Math.floor(x), iz = Math.floor(z); if (L.get(ix, iz) === T_FLOOR && !pathCells.has(iz * TOWN_W + ix) && !L.block[L.idx(ix, iz)]) { const rk = R() < 0.5; add(rk ? T : CM, rk ? 'rock' : 'rubble', x, z, (R() * 2) | 0); } }
  for (let i = 0; i < 5; i++) add(T, 'fence', 7.5 + i, 28.5, 0);
  for (let i = 0; i < 4; i++) add(T, 'fence', 37.5, 18.5 + i, 1);
  return L;
}

function spawnTownNPCs() {
  WORLD.npcs = [];
  for (const id in TOWN_NPCS) {
    const d = TOWN_NPCS[id];
    const v = new SpriteVis('villager_' + id, { stride: 1.3 });
    const npc = { id, name: d.name, title: d.title, x: d.x, z: d.z, rot: d.rot, vis: v, r: 0.9 };
    v.obj.position.set(d.x, 0, d.z); v.obj.rotation.y = d.rot; v.cur = d.rot;
    WORLD.root.add(v.obj);
    WORLD.npcs.push(npc);
    const L = WORLD.level; L.block[L.idx(Math.floor(d.x), Math.floor(d.z))] = 1;
  }
}
