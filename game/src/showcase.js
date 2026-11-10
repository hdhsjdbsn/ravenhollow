'use strict';
// Graphics test room (2026-11-10): one hand-built ossuary chamber laid out like the environment concept sheet, on the
// re-baked ashlar kit (crypt_ashen) and the "v2" look (world-space stone detail, standing water with mirror
// reflections, colder shadows / hotter lights). Reached from test.html and from the title menu. The normal game
// does not use any of this yet.
ZONES.ashen = Object.assign({}, ZONES.catacombs, { name: 'The Ashen Ossuary' });
KITS.ashen = { set: 'crypt_ashen', floors: [['floor', 12], ['floor_crack', 3], ['floor_debris', 2], ['floor_bones', 2]], walls: [['wall', 10], ['wall_b', 3]], low: 'wall_low', torch: 0xff7a2c, crypt: true, ossuary: true };
LOOK.ashen = { amb: [0.016, 0.02, 0.028], fog: 0.002, fogTop: 3.4, fogCol: [0.004, 0.005, 0.007], mist: 0.55, grime: 0.55, wet: 0.55, sat: 0.8, gain: [1.0, 1.0, 1.0], lift: [0.0, 0.0015, 0.004], expo: 0.9,
  lantern: [1, 0.64, 0.34, 5.5, 8], v2: 1, bloom: 0.8, sharp: 0.28 };
ZONE_SETS.ashen = ['crypt_ashen', 'crypt_common', 'skeleton', 'risen'];

Level.prototype.genShowcase = function () {
  this.alloc(24, 24);                 // square: the occluder map's shader lookup assumes it
  const room = { x: 4, z: 4, w: 13, h: 11, type: 'showcase', id: 0 }; room.cx = room.x + room.w / 2; room.cz = room.z + room.h / 2;
  const carve = (x0, z0, x1, z1, id = -1) => { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { this.set(x, z, T_FLOOR); if (id >= 0) this.roomId[this.idx(x, z)] = id; } };
  carve(4, 4, 16, 14, 0);
  carve(9, 1, 10, 3);            // passage north, into the dark
  carve(1, 8, 3, 10);            // side cell behind an arch in the west wall
  this.rooms = [room]; this.startRoom = this.endRoom = room; this.stairsUp = null; this.stairsDown = null;
  this.finishWalls();
};
Level.prototype.decorateShowcase = function () {
  const S = 'crypt_ashen';
  const wall = (x, z, p, d) => { const e = this.statics.find(s => Math.floor(s.x) === x && Math.floor(s.z) === z && s.p.startsWith('wall')); if (e) { e.p = p; e.d = d; } };
  const put = (p, x, z, d = 0, o = {}) => this.place(S, p, d, x, z, o);
  // far walls: skull niches, a shrine, stacked bones (north wall faces +z = dir 0, west wall faces +x = dir 1)
  for (const [x, p] of [[5, 'wall_niche'], [6, 'wall_niche'], [8, 'wall_b'], [12, 'wall_shrine'], [14, 'wall_bones'], [15, 'wall_bones'], [16, 'wall_b']]) wall(x, 3, p, 0);
  for (const [z, p] of [[5, 'wall_bones'], [6, 'wall_niche'], [7, 'wall_niche'], [11, 'wall_b'], [12, 'wall_niche'], [13, 'wall_niche']]) wall(3, z, p, 1);
  { const ex = META[S].anims.wall_shrine.extra; if (ex && ex.flames) { for (const f of ex.flames) this.fires.push({ x: 12.5 + f[0], y: f[1], z: 3.5 + f[2], size: f[3] }); this.lightSrc.push({ x: 12.5, y: 0.9, z: 4.35, color: 0xffa050, intensity: 3.4, radius: 3.6, flicker: 0.2, priority: 1 }); } }
  // sconces on the far walls
  put('sconce', 7.5, 4.5, 0, { lightColor: 0xff6420 }); put('sconce', 15.5, 4.5, 0, { lightColor: 0xff6420 });
  put('sconce', 4.5, 5.5, 1, { lightColor: 0xff6420 }); put('sconce', 4.5, 13.5, 1, { lightColor: 0xff6420 });
  // four pillars around the tomb
  for (const [x, z] of [[7, 7], [13, 7], [7, 11], [13, 11]]) put(x === 13 && z === 11 ? 'pillar_broken' : 'pillar', x + 0.5, z + 0.5, 0, { block: true, h: 2.6, cut: true });
  // the tomb in the middle, candles at its foot
  this.objects.push({ type: 'sarcophagus', x: 10.5, z: 9.5, rot: 0, set: S }); this.block[this.idx(10, 9)] = 1; this.block[this.idx(10, 8)] = 1;
  this.occRect(10.05, 8.5, 10.95, 10.5, 0.75);
  put('candles_b', 11.5, 10.6); put('candles', 9.4, 8.4);
  // braziers
  put('brazier', 5.5, 12.5, 0, { block: true, h: 1, lightColor: 0xff6a24 }); put('brazier', 12.5, 5.6, 0, { block: true, h: 1, lightColor: 0xff6a24 }); put('brazier', 15.5, 10.5, 0, { block: true, h: 1, lightColor: 0xff6a24 });
  // hanging cage, grave cross with candles, bones, urns, rubble along the open edges
  put('hangcage', 8.5, 5.4, 0);
  put('cross', 14.5, 12.5, 0, { block: true, h: 1.2 }); put('candles', 13.6, 12.9); put('candles_b', 15.3, 13.3);
  put('skullpile', 4.5, 9.5, 0); put('bonepile', 4.6, 14.4, 1); put('bonepile', 15.5, 6.5, 0); put('skullpile', 2.5, 9.5, 1); put('candles_b', 1.6, 8.6);
  put('urns', 16.4, 4.6, 0); put('urns', 5.4, 4.5, 1);
  for (const [x, z, d] of [[16.4, 13.5, 0], [14.5, 14.5, 1], [6.5, 14.5, 0], [16.5, 9.5, 1], [9.5, 2.5, 0]]) put('rubble', x, z, d);
  put('chains', 10.5, 4.5, 0); put('web', 4.5, 4.5, 0);
  this.objects.push({ type: 'chest', x: 16.5, z: 7.5, rot: 1, set: S });
  // old blood
  for (const [x, z, s] of [[9.2, 11.6, 1.6], [12.2, 9.0, 1.1], [6.3, 9.4, 1.3], [14.2, 6.2, 0.9], [11.0, 13.6, 1.2], [8.2, 6.6, 0.8]]) this.decals.push({ type: 'blood', x, z, s, rot: x * 3.1 });
  this.decals.push({ type: 'smear', x: 10.4, z: 12.4, s: 1.4, rot: 0.4 });
  for (const l of this.lightSrc) l.intensity *= 0.6;
  // something waits in the passage
  for (const [x, z, t] of [[9.6, 1.6, 'cryptGuard'], [10.4, 2.2, 'thrall'], [9.8, 2.8, 'thrall'], [1.6, 9.4, 'risen'], [2.4, 8.6, 'risen']]) this.spawns.push({ type: t, x, z });
};
function buildShowcaseLevel() {
  const L = new Level(4, 20261110); L.zoneName = 'ashen'; L.zone = ZONES.ashen; L.showcase = true;
  L.genShowcase(); L.buildTiles(); L.decorateShowcase();
  return L;
}
