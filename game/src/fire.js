'use strict';
// living fire (Ember, Lantern Flare, burning foes, Smite) -- shared design with the action fork (src_action/action.js)
// Built from the renderer's own pieces: the procedural flame shader the torches use (tongues that lick and gutter),
// additive ribbons, sparks that cool from white-gold to dull red as they fall, soot smoke, scorched floor, heat haze
// and flickering light. Every cast rolls its own temper, so no two look alike.
const FIRE = { timed: [], rings: [], glows: [], hazes: [], strokes: [], timers: [] };
FIRE.later = (t, fn) => FIRE.timers.push({ t, fn });
const rr = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
// fire tempers: [core tint, outer tint, spark colour, trail colour]
const TEMPERS = [
  { core: [1.0, 0.45, 0.12], outer: [0.6, 0.07, 0.008], spark: [1.7, 0.62, 0.14], cool: [0.5, 0.05, 0.0], trail: [1.3, 0.38, 0.07] },    // lantern orange
  { core: [1.0, 0.6, 0.22], outer: [0.7, 0.16, 0.015], spark: [1.8, 0.95, 0.32], cool: [0.55, 0.1, 0.01], trail: [1.4, 0.7, 0.18] },      // white-gold, holy
  { core: [0.95, 0.3, 0.06], outer: [0.45, 0.03, 0.005], spark: [1.5, 0.4, 0.08], cool: [0.4, 0.02, 0.0], trail: [1.2, 0.22, 0.04] },   // deep blood-red ember
];
const jitter = (c, k = 0.08) => c.map(v => Math.max(0, v * (1 + (Math.random() - 0.5) * k * 2)));
function temper(bias) { const T = bias != null ? TEMPERS[bias] : pick(TEMPERS); return { core: jitter(T.core), outer: jitter(T.outer), spark: jitter(T.spark, 0.12), cool: T.cool, trail: jitter(T.trail, 0.1) }; }
// a flame tongue that lives for dur seconds (o.follow: an entity it rides on)
FIRE.flame = function (x, y, z, o) {
  const f = Object.assign({ x, y, z, t: -(o.delay || 0), dur: 0.5, w: 16, h: 30, g: 1.05, glow: 0.55, seed: Math.random() * 100, tongues: 2, lean: rr(0.1, 0.45), turb: rr(2.4, 3.8),
    speed: rr(1.4, 2.4), rise: 0, grow: 0.3, vx: 0, vz: 0 }, o);
  FIRE.timed.push(f); return f;
};
function sparks(x, y, z, n, T, o = {}) {
  const dir = o.dir, spread = o.spread ?? Math.PI, sp = o.speed || 3;
  for (let i = 0; i < n; i++) {
    let a = Math.random() * TAU; if (dir != null) a = dir + (Math.random() - 0.5) * 2 * spread;
    const v = sp * rr(0.35, 1.1), up = o.up ?? 1.5;
    FX.add.emit({ x: x + (Math.random() - 0.5) * (o.jit || 0.1), y: y + (Math.random() - 0.5) * (o.jit || 0.1), z: z + (Math.random() - 0.5) * (o.jit || 0.1),
      vx: Math.sin(a) * v, vy: rr(-0.3, 1) * up + (o.lift || 0), vz: Math.cos(a) * v, life: rr(o.life0 || 0.25, o.life1 || 0.8), s: rr(0.018, 0.04) * (o.size || 1),
      c: T.spark, c2: T.cool, g: o.g ?? 4.5, drag: o.drag ?? 1.4 });
  }
}
function motes(x, y, z, n, T, r = 0.4) {
  for (let i = 0; i < n; i++) FX.add.emit({ x: x + (Math.random() - 0.5) * r, y: y + Math.random() * r * 0.5, z: z + (Math.random() - 0.5) * r, vx: (Math.random() - 0.5) * 0.4, vy: rr(0.3, 1.0), vz: (Math.random() - 0.5) * 0.4,
    life: rr(0.9, 2.2), s: rr(0.012, 0.026), c: T.spark, c2: [0.5, 0.04, 0.0], g: -0.15, drag: 0.5 });
}
function soot(x, y, z, n, o = {}) {
  for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = o.out ? rr(0.6, 1) * o.out : rr(0, 0.3);
    FX.soft.emit({ x: x + (Math.random() - 0.5) * (o.r || 0.3), y: y + Math.random() * 0.2, z: z + (Math.random() - 0.5) * (o.r || 0.3), vx: Math.sin(a) * v, vy: rr(0.3, 0.9), vz: Math.cos(a) * v,
      life: rr(1.0, 2.2) * (o.lifeK || 1), s: rr(0.15, 0.28) * (o.size || 1), s2: rr(0.5, 0.9) * (o.size || 1), c: [rr(0.04, 0.07), rr(0.035, 0.055), 0.04], a: o.a || 0.3, drag: o.drag || 1.2, smoke: true }); }
}
function scorch(x, z, r) { if (r > 0.05) GFX.decal(x + (Math.random() - 0.5) * 0.1, z + (Math.random() - 0.5) * 0.1, r, [rr(0.4, 0.6), 0, rr(0.25, 0.4), 0]); }
function flashLight(x, y, z, col, i0, r, dur) { const L = addLight({ x, y, z, color: col, intensity: i0, radius: r, priority: 4, transient: true }); WORLD.effects.push({ kind: 'flash', x, z, t: 0, dur, light: L, i0, o: {} }); return L; }

FIRE.tick = function (dt) {
  for (let i = FIRE.timers.length - 1; i >= 0; i--) { const T = FIRE.timers[i]; if ((T.t -= dt) <= 0) { FIRE.timers.splice(i, 1); try { T.fn(); } catch (e) { console.error(e); } } }
  for (let i = FIRE.timed.length - 1; i >= 0; i--) {
    const f = FIRE.timed[i]; f.t += dt; if (f.t >= f.dur) { FIRE.timed.splice(i, 1); continue; }
    if (f.t < 0) continue;
    if (f.follow) { if (!f.follow.alive && f.follow !== WORLD.hero) { f.follow = null; } else { f.x = f.follow.x + (f.ox || 0); f.z = f.follow.z + (f.oz || 0); } }
    f.x += f.vx * dt; f.z += f.vz * dt; f.y += f.rise * dt;
    if (f.sp && Math.random() < dt * f.sp) sparks(f.x, f.y + f.h / 64 * 0.4, f.z, 1 + (Math.random() * 3 | 0), f.T, { up: 2.4, speed: 1.2, g: 2.5, life1: 1.0 });
  }
  for (let i = FIRE.rings.length - 1; i >= 0; i--) { const R = FIRE.rings[i]; R.t += dt; if (R.t >= R.dur) FIRE.rings.splice(i, 1); }
  for (let i = FIRE.glows.length - 1; i >= 0; i--) { const g = FIRE.glows[i]; g.t += dt; if (g.t >= g.dur) FIRE.glows.splice(i, 1); }
  for (let i = FIRE.hazes.length - 1; i >= 0; i--) { const h = FIRE.hazes[i]; h.t += dt; if (h.t >= h.dur) FIRE.hazes.splice(i, 1); }
  for (let i = FIRE.strokes.length - 1; i >= 0; i--) { const k = FIRE.strokes[i]; k.t += dt; if (k.t >= k.dur) FIRE.strokes.splice(i, 1); }
  // foes carrying Burn: a tongue of fire per stack, licking up their body, shedding sparks and soot
  for (const m of WORLD.monsters) {
    const n = m.alive ? (m.embers || (m.burn > 0 ? 1 + (m.burnDps > 6 ? 1 : 0) + (m.burnDps > 14 ? 1 : 0) : 0)) : 0;
    if (!m._fire) { if (!n) continue; m._fire = { tongues: [], T: temper(Math.random() < 0.5 ? 0 : 2) }; }
    const F = m._fire;
    while (F.tongues.length < n) {
      // alternate tongues in front of the body and behind it: 'in front' is a step along the view ray, so the tongue keeps its place on screen
      const k = F.tongues.length % 2 === 0 ? rr(0.45, 0.65) : 0, j = rr(-0.14, 0.14);
      F.tongues.push({ ox: 0.612 * k + j, oz: 0.612 * k - j, y: rr(0.2, 0.7) * (m.T.heavy ? 1.3 : 1) + 0.5 * k, w: rr(14, 20), h: rr(30, 46), seed: Math.random() * 100, tongues: 1 + (Math.random() < 0.4 ? 1 : 0), lean: rr(0.15, 0.5) }); }
    F.tongues.length = n;
    if (!n) { if (F.light) { removeLight(F.light); F.light = null; } m._fire = null; continue; }
    if (Math.random() < dt * 1.0 * n) sparks(m.x, rr(0.5, 1.2), m.z, 1, F.T, { up: 2.6, speed: 0.8, g: 1.5, life0: 0.5, life1: 1.2, jit: 0.4 });
    if (Math.random() < dt * 1.6 * n) soot(m.x, 1.0, m.z, 1, { size: 0.6, a: 0.22 });
    if (!F.light) F.light = addLight({ x: m.x, y: 0.9, z: m.z, color: 0xff7a30, intensity: 0, radius: 3.2, priority: 2, transient: true, noShadow: true });
    F.light.x = m.x; F.light.z = m.z; F.light.intensity = (1.6 + n * 1.1) * (0.75 + 0.25 * GFX.flick(G.time * 1.7, F.tongues[0].seed));
  }
};
FIRE.draw = function (S) {
  for (const p of WORLD.projectiles) if (p.opts && p.opts.T && p.opts.vis) drawBolt(S, p);
  for (const m of WORLD.monsters) { const F = m._fire; if (!F) continue; const n = F.tongues.length;
    for (const g of F.tongues) S.flames.push({ x: m.x + g.ox, y: g.y, z: m.z + g.oz, w: g.w, h: g.h * (0.85 + 0.1 * n), g: 1.15, glow: 0.28 + 0.08 * n, seed: g.seed, style: [g.tongues, g.lean, 3.2, 1], style2: [0.2, 1.4, 1, 1], fl: 1.5, tintA: F.T.core, tintB: F.T.outer, speed: 2.0 }); }
  for (const f of FIRE.timed) {
    if (f.t < 0) continue;
    const k = f.t / f.dur, life = k < 0.15 ? k / 0.15 : 1 - Math.pow((k - 0.15) / 0.85, 1.6);   // flare up fast, die slowly
    S.flames.push({ x: f.x, y: f.y, z: f.z, w: f.w * (0.7 + 0.3 * life + f.grow * k), h: f.h * (0.35 + 0.65 * life), g: f.g * (0.4 + 0.6 * life), glow: f.glow * life, seed: f.seed,
      style: [f.tongues, f.lean, f.turb, 1], style2: [0.1, 1.3, 1, 1], fl: 1.4, tintA: f.tintA || f.T.core, tintB: f.tintB || f.T.outer, speed: f.speed });
  }
  for (const g of FIRE.glows) { const k = g.t / g.dur, a = g.up ? Math.sin(Math.min(1, k) * Math.PI / 2) : 1 - k; S.glows.push({ x: g.x, y: g.y, z: g.z, w: g.w * (g.up ? 0.5 + 0.5 * k : 1), h: g.h * (g.up ? 0.5 + 0.5 * k : 1), g: g.g * a, c: g.c }); }
  // ragged rings of fire on the floor: bright leading edge, a scorched soft tail
  for (const R of FIRE.rings) {
    if (R.t < 0) continue;
    const k = Math.min(1, R.t / R.dur), e = 1 - Math.pow(1 - k, 2.4), r = R.r0 + (R.r1 - R.r0) * e, fade = Math.pow(1 - k, 1.3), n = R.jag.length;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const j = R.jag[i % n], a = R.rot + i / n * TAU, sx = Math.sin(a), sz = Math.cos(a), ro = r * (1 + j * 0.16 * (0.4 + e)), ri = Math.max(0, ro - R.w * (0.6 + 0.8 * e) * (1 + j));
      pts.push([R.x + sx * ri, 0.05, R.z + sz * ri, R.x + sx * ro, 0.05, R.z + sz * ro, fade * (0.75 + 0.5 * Math.abs(R.jag[(i * 7) % n]))]);
    }
    S.trails.push({ pts, col: R.col });
  }
  for (const k of FIRE.strokes) {
    const u = k.t / k.dur, grow = Math.min(1, k.t / 0.08), fade = Math.pow(1 - u, 1.5), sx = Math.sin(k.a), sz = Math.cos(k.a), nx = sz, nz = -sx, n = 10, A = [], B = [];
    for (let i = 0; i <= n; i++) { const t = (i / n - 0.5) * k.len * grow, w = k.w * (1 - Math.abs(i / n - 0.5) * 1.6) * (0.7 + 0.3 * Math.sin(i * 2.7 + k.x)), x = k.x + sx * t, z = k.z + sz * t;
      A.push([x + nx * w, 0.05, z + nz * w, x, 0.05, z, fade]); B.push([x - nx * w, 0.05, z - nz * w, x, 0.05, z, fade]); }
    S.trails.push({ pts: A, col: k.col }); S.trails.push({ pts: B, col: k.col });
  }
  for (const h of FIRE.hazes) { if (S.haze.length >= 4 || !GFX.onScreen(h.x, 0.5, h.z, 0)) continue; const [sx, sy] = GFX.toScreen(h.x, 0.6, h.z); S.haze.push([sx / GFX.W, 1 - sy / GFX.H, h.r, h.k * (1 - h.t / h.dur)]); }
};
FIRE.clear = function () { FIRE.timers.length = 0; FIRE.timed.length = 0; FIRE.strokes.length = 0; FIRE.rings.length = 0; FIRE.glows.length = 0; FIRE.hazes.length = 0; for (const m of WORLD.monsters) if (m._fire) { if (m._fire.light) removeLight(m._fire.light); m._fire = null; } };

// Ember bolt: a live tongue of fire for a head, a wavering ribbon for a tail, sparks and soot shed on the way
function emberVis(p, dt, dead) {
  const T = p.opts.T, sp = Math.hypot(p.vx, p.vz) || 1, dx = p.vx / sp, dz = p.vz / sp;
  const wob = Math.sin(p.t * T.wf + T.ph) * T.wob, wx = p.x + dz * wob, wz = p.z - dx * wob, wy = p.y + Math.sin(p.t * T.wf * 0.7) * T.wob * 0.5;
  const hist = p.hist || (p.hist = []); hist.unshift([wx, wy, wz]); if (hist.length > T.len) hist.pop();
  if (dead) return;
  // billows: short-lived, swelling tongues left behind in the air, so the ball drags a thick, tumbling mane of fire
  p._bill = (p._bill || 0) + dt * T.billow;
  while (p._bill >= 1) {
    p._bill -= 1;
    const back = rr(0.05, 0.35), side = rr(-0.12, 0.12);
    FIRE.flame(wx - dx * back + dz * side, wy - 0.3 * T.ball + rr(-0.08, 0.1), wz - dz * back - dx * side, { dur: rr(0.16, 0.34), w: rr(24, 36) * T.ball, h: rr(28, 46) * T.ball, tongues: 2 + (Math.random() < 0.5 ? 1 : 0),
      turb: rr(3.8, 4.8), lean: rr(0.3, 0.8), T, glow: rr(0.18, 0.3), g: rr(1.0, 1.15), grow: rr(0.4, 0.9), tintA: T.core.map((v, i) => v * 0.75 + T.outer[i] * 0.25), tintB: T.outer.map(v => v * 0.8), rise: rr(0.5, 1.2), vx: -dx * rr(0.3, 1.2), vz: -dz * rr(0.3, 1.2), speed: rr(2.6, 3.6) });
  }
  if (Math.random() < dt * T.sr) sparks(wx, wy, wz, 1 + (Math.random() * 2 | 0), T, { dir: Math.atan2(-dx, -dz), spread: 1.1, speed: 2.2, up: 1.4, g: 4, life1: 0.6 });
  if (Math.random() < dt * 2) motes(wx, wy, wz, 1, T, 0.15);
  if (Math.random() < dt * T.smoke) soot(wx - dx * 0.4, wy + 0.1, wz - dz * 0.4, 1, { size: rr(0.5, 0.8), a: 0.3, r: 0.2, lifeK: 0.8 });
  if (p.light) { p.light.y = wy; p.light.intensity = T.li * (0.7 + 0.3 * GFX.flick(G.time * 2.3, T.seed)); }
}
function drawBolt(S, p) {
  const T = p.opts.T, hist = p.hist; if (!hist || !hist.length) return;
  const q0 = hist[0], t = p.t, R = T.ball;
  // a big, breathing glow and a white-hot heart
  S.glows.push({ x: q0[0], y: q0[1], z: q0[2], w: 120 * T.glow * R, h: 108 * T.glow * R, g: 0.38 + 0.12 * Math.sin(t * 29), c: T.outer.map(v => v * 1.6) });
  S.glows.push({ x: q0[0], y: q0[1], z: q0[2], w: 40 * R, h: 36 * R, g: 0.7, c: [1.0, 0.7, 0.35] });
  // the ball: a knot of tongues around the head, each churning on its own beat, all streaming back from the flight
  for (let i = 0; i < T.knot.length; i++) {
    const k = T.knot[i], ph = t * k.f + k.ph, br = 0.85 + 0.25 * Math.sin(ph) + 0.12 * Math.sin(ph * 2.7);
    S.flames.push({ x: q0[0] + k.ox * Math.cos(ph * 0.5), y: q0[1] - 0.26 * R + k.oy, z: q0[2] + k.oz * Math.sin(ph * 0.4), w: k.w * R * br, h: k.h * R * (0.8 + 0.3 * Math.sin(ph * 1.3)),
      g: i === 0 ? 1.1 : 0.95, glow: T.glow * (i === 0 ? 0.35 : 0.15), seed: k.seed, style: [k.tongues, T.lean + k.lean, 4.2, 1], style2: [0, 1.6, 1, 1], fl: 1.8, tintA: i === 0 ? T.core : T.core.map((v, j) => v * 0.6 + T.outer[j] * 0.4), tintB: T.outer, speed: 3.2 });
  }
  if (hist.length > 2) {
    // a ragged heat-ribbon under the billowing tail (the billows themselves are FIRE.flame puffs dropped in flight)
    const up = [], dn = [], n = hist.length;
    for (let i = 0; i < n; i++) {
      const q = hist[i], u = i / (n - 1), w = T.tw * R * (1 - u * 0.8) * (0.6 + 0.4 * Math.sin(t * 25 + i * 1.7)), a = 0.55 * (1 - u) * (1 - u);
      up.push([q[0], q[1] + w, q[2], q[0], q[1], q[2], a]); dn.push([q[0], q[1] - w * 0.8, q[2], q[0], q[1], q[2], a]);
    }
    S.trails.push({ pts: up, col: T.trail }); S.trails.push({ pts: dn, col: T.trail });
  }
}
function emberImpact(p, t) {
  const T = p.opts.T, sp = Math.hypot(p.vx, p.vz) || 1, dir = Math.atan2(p.vx / sp, p.vz / sp), x = p.x, y = p.y, z = p.z;
  if (t) {
    // splash through the foe: a spray of sparks, a tongue clinging to it, a puff of soot
    sparks(x, y, z, (4 + Math.random() * 5) | 0, T, { dir, spread: rr(0.6, 1.1), speed: rr(2.5, 4), up: 1.5, life1: 0.6 });
    FIRE.flame(t.x, rr(0.35, 0.6), t.z, { follow: t, ox: rr(-0.1, 0.1), oz: rr(-0.1, 0.1), dur: rr(0.4, 0.65), w: rr(28, 38), h: rr(52, 72), tongues: 3, turb: 4.2, T, glow: 0.9 });
    for (let i = 0; i < 3; i++) FIRE.flame(x + rr(-0.3, 0.3), y - 0.3 + rr(-0.1, 0.2), z + rr(-0.3, 0.3), { dur: rr(0.2, 0.38), w: rr(24, 36), h: rr(30, 48), tongues: 2, turb: 4.4, T, glow: 0.5, grow: 0.9, rise: rr(0.6, 1.4), vx: Math.sin(dir) * rr(0.5, 1.5), vz: Math.cos(dir) * rr(0.5, 1.5) });
  } else {
    // against stone: sparks thrown back, a puddle of fire that gutters out, a scorch mark
    sparks(x, y, z, (5 + Math.random() * 5) | 0, T, { dir: dir + Math.PI, spread: 1.3, speed: rr(2.5, 4), up: 2.2, life1: 0.9, g: 6 });
    const gx = x - Math.sin(dir) * 0.2, gz = z - Math.cos(dir) * 0.2;
    FIRE.flame(gx, 0.02, gz, { dur: rr(0.7, 1.2), w: rr(26, 38), h: rr(40, 60), tongues: 2 + (Math.random() < 0.5 ? 1 : 0), turb: 4.2, T, glow: 0.7, sp: 0.6 });
    for (let i = 0; i < 4; i++) { const a = dir + Math.PI + rr(-1.2, 1.2), d = rr(0.1, 0.5); FIRE.flame(gx + Math.sin(a) * d, rr(0.1, 0.5), gz + Math.cos(a) * d, { dur: rr(0.22, 0.4), w: rr(26, 40), h: rr(30, 50), tongues: 2, turb: 4.4, T, glow: 0.45, grow: 1.0, rise: rr(0.8, 1.6), vx: Math.sin(a) * rr(0.6, 1.6), vz: Math.cos(a) * rr(0.6, 1.6) }); }
    scorch(gx, gz, rr(0.15, 0.28));
  }
  motes(x, y, z, 2, T, 0.3);
  soot(x, y, z, 2 + (Math.random() * 3 | 0), { size: 0.7, a: 0.28 });
  flashLight(x, y, z, 0xff8030, T.li * 1.8, 4.5, 0.35);
}
function emberLaunch(H, a, T) {
  const p = (H.vis && H.vis.lanternAt()) || [H.x, 1.0, H.z];
  lanternFlare(H, 0.6);
  sparks(p[0], p[1] + 0.1, p[2], (2 + Math.random() * 4) | 0, T, { dir: a, spread: 0.55, speed: 3.5, up: 1.2, life1: 0.5 });
  FIRE.flame(p[0], p[1] - 0.05, p[2], { dur: 0.22, w: 12, h: 22, tongues: 2, T, glow: 0.9 });
  soot(p[0], p[1], p[2], 2, { size: 0.5, a: 0.2, r: 0.1 });
}


// a bolt's temper: hue, size, how it wavers, how much it sheds
function emberTemper() {
  const ball = rr(1.35, 1.7), nk = 3 + (Math.random() * 3 | 0);
  const knot = [...Array(nk)].map((_, i) => ({ ox: i ? rr(-0.13, 0.13) : 0, oy: i ? rr(-0.1, 0.12) : 0, oz: i ? rr(-0.13, 0.13) : 0, w: i ? rr(26, 38) : rr(44, 56), h: i ? rr(34, 52) : rr(54, 74),
    tongues: i ? 2 : 3, lean: rr(0, 0.35), f: rr(9, 17), ph: Math.random() * TAU, seed: Math.random() * 100 }));
  return Object.assign(temper(), { ball, knot, billow: rr(32, 46), lean: rr(0.35, 0.7), glow: rr(0.8, 1.05), seed: Math.random() * 100,
    wob: rr(0.02, 0.06), wf: rr(14, 26), ph: Math.random() * TAU, len: (8 + Math.random() * 5) | 0, tw: rr(0.22, 0.32), sr: rr(2, 4), smoke: rr(10, 16), li: rr(6, 8.5) });
}
// Lantern Flare's look: the lantern gathers sparks, then a pillar of fire, two ragged rings and tongues bursting where they pass
FIRE.flareGather = function (H, T) {
  const p = (H.vis && H.vis.lanternAt()) || [H.x, 1.0, H.z], n = (26 + Math.random() * 16) | 0;
  for (let i = 0; i < n * 0.4; i++) { const a = Math.random() * TAU, b = rr(-0.3, 0.9), d = rr(1.2, 2.4), life = rr(0.2, 0.32), sx = p[0] + Math.cos(a) * Math.cos(b) * d, sy = p[1] + Math.sin(b) * d, sz = p[2] + Math.sin(a) * Math.cos(b) * d;
    FX.add.emit({ x: sx, y: sy, z: sz, vx: (p[0] - sx) / life, vy: (p[1] - sy) / life, vz: (p[2] - sz) / life, life, s: rr(0.02, 0.035), s2: 0.05, c: T.spark, drag: 0, g: 0 }); }
  FIRE.glows.push({ x: p[0], y: p[1], z: p[2], t: 0, dur: 0.16, w: 90, h: 90, g: 0.9, c: T.core, up: true });
  rumble([[0, 0.0, 0.15, 60], [60, 0.05, 0.3, 60]]);
};
FIRE.flareBurst = function (H, T, R) {
  const p = (H.vis && H.vis.lanternAt()) || [H.x, 1.0, H.z], x = H.x, z = H.z;
  rumble([[0, 1.0, 1.0, 220], [230, 0.5, 0.6, 160], [400, 0.22, 0.35, 220]]);
  flashLight(x, 1.8, z, 0xff9a40, 15, 8, 0.55);
  FIRE.glows.push({ x: p[0], y: p[1], z: p[2], t: 0, dur: 0.35, w: 200, h: 170, g: 0.75, c: T.core });
  FIRE.flame(x, 0.02, z, { dur: rr(0.4, 0.55), w: rr(36, 48), h: rr(120, 170), tongues: 3 + (Math.random() < 0.5 ? 1 : 0), turb: 3.6, T, glow: 0.8, g: 1.25 });
  const N = 56, seed = Math.random() * 100, jag = [...Array(N)].map((_, i) => Math.sin(i * 0.9 + seed) * 0.5 + Math.sin(i * 2.3 + seed * 1.7) * 0.35 + (Math.random() - 0.5) * 0.6);
  FIRE.rings.push({ x, z, t: 0, dur: rr(0.42, 0.5), r0: 0.3, r1: R * rr(0.95, 1.05), w: 0.5, jag, rot: Math.random() * TAU, col: T.trail });
  FIRE.rings.push({ x, z, t: -0.09, dur: 0.6, r0: 0.2, r1: R * rr(0.7, 0.82), w: 0.35, jag: jag.slice().reverse(), rot: Math.random() * TAU, col: [T.trail[0] * 0.8, T.trail[1] * 0.4, T.trail[2] * 0.3] });
  const nt = (12 + Math.random() * 10) | 0;
  for (let i = 0; i < nt; i++) {
    const a = Math.random() * TAU, r = rr(0.8, R * 0.95), delay = Math.pow(r / R, 1 / 2.4) * 0.25;
    FIRE.flame(x + Math.sin(a) * r, 0.02, z + Math.cos(a) * r, { delay, dur: rr(0.3, 0.75), w: rr(28, 46) * (1.15 - r / 6), h: rr(40, 85) * (1.2 - r / 5), tongues: 1 + (Math.random() * 3 | 0), T, g: rr(1.0, 1.25), glow: rr(0.35, 0.6), sp: rr(0.4, 1.2), vx: Math.sin(a) * rr(0.3, 1), vz: Math.cos(a) * rr(0.3, 1) });
    if (Math.random() < 0.45) FIRE.later(delay, () => scorch(x + Math.sin(a) * r, z + Math.cos(a) * r, rr(0.12, 0.3)));
  }
  sparks(x, 0.9, z, (22 + Math.random() * 18) | 0, T, { speed: rr(5, 7.5), up: 2.0, g: 5, drag: 1.6, life0: 0.35, life1: 0.9, jit: 0.4 });
  motes(x, 0.4, z, (8 + Math.random() * 7) | 0, T, 3.0);
  soot(x, 0.1, z, (14 + Math.random() * 8) | 0, { out: rr(3.5, 5), size: 1.1, a: 0.3, drag: 2.2, lifeK: 1.3, r: 0.6 });
  scorch(x, z, rr(0.8, 1.1));
  FIRE.hazes.push({ x, z, t: 0, dur: 0.7, r: 0.22, k: 1.6 });
};
FIRE.lick = function (m, T) { FIRE.flame(m.x, 0.3, m.z, { follow: m, dur: rr(0.4, 0.7), w: rr(18, 26), h: rr(40, 60), tongues: 2, T, glow: 0.7 }); sparks(m.x, 1.0, m.z, 3, T, { speed: 2.5, up: 2 }); };
// Smite: a held gilt wind-up and a holy cross split in the floor where the blow lands
function swordLook(H, col, life, glow) { if (!H.vis) return; H.vis.trailCol = col; H.vis.trailLife = life; H.vis.glow = glow || [0, 0, 0]; }
FIRE.smiteWindup = function (H) {
  const T = temper(1);
  swordLook(H, [1.7, 1.15, 0.4], 0.32, [0.22, 0.16, 0.04]);
  FIRE.glows.push({ x: H.x, y: 1.3, z: H.z, t: 0, dur: 0.4, w: 120, h: 150, g: 0.55, c: [1, 0.78, 0.38], up: true });
  for (let i = 0; i < 8; i++) { const a = Math.random() * TAU, d = rr(0.8, 1.5), life = rr(0.25, 0.4), sx = H.x + Math.cos(a) * d, sy = rr(0.4, 2.0), sz = H.z + Math.sin(a) * d;
    FX.add.emit({ x: sx, y: sy, z: sz, vx: (H.x - sx) / life, vy: (1.3 - sy) / life, vz: (H.z - sz) / life, life, s: 0.025, s2: 0.04, c: T.spark, drag: 0, g: 0 }); }
  rumble([[0, 0.05, 0.22, 380]]);
  return T;
};
FIRE.smiteImpact = function (H, cx, cz, T) {
  rumble([[0, 1.0, 0.7, 180], [200, 0.45, 0.25, 140]]);
  FIRE.strokes.push({ x: cx, z: cz, a: H.rot, len: rr(1.8, 2.3), w: 0.16, t: 0, dur: 0.75, col: [1.7, 1.15, 0.4] });
  FIRE.strokes.push({ x: cx + Math.sin(H.rot) * 0.35, z: cz + Math.cos(H.rot) * 0.35, a: H.rot + Math.PI / 2, len: rr(1.1, 1.4), w: 0.14, t: 0, dur: 0.75, col: [1.7, 1.15, 0.4] });
  FIRE.rings.push({ x: cx, z: cz, t: 0, dur: 0.38, r0: 0.2, r1: 1.8, w: 0.3, jag: [...Array(36)].map(() => Math.random() - 0.5), rot: 0, col: [1.5, 1.0, 0.35] });
  sparks(cx, 0.3, cz, 12, T, { speed: 4.5, up: 2.4, g: 7, life1: 0.7, jit: 0.3 });
  soot(cx, 0.1, cz, 5, { out: 2.5, size: 0.7, a: 0.22, drag: 2.5 });
  GFX.decal(cx, cz, 0.7, [0.15, 0, 0.6, 0]);
  flashLight(cx, 1.2, cz, 0xffd080, 14, 6, 0.4);
  FIRE.later(0.3, () => swordLook(H, null, 0));
};

// ---- hooks into the main game
{
  const _upd = update;
  update = function (dt) { _upd(dt); if (Game.state === 'play' && !topPanel()) FIRE.tick(dt * (FX.freeze > 0 ? 0.08 : 1)); };
  const _pre = FX.preRender;
  FX.preRender = function () { _pre(); FIRE.draw(GFX.S); };
  const _fcl = fxClearLevel;
  fxClearLevel = function () { _fcl(); FIRE.clear(); };
  // Ember: a living bolt instead of a string of dots
  SKILLS.firebolt.cast = function (H, aim, r) {
    H.rot = aim.angle;
    H.startAction('cast', 0.55 / H.castSpeed, () => {
      const T = emberTemper(), a = H.rot;
      emberLaunch(H, a, T);
      spawnProjectile('firebolt', H, H.x + Math.sin(a) * 0.5, H.z + Math.cos(a) * 0.5, a, { fire: spellDmg(4, 8, r, H, 3, 4) }, { y: 1.15, T, vis: emberVis, impact: emberImpact });
    }, 0.5);
  };
  // Lantern Flare: same buff, stun and burn as before, with the new fire
  SKILLS.warcry.cast = function (H, aim, r) {
    const T = temper(Math.random() < 0.3 ? 1 : (Math.random() < 0.6 ? 0 : 2));
    FIRE.flareGather(H, T);
    H.startAction('cast', 0.6, () => {
      H.addBuff('warcry', 30, { dmgBuff: 20 + r * 8, armorBuff: 10 + r * 4 });
      SFX.play('warcry'); SFX.play('explode', { x: H.x, z: H.z, vol: 0.4, rate: rr(0.7, 0.85) }); R3.camShake = 0.45;
      FIRE.flareBurst(H, T, 4.0);
      for (const m of WORLD.monsters) if (m.alive && m.dist(H) < 4) {
        applyDamage(m, { fire: 8 + r * 4 }, H, {}); if (!m.boss) { m.stun = Math.max(m.stun, 1 + r * 0.2); if (m.vis && m.alive) m.vis.play('hit', 0.4, true); }
        const mm = m; FIRE.later(m.dist(H) / 4 * 0.25, () => { if (mm.alive) FIRE.lick(mm, T); });
      }
    }, 0.45);
  };
  // Smite: the held, gilt blow
  SKILLS.bash.cast = function (H, aim, r) {
    H.rot = aim.angle;
    if (Math.random() < 0.6) SFX.play(H.voice + 'Attack', { vol: 0.7, minGap: 1.0 });
    const T = FIRE.smiteWindup(H);
    H.startAction('attack3', 0.78 / H.atkSpeed, () => {
      const t = meleeTargetAt(H, H.rot, 1.45, 0.9), cx = H.x + Math.sin(H.rot) * 1.0, cz = H.z + Math.cos(H.rot) * 1.0;
      SFX.play('swingHeavy', { x: H.x, z: H.z });
      FIRE.smiteImpact(H, cx, cz, T);
      if (t && heroHits(H, t, { mul: 1.6 + r * 0.15, knock: 1.2, stun: 0.6 + r * 0.05, tohit: 20 })) { R3.camShake = 0.4; SFX.play('bash', { x: t.x, z: t.z }); }
    }, 0.55);
  };
}

// =====================================================================================================================
// Skill looks II (2026-11-16): every skill its own shape, colour and mark on the room.
//   Smite            gilt cross split in the floor, a shaft of light, flying stone
//   Ember            the living bolt; leaves a glowing coal where it dies
//   Reaping Arc      a steel-white and crimson crescent that cuts outward, a gouge in the floor, blood thrown along it
//   Lantern Flare    pillar and ragged rings of lantern-fire
//   Pyre             a heavy, smoking ball that drips fire as it flies and bursts into a burning crater
//   Flagellant's Wheel   whip-ribbons, a dust vortex, sparks scraped off the flags, a scuffed ring left behind
//   Wall of Cinders  the floor splits and the wall erupts outward from the middle; tall tongues, cinders, heat
//   Judgement        a closing ring and a shaft from above, then a white-gold star, a burned cross and a crater
// =====================================================================================================================
FIRE.arcs = []; FIRE.beams = []; FIRE.walls = []; FIRE.stars = [];
const STEEL = { core: [1.0, 0.95, 0.9], outer: [0.5, 0.5, 0.55], spark: [1.7, 1.6, 1.4], cool: [0.35, 0.3, 0.3], trail: [1.5, 1.4, 1.3] };
// stone thrown up from the floor: shards that arc, bounce and lie still
function chips(x, z, n, o = {}) {
  for (let i = 0; i < n; i++) { const a = Math.random() * TAU, sp = rr(0.8, 1) * (o.speed || 3);
    FX.soft.emit({ x: x + (Math.random() - 0.5) * (o.r || 0.3), y: 0.1, z: z + (Math.random() - 0.5) * (o.r || 0.3), vx: Math.cos(a) * sp * rr(0.3, 1), vy: rr(1.5, 1) * (o.up || 3), vz: Math.sin(a) * sp * rr(0.3, 1),
      life: rr(1.6, 3), s: rr(0.025, 0.05) * (o.size || 1), c: [rr(0.2, 0.3), rr(0.19, 0.27), 0.22], g: 11, drag: 0.25, bounce: 0.4, shard: true, solid: true }); }
}
// dust driven outward along the floor
function dustRing(x, z, n, out, o = {}) {
  for (let i = 0; i < n; i++) { const a = i / n * TAU + Math.random() * 0.4, v = out * rr(0.6, 1.1), r0 = o.r0 || 0.3;
    FX.soft.emit({ x: x + Math.cos(a) * r0, y: 0.1, z: z + Math.sin(a) * r0, vx: Math.cos(a) * v, vy: rr(0.1, 0.5), vz: Math.sin(a) * v, life: rr(0.7, 1.4), s: 0.2, s2: rr(0.5, 0.85) * (o.size || 1), c: o.c || [0.3, 0.28, 0.25], a: o.a || 0.16, drag: 2.4 }); }
}
function hitstop(t) { FX.freeze = Math.max(FX.freeze || 0, t); }
function shake(k) { R3.camShake = Math.max(R3.camShake || 0, k); }
// a crescent ribbon in the air or on the floor, sweeping outward from r0 to r1 (bright along its leading edge)
FIRE.arc = (x, z, a, o) => FIRE.arcs.push(Object.assign({ x, z, a, span: 2.4, r0: 0.8, r1: 2.2, w: 0.5, y: 1.0, t: 0, dur: 0.22, col: STEEL.trail }, o));
// a shaft of light standing on the floor
FIRE.beam = (x, z, o) => FIRE.beams.push(Object.assign({ x, z, t: 0, dur: 0.4, w0: 0.1, w1: 0.3, h: 9, col: [1.5, 1.2, 0.6], grow: false }, o));

{
  const _tick = FIRE.tick, _draw = FIRE.draw, _clear = FIRE.clear;
  FIRE.tick = function (dt) {
    _tick(dt);
    for (const L of [FIRE.arcs, FIRE.beams]) for (let i = L.length - 1; i >= 0; i--) { const e = L[i]; e.t += dt; if (e.t >= e.dur) L.splice(i, 1); }
    for (let i = FIRE.walls.length - 1; i >= 0; i--) if (wallTick(FIRE.walls[i], dt)) FIRE.walls.splice(i, 1);
    for (let i = FIRE.stars.length - 1; i >= 0; i--) if (starTick(FIRE.stars[i], dt)) FIRE.stars.splice(i, 1);
    // Lantern Flare's blessing shows for as long as it lasts: embers circle the Penitent
    const H = WORLD.hero;
    if (H && H.alive && H.buffs && H.buffs.some(b => b.id === 'warcry') && Math.random() < dt * 9) {
      const a = G.time * 3 + Math.random() * TAU, r = rr(0.35, 0.55);
      FX.add.emit({ x: H.x + Math.cos(a) * r, y: rr(0.2, 1.5), z: H.z + Math.sin(a) * r, vx: -Math.sin(a) * 1.4, vy: rr(0.3, 0.8), vz: Math.cos(a) * 1.4, life: rr(0.5, 0.9), s: rr(0.02, 0.035), s2: 0.006, c: [1.7, 0.7, 0.16], drag: 0.8 });
    }
  };
  FIRE.draw = function (S) {
    _draw(S);
    for (const A of FIRE.arcs) {
      if (A.t < 0) continue;
      const k = A.t / A.dur, e = 1 - Math.pow(1 - k, 2.2), r = A.r0 + (A.r1 - A.r0) * e, fade = Math.pow(1 - k, 1.4), n = 18, pts = [];
      for (let i = 0; i <= n; i++) { const u = i / n, tp = Math.sin(u * Math.PI), a = A.a - A.span / 2 + A.span * u, sx = Math.sin(a), sz = Math.cos(a), ri = r - A.w * (0.25 + 0.75 * tp);
        pts.push([A.x + sx * ri, A.y, A.z + sz * ri, A.x + sx * r, A.y + (A.lift || 0) * tp, A.z + sz * r, fade * tp]); }
      S.trails.push({ pts, col: A.col });
    }
    for (const B of FIRE.beams) {
      const k = B.t / B.dur, a = B.grow ? Math.pow(k, 1.5) : Math.pow(1 - k, 1.3), w = B.w0 + (B.w1 - B.w0) * k, cx = GFX.CR[0] * w, cz = GFX.CR[2] * w;
      for (const s of [-1, 1]) S.trails.push({ pts: [[B.x + cx * s, 0.05, B.z + cz * s, B.x, 0.05, B.z, a], [B.x + cx * s, B.h * 0.5, B.z + cz * s, B.x, B.h * 0.5, B.z, a * 0.8], [B.x + cx * s * 0.6, B.h, B.z + cz * s * 0.6, B.x, B.h, B.z, 0]], col: B.col });
      S.glows.push({ x: B.x, y: 0.15, z: B.z, w: 150 + 500 * w, h: 60 + 200 * w, g: 0.5 * a, c: B.col.map(v => v * 0.6) });
    }
    for (const st of FIRE.stars) if (st.hist && st.hist.length > 1) {
      const q = st.hist[0], n = st.hist.length, L = [], Rr = [];
      S.glows.push({ x: q[0], y: q[1], z: q[2], w: 340, h: 300, g: 0.75, c: [1.0, 0.7, 0.3] }); S.glows.push({ x: q[0], y: q[1], z: q[2], w: 110, h: 100, g: 1.3, c: [1.0, 0.95, 0.8] });
      for (let i = 0; i < n; i++) { const h = st.hist[i], u = i / (n - 1), w = 0.42 * (1 - u * 0.85), a = 0.9 * (1 - u);
        L.push([h[0] + GFX.CR[0] * w, h[1], h[2] + GFX.CR[2] * w, h[0], h[1], h[2], a]); Rr.push([h[0] - GFX.CR[0] * w, h[1], h[2] - GFX.CR[2] * w, h[0], h[1], h[2], a]); }
      S.trails.push({ pts: L, col: [1.8, 1.2, 0.5] }); S.trails.push({ pts: Rr, col: [1.8, 1.2, 0.5] });
    }
  };
  FIRE.clear = function () { _clear(); FIRE.arcs.length = 0; FIRE.beams.length = 0; FIRE.stars.length = 0; for (const W of FIRE.walls) for (const l of W.lights || []) removeLight(l); FIRE.walls.length = 0; };

  // ---------------------------------------------------------------- Smite: more weight
  const _smite = FIRE.smiteImpact;
  FIRE.smiteImpact = function (H, cx, cz, T) {
    _smite(H, cx, cz, T);
    FIRE.beam(cx, cz, { dur: 0.3, w0: 0.28, w1: 0.05, h: 7, col: [1.7, 1.25, 0.5] });
    chips(cx, cz, 9, { speed: 3, up: 3.2 }); dustRing(cx, cz, 12, 3.2); shake(0.32);
    for (let i = 0; i < 4; i++) { const a = H.rot + i * Math.PI / 2 + rr(-0.3, 0.3), d = rr(0.5, 1.0); GFX.decal(cx + Math.sin(a) * d, cz + Math.cos(a) * d, rr(0.08, 0.16), [0, 0, 0.5, 0]); }
  };
  const _bash = SKILLS.bash.cast;
  SKILLS.bash.cast = function (H, aim, r) {
    const n0 = WORLD.monsters.reduce((s, m) => s + (m.alive ? m.hp : 0), 0);
    _bash(H, aim, r);
    const done = H.action && H.action.fire; if (H.action && done) H.action.fire = function () { done.apply(this, arguments); if (WORLD.monsters.reduce((s, m) => s + (m.alive ? m.hp : 0), 0) < n0) hitstop(0.09); };
  };

  // ---------------------------------------------------------------- Ember: a coal is left where the bolt dies
  const _ei = emberImpact;
  emberImpact = function (p, t) {
    _ei(p, t);
    const T = p.opts.T, x = t ? t.x : p.x, z = t ? t.z : p.z;
    FIRE.flame(x + rr(-0.15, 0.15), 0.02, z + rr(-0.15, 0.15), { dur: rr(1.6, 2.6), w: rr(8, 12), h: rr(12, 20), tongues: 1, T, glow: 1.0, sp: 0.8 });
    fxPulse(x, 0.3, z, 0xff7030, 2.2, 2.6, 2.2); scorch(x, z, rr(0.12, 0.2));
    if (!t) chips(p.x, p.z, 3, { speed: 1.6, up: 2 });
  };

  // ---------------------------------------------------------------- Lantern Flare: the room answers
  const _flare = FIRE.flareBurst;
  FIRE.flareBurst = function (H, T, R) {
    _flare(H, T, R);
    fxScreen([0.85, 0.5, 0.15], 0.4, 0.7); hitstop(0.05); dustRing(H.x, H.z, 20, 5, { size: 1.2 });
    FIRE.beam(H.x, H.z, { dur: 0.45, w0: 0.5, w1: 0.1, h: 6, col: T.trail });
    FIRE.arc(H.x, H.z, 0, { span: TAU, r0: 0.4, r1: R * 1.15, w: 0.7, y: 1.1, dur: 0.4, col: [T.trail[0] * 0.7, T.trail[1] * 0.7, T.trail[2] * 0.7] });
  };

  // ---------------------------------------------------------------- Reaping Arc
  SKILLS.cleave.cast = function (H, aim, r) {
    H.rot = aim.angle;
    if (Math.random() < 0.45) SFX.play(H.voice + 'Attack', { vol: 0.65, minGap: 1.0 });
    swordLook(H, [1.6, 0.22, 0.16], 0.34, [0.2, 0.02, 0.02]);
    H.startAction('attack2', 0.74 / H.atkSpeed, () => {
      SFX.play('swingHeavy', { x: H.x, z: H.z });
      const a = H.rot, x = H.x, z = H.z, ts = meleeTargetsArc(H, a, 1.75, 1.3);
      // the cut: white steel leading, crimson behind it, and its shadow racing over the floor
      FIRE.arc(x, z, a, { span: 2.7, r0: 0.7, r1: 2.25, w: 0.6, y: 1.0, lift: 0.25, dur: 0.24, col: [2.6, 2.4, 2.2] });
      FIRE.arc(x, z, a, { span: 2.3, r0: 0.5, r1: 1.9, w: 0.5, y: 1.25, lift: 0.1, dur: 0.18, col: [1.6, 1.5, 1.4] });
      FIRE.arcs.push({ x, z, a, span: 2.9, r0: 0.5, r1: 2.5, w: 0.8, y: 0.85, lift: 0.1, t: -0.03, dur: 0.3, col: [1.5, 0.1, 0.06] });
      FIRE.arcs.push({ x, z, a, span: 2.5, r0: 1.0, r1: 3.1, w: 0.35, y: 0.05, t: -0.05, dur: 0.42, col: [0.9, 0.08, 0.05] });
      // the gouge it leaves, dust torn up along it, sparks where the point drags
      for (let i = 0; i <= 8; i++) { const b = a - 1.25 + i * 2.5 / 8, d = rr(1.55, 1.75), gx = x + Math.sin(b) * d, gz = z + Math.cos(b) * d;
        if (WORLD.level.walkable(gx, gz)) { GFX.decal(gx, gz, rr(0.09, 0.15), [0, 0, 0.55, 0]); if (i % 2 === 0) FX.soft.emit({ x: gx, y: 0.1, z: gz, vx: Math.sin(b) * rr(1.5, 2.6), vy: rr(0.2, 0.5), vz: Math.cos(b) * rr(1.5, 2.6), life: rr(0.6, 1.0), s: 0.18, s2: 0.6, c: [0.3, 0.28, 0.25], a: 0.15, drag: 2.6 }); } }
      for (const e of [-1.25, 1.25]) sparks(x + Math.sin(a + e) * 1.7, 0.12, z + Math.cos(a + e) * 1.7, 5, STEEL, { dir: a + e * 1.6, spread: 0.5, speed: 4, up: 1.2, g: 8, life1: 0.45 });
      let hits = 0;
      for (const t of ts) if (heroHits(H, t, { mul: 1.0 + r * 0.12, knock: 0.4 })) {
        hits++;
        const side = a + Math.PI / 2, dir = [Math.sin(side) * 0.8 + Math.sin(a) * 0.6, Math.cos(side) * 0.8 + Math.cos(a) * 0.6];
        if (!(t.T.undead && t.T.model === 'skeleton') && t.T.model !== 'wraith' && t.T.model !== 'golem') fxBlood(t.x, 1.0, t.z, 12, dir);
        FIRE.arc(t.x, t.z, a, { span: 1.2, r0: 0.1, r1: 0.7, w: 0.3, y: 1.0 * (t.vis ? t.vis.scale : 1), dur: 0.16, col: [1.8, 1.7, 1.5] });
      }
      if (hits) { hitstop(Math.min(0.12, 0.05 + hits * 0.02)); shake(Math.min(0.5, 0.14 + hits * 0.09)); rumble([[0, 0.7, 0.5, 120]]); flashLight(x + Math.sin(a) * 1.2, 1.1, z + Math.cos(a) * 1.2, 0xff5040, 5 + hits * 2, 4.5, 0.25); }
      FIRE.later(0.3, () => swordLook(H, null, 0));
    }, 0.5);
  };

  // ---------------------------------------------------------------- Pyre
  function pyreTemper() {
    const T = Object.assign(emberTemper(), temper(Math.random() < 0.6 ? 2 : 0));
    T.ball *= rr(1.75, 2.0); T.billow *= 1.5; T.smoke *= 2.4; T.len += 6; T.tw *= 1.3; T.li = rr(11, 14); T.sr *= 2.2; T.glow *= 1.15; T.wob *= 0.5;
    for (let i = 0; i < 3; i++) T.knot.push({ ox: rr(-0.2, 0.2), oy: rr(-0.12, 0.16), oz: rr(-0.2, 0.2), w: rr(30, 42), h: rr(40, 58), tongues: 2, lean: rr(0, 0.4), f: rr(8, 15), ph: Math.random() * TAU, seed: Math.random() * 100 });
    return T;
  }
  function pyreVis(p, dt, dead) {
    emberVis(p, dt, dead); if (dead) return;
    // it drips: gobs of fire fall from the ball and burn out on the flags
    p._drip = (p._drip || 0) + dt;
    if (p._drip > 0.07) { p._drip = 0; const T = p.opts.T, x = p.x + rr(-0.2, 0.2), z = p.z + rr(-0.2, 0.2);
      FX.add.emit({ x, y: p.y - 0.2, z, vx: p.vx * 0.15, vy: -1, vz: p.vz * 0.15, life: 0.3, s: 0.05, c: T.spark, c2: T.cool, g: 9, drag: 0.5 });
      if (WORLD.level.walkable(x, z)) FIRE.later(0.22, () => { FIRE.flame(x, 0.02, z, { dur: rr(0.5, 1.1), w: rr(10, 18), h: rr(16, 30), tongues: 1 + (Math.random() < 0.4 ? 1 : 0), T, glow: 0.6 }); scorch(x, z, rr(0.06, 0.12)); }); }
  }
  function pyreBurst(x, z, R, T) {
    SFX.play('explode', { x, z }); shake(0.6); hitstop(0.07); rumble([[0, 1.0, 1.0, 200], [210, 0.5, 0.5, 180]]);
    fxScreen([0.8, 0.32, 0.06], 0.3, 0.55);
    flashLight(x, 1.4, z, 0xff7a28, 20, 9, 0.6); fxPulse(x, 0.6, z, 0xff5a18, 5, 5.5, 3.2);
    FIRE.flame(x, 0.02, z, { dur: rr(0.5, 0.65), w: rr(56, 70), h: rr(140, 180), tongues: 4, turb: 4.0, T, glow: 0.9, g: 1.3 });
    FIRE.flame(x, 0.9, z, { dur: rr(0.55, 0.75), w: rr(80, 100), h: rr(70, 90), tongues: 3, turb: 4.6, T, glow: 0.6, grow: 1.0, rise: 1.6 });   // the head of the mushroom
    const N = 48, seed = Math.random() * 100, jag = [...Array(N)].map((_, i) => Math.sin(i * 1.1 + seed) * 0.5 + (Math.random() - 0.5) * 0.7);
    FIRE.rings.push({ x, z, t: 0, dur: 0.4, r0: 0.3, r1: R * 1.25, w: 0.6, jag, rot: Math.random() * TAU, col: T.trail });
    FIRE.rings.push({ x, z, t: -0.07, dur: 0.6, r0: 0.2, r1: R * 0.9, w: 0.4, jag: jag.slice().reverse(), rot: Math.random() * TAU, col: [T.trail[0] * 0.7, T.trail[1] * 0.3, T.trail[2] * 0.2] });
    const nt = (14 + Math.random() * 6) | 0;
    for (let i = 0; i < nt; i++) { const a = Math.random() * TAU, d = rr(0.3, R), delay = d / R * 0.14;
      FIRE.flame(x + Math.sin(a) * d, 0.02, z + Math.cos(a) * d, { delay, dur: rr(0.35, 0.8), w: rr(30, 48), h: rr(50, 95), tongues: 1 + (Math.random() * 3 | 0), T, g: rr(1.0, 1.25), glow: rr(0.35, 0.6), sp: rr(0.5, 1.4), vx: Math.sin(a) * rr(0.4, 1.4), vz: Math.cos(a) * rr(0.4, 1.4) }); }
    sparks(x, 0.6, z, (36 + Math.random() * 16) | 0, T, { speed: rr(6, 8), up: 2.6, g: 6, drag: 1.5, life0: 0.4, life1: 1.1, jit: 0.4 });
    motes(x, 0.5, z, 12, T, R * 1.4);
    soot(x, 0.2, z, 16, { out: rr(3, 4.5), size: 1.2, a: 0.32, drag: 2.2, lifeK: 1.4, r: 0.6 }); soot(x, 1.2, z, 8, { size: 1.5, a: 0.34, lifeK: 1.8, r: 0.8 });
    chips(x, z, 12, { speed: 4, up: 4 }); dustRing(x, z, 16, 4.5, { r0: R * 0.5 });
    scorch(x, z, R * rr(0.55, 0.7)); for (let i = 0; i < 6; i++) { const a = Math.random() * TAU, d = rr(0.5, 1) * R; scorch(x + Math.sin(a) * d, z + Math.cos(a) * d, rr(0.14, 0.3)); }
    FIRE.hazes.push({ x, z, t: 0, dur: 0.9, r: 0.24, k: 1.8 });
    // what is left burns for a while
    for (let i = 0; i < 6; i++) { const a = Math.random() * TAU, d = rr(0.2, 0.85) * R, gx = x + Math.sin(a) * d, gz = z + Math.cos(a) * d;
      if (WORLD.level.walkable(gx, gz)) FIRE.flame(gx, 0.02, gz, { delay: rr(0.2, 0.5), dur: rr(1.8, 3.4), w: rr(12, 22), h: rr(20, 40), tongues: 1 + (Math.random() < 0.5 ? 1 : 0), T, glow: 0.7, sp: 0.7 }); }
  }
  SKILLS.fireball.cast = function (H, aim, r) {
    H.rot = aim.angle;
    const T = pyreTemper();
    FIRE.flareGather(H, T);
    H.startAction('cast', 0.7 / H.castSpeed, () => {
      const a = H.rot, R = PROJ_DEF.fireball.explode * (1 + r * 0.04), dmg = { fire: spellDmg(14, 24, r, H, 6, 9) };
      lanternFlare(H, 1.6); emberLaunch(H, a, T); shake(0.15);
      soot(H.x + Math.sin(a) * 0.3, 1.0, H.z + Math.cos(a) * 0.3, 4, { size: 0.8, a: 0.25 });
      spawnProjectile('fireball', H, H.x + Math.sin(a) * 0.5, H.z + Math.cos(a) * 0.5, a, dmg, { y: 1.15, T, vis: pyreVis,
        impact(p, t) {
          pyreBurst(p.x, p.z, R, T);
          areaDamage(p.x, p.z, R, 'hero', dmg, H, { exclude: t });
          for (const m of WORLD.monsters) if (m.alive && Math.hypot(m.x - p.x, m.z - p.z) < R + m.radius) { const mm = m; FIRE.later(rr(0.02, 0.15), () => { if (mm.alive) FIRE.lick(mm, T); }); }
        } });
    }, 0.5);
  };

  // ---------------------------------------------------------------- Flagellant's Wheel
  const _uhs = updateHeroSkills;
  updateHeroSkills = function (H, dt) {
    const W = H.whirl, hp0 = W && W.tick - dt <= 0 ? WORLD.monsters.reduce((s, m) => s + (m.alive ? m.hp : 0), 0) : null;
    _uhs(H, dt);
    if (!W) return;
    const x = H.x, z = H.z, rot = H.rot, tipx = x + Math.sin(rot) * 1.45, tipz = z + Math.cos(rot) * 1.45;
    if (!W.fx) { W.fx = { light: addLight({ x, y: 1.1, z, color: 0xffd8b0, intensity: 3.5, radius: 4.5, priority: 3, transient: true, noShadow: true }), sc: 0, dust: 0 }; dustRing(x, z, 12, 3); }
    const F = W.fx; F.light.x = x; F.light.z = z; F.light.intensity = 3 + 1.5 * Math.sin(G.time * 40);
    // two more ribbons around the blade's own: a long crimson lash low and wide, a pale wind-line high
    const lash = [], wind = [];
    for (let i = 0; i < 12; i++) { const a = rot - 0.5 - i * 0.26, f = 1 - i / 12; lash.push([x + Math.sin(a) * 1.25, 0.55, z + Math.cos(a) * 1.25, x + Math.sin(a) * (1.75 + 0.1 * Math.sin(i * 1.7)), 0.5, z + Math.cos(a) * (1.75 + 0.1 * Math.sin(i * 1.7)), f * 0.75]); }
    for (let i = 0; i < 9; i++) { const a = rot + Math.PI - i * 0.3, f = 1 - i / 9; wind.push([x + Math.sin(a) * 0.75, 1.55, z + Math.cos(a) * 0.75, x + Math.sin(a) * 1.05, 1.6, z + Math.cos(a) * 1.05, f * 0.35]); }
    GFX.S.trails.push({ pts: lash.reverse(), col: [1.5, 0.12, 0.08] }); GFX.S.trails.push({ pts: wind.reverse(), col: [1.1, 1.05, 1.0] });
    // the point drags on the flags: sparks fly off along the turn, and a scuffed ring is worn into the floor
    F.sc += dt;
    if (F.sc > 0.035) { F.sc = 0;
      sparks(tipx, 0.1, tipz, 1, STEEL, { dir: rot + Math.PI / 2, spread: 0.35, speed: 5, up: 0.9, g: 9, life0: 0.12, life1: 0.3 });
      if (WORLD.level.walkable(tipx, tipz)) GFX.decal(tipx, tipz, 0.07, [0, 0, 0.28, 0]); }
    // dust caught up and carried round
    F.dust += dt;
    if (F.dust > 0.05) { F.dust = 0; const a = Math.random() * TAU, d = rr(0.9, 1.8);
      FX.soft.emit({ x: x + Math.sin(a) * d, y: rr(0.1, 0.4), z: z + Math.cos(a) * d, vx: Math.cos(a) * 5.5 - Math.sin(a) * 0.8, vy: rr(0.4, 1.1), vz: -Math.sin(a) * 5.5 - Math.cos(a) * 0.8, life: rr(0.5, 0.9), s: 0.16, s2: 0.5, c: [0.33, 0.3, 0.27], a: 0.15, drag: 2.0 }); }
    // each bite: blood thrown off along the turn
    if (hp0 !== null && WORLD.monsters.reduce((s, m) => s + (m.alive ? m.hp : 0), 0) < hp0) {
      shake(0.1);
      for (const m of WORLD.monsters) if (m.alive && m.dist(H) < 1.5 + m.radius && m.T.model !== 'wraith' && m.T.model !== 'golem' && !(m.T.undead && m.T.model === 'skeleton')) { const b = Math.atan2(m.x - x, m.z - z) + Math.PI / 2; fxBlood(m.x, 1.0, m.z, 5, [Math.sin(b), Math.cos(b)]); }
    }
    if (!H.whirl) {   // the last turn: everything it gathered is flung outward
      removeLight(F.light);
      FIRE.arc(x, z, 0, { span: TAU, r0: 0.8, r1: 2.9, w: 0.5, y: 0.6, dur: 0.3, col: [1.4, 1.3, 1.2] });
      FIRE.arc(x, z, 0, { span: TAU, r0: 0.6, r1: 2.4, w: 0.6, y: 0.08, dur: 0.38, col: [1.2, 0.1, 0.07] });
      dustRing(x, z, 22, 5.5, { r0: 1.0, size: 1.2 }); sparks(x, 0.3, z, 14, STEEL, { speed: 5, up: 1.5, g: 8, life1: 0.5 }); shake(0.25); rumble([[0, 0.5, 0.4, 120]]);
    }
  };
  const _wcast = SKILLS.whirlwind.cast;
  SKILLS.whirlwind.cast = function (H, aim, r) { _wcast(H, aim, r); swordLook(H, [1.6, 1.45, 1.3], 0.3, [0.12, 0.1, 0.1]); FIRE.later(1.7, () => { if (!H.whirl) swordLook(H, null, 0); }); };

  // ---------------------------------------------------------------- Wall of Cinders
  function wallTick(W, dt) {
    W.t += dt;
    const n = W.pts.length, mid = (n - 1) / 2, T = W.T, ending = W.t > W.dur - 0.5;
    for (let i = 0; i < n; i++) {
      const P = W.pts[i], S = W.st[i], d = Math.abs(i - mid) * 0.055;
      if (W.t < d) continue;
      if (!S.lit) {   // the floor splits here and the fire comes up
        S.lit = true; S.next = 0;
        FIRE.flame(P[0], 0.02, P[1], { dur: rr(0.45, 0.6), w: rr(30, 40), h: rr(130, 175), tongues: 2 + (Math.random() < 0.5 ? 1 : 0), turb: 4.4, T, glow: 0.9, g: 1.3 });
        sparks(P[0], 0.2, P[1], 6, T, { speed: 2.4, up: 4.2, g: 5, life1: 1.0, jit: 0.2 }); chips(P[0], P[1], 2, { speed: 1.6, up: 3.4 });
        scorch(P[0], P[1], rr(0.24, 0.34));
        if (i === Math.round(mid)) { shake(0.3); rumble([[0, 0.6, 0.7, 260]]); }
      }
      if (ending) continue;
      S.next -= dt;
      if (S.next <= 0) { S.next = rr(0.16, 0.3);
        FIRE.flame(P[0] + rr(-0.12, 0.12), 0.02, P[1] + rr(-0.12, 0.12), { dur: rr(0.6, 1.0), w: rr(34, 50), h: rr(84, 128), tongues: 2 + (Math.random() * 2 | 0), turb: rr(3.2, 4.4), lean: rr(0.05, 0.3), T, glow: rr(0.4, 0.6), g: rr(1.0, 1.2), sp: 1.6 }); }
      if (Math.random() < dt * 2.2) motes(P[0], rr(0.8, 1.8), P[1], 1, T, 0.4);
      if (Math.random() < dt * 0.9) soot(P[0], rr(1.4, 2.0), P[1], 1, { size: 0.9, a: 0.2, lifeK: 1.3 });
    }
    W.lick -= dt;
    if (W.lick <= 0) { W.lick = 0.45; for (const m of WORLD.monsters) if (m.alive) for (const P of W.pts) if (Math.hypot(m.x - P[0], m.z - P[1]) < 0.6 + m.radius) { FIRE.lick(m, T); break; } }
    for (const l of W.lights) l.intensity = (ending ? Math.max(0, (W.dur - W.t) / 0.5) : Math.min(1, W.t / 0.3)) * 6 * (0.75 + 0.25 * GFX.flick(G.time * 2.1, l.seed));
    if (W.t >= W.dur) {   // it sinks: smoke, and embers left glowing in the crack
      for (const P of W.pts) { soot(P[0], 0.3, P[1], 2, { size: 1.0, a: 0.28, lifeK: 1.5 }); if (Math.random() < 0.6) FIRE.flame(P[0], 0.02, P[1], { dur: rr(0.8, 1.8), w: rr(8, 12), h: rr(10, 18), tongues: 1, T, glow: 0.8 }); }
      for (const l of W.lights) removeLight(l);
      return true;
    }
    return false;
  }
  SKILLS.firewall.cast = function (H, aim, r) {
    H.rot = aim.angle;
    const T = temper(Math.random() < 0.65 ? 2 : 0);
    FIRE.flareGather(H, T);
    H.startAction('cast', 0.7 / H.castSpeed, () => {
      const a = H.rot, cx = aim.target ? aim.target.x : H.x + Math.sin(a) * 3.5, cz = aim.target ? aim.target.z : H.z + Math.cos(a) * 3.5;
      const px = Math.cos(a), pz = -Math.sin(a), pts = [];
      for (let i = -4; i <= 4; i++) { const x = cx + px * i * 0.5, z = cz + pz * i * 0.5; if (WORLD.level.walkable(x, z)) pts.push([x, z]); }
      if (!pts.length) return;
      lanternFlare(H, 1.3);
      spawnEffect('firewall', cx, cz, { points: pts, dmg: spellDmg(20, 30, r, H, 8, 10), dur: 5, quiet: true });
      const A = pts[0], B = pts[pts.length - 1], len = Math.hypot(B[0] - A[0], B[1] - A[1]) + 0.6, mx = (A[0] + B[0]) / 2, mz = (A[1] + B[1]) / 2;
      FIRE.strokes.push({ x: mx, z: mz, a: Math.atan2(px, pz), len, w: 0.2, t: 0, dur: 5.6, col: T.trail });   // the glowing crack
      FIRE.hazes.push({ x: mx, z: mz, t: 0, dur: 5, r: 0.2, k: 1.1 });
      const lights = [A, B].map(P => Object.assign(addLight({ x: P[0], y: 1.0, z: P[1], color: 0xff5a18, intensity: 0, radius: 5.5, priority: 2, transient: true }), { seed: Math.random() * 50 }));
      FIRE.walls.push({ pts, st: pts.map(() => ({})), t: 0, dur: 5, T, lick: 0.2, lights });
      dustRing(mx, mz, 10, 2.5);
    }, 0.5);
  };

  // ---------------------------------------------------------------- Judgement
  function starTick(st, dt) {
    st.t += dt;
    const fall = 0.32, k = clamp((st.t - (st.delay - fall)) / fall, 0, 1);
    if (st.t < st.delay - fall) {   // the ground is marked: dust and sparks are drawn up the shaft
      if (Math.random() < dt * 26) { const a = Math.random() * TAU, d = rr(0.2, st.r); FX.add.emit({ x: st.x + Math.cos(a) * d, y: 0.05, z: st.z + Math.sin(a) * d, vx: -Math.cos(a) * d * 0.9, vy: rr(1.5, 3.5), vz: -Math.sin(a) * d * 0.9, life: rr(0.4, 0.8), s: 0.03, s2: 0.006, c: [1.8, 1.3, 0.5], drag: 0.3 }); }
      return false;
    }
    if (!st.landed) {
      const e = k * k, px = st.x - 4.2 * (1 - e), py = 11 * (1 - e) + 0.3, pz = st.z - 4.2 * (1 - e);
      (st.hist || (st.hist = [])).unshift([px, py, pz]); if (st.hist.length > 9) st.hist.pop();
      FIRE.flame(px, py - 0.4, pz, { dur: rr(0.18, 0.3), w: rr(40, 60), h: rr(50, 80), tongues: 3, turb: 4.6, T: st.T, glow: 0.5, grow: 0.8 });
      sparks(px, py, pz, 3, st.T, { speed: 2.5, up: 1, g: 3, life1: 0.7 });
      if (st.light) { st.light.x = px; st.light.y = py; st.light.z = pz; st.light.intensity = 10 + 14 * k; }
      if (k >= 1) { st.landed = true; st.hist = null; if (st.light) removeLight(st.light); st.land(); return true; }
    }
    return false;
  }
  function judgementLand(x, z, R, T, H, dmg, burn) {
    SFX.play('explode', { x, z }); SFX.play('explode', { x, z, vol: 0.6, rate: 0.6 });
    shake(0.95); hitstop(0.12); rumble([[0, 1.0, 1.0, 320], [330, 0.7, 0.8, 220], [560, 0.3, 0.4, 260]]);
    fxScreen([1, 0.85, 0.55], 0.45, 0.7);
    flashLight(x, 2.0, z, 0xffe0a0, 19, 12, 0.8); fxPulse(x, 0.8, z, 0xff6a20, 6, 7, 4);
    // the pillar, and the cross burned into the floor
    FIRE.beam(x, z, { dur: 0.55, w0: 0.9, w1: 0.15, h: 11, col: [1.9, 1.5, 0.8] });
    for (let i = 0; i < 3; i++) FIRE.flame(x + rr(-0.2, 0.2), 0.02 + i * 0.5, z + rr(-0.2, 0.2), { dur: rr(0.6, 0.8), w: rr(60, 80), h: rr(180, 240), tongues: 4, turb: 4.2, T, glow: 0.9, g: 1.35, rise: i * 0.8 });
    const ca = H.rot;
    FIRE.strokes.push({ x, z, a: ca, len: rr(5.6, 6.4), w: 0.3, t: 0, dur: 1.8, col: [1.9, 1.3, 0.5] });
    FIRE.strokes.push({ x: x + Math.sin(ca) * 0.6, z: z + Math.cos(ca) * 0.6, a: ca + Math.PI / 2, len: rr(3.8, 4.4), w: 0.26, t: 0, dur: 1.8, col: [1.9, 1.3, 0.5] });
    const N = 60, seed = Math.random() * 100, jag = [...Array(N)].map((_, i) => Math.sin(i * 0.8 + seed) * 0.5 + (Math.random() - 0.5) * 0.7);
    FIRE.rings.push({ x, z, t: 0, dur: 0.42, r0: 0.4, r1: R * 1.7, w: 0.7, jag, rot: 0, col: [1.8, 1.3, 0.55] });
    FIRE.rings.push({ x, z, t: -0.08, dur: 0.6, r0: 0.3, r1: R * 1.5, w: 0.55, jag: jag.slice().reverse(), rot: 1, col: T.trail });
    FIRE.rings.push({ x, z, t: -0.2, dur: 0.8, r0: 0.3, r1: R * 1.1, w: 0.4, jag, rot: 2, col: [0.9, 0.15, 0.04] });
    for (let i = 0; i < 22; i++) { const a = Math.random() * TAU, d = rr(0.3, R * 1.1), delay = d / R * 0.16;
      FIRE.flame(x + Math.sin(a) * d, 0.02, z + Math.cos(a) * d, { delay, dur: rr(0.4, 0.9), w: rr(32, 52), h: rr(60, 120), tongues: 1 + (Math.random() * 3 | 0), T, g: rr(1.0, 1.3), glow: rr(0.4, 0.65), sp: rr(0.6, 1.6), vx: Math.sin(a) * rr(0.5, 1.6), vz: Math.cos(a) * rr(0.5, 1.6) }); }
    sparks(x, 0.8, z, 70, T, { speed: rr(7, 10), up: 3.2, g: 6, drag: 1.4, life0: 0.5, life1: 1.4, jit: 0.5 });
    motes(x, 0.6, z, 22, T, R * 2);
    soot(x, 0.2, z, 26, { out: rr(4.5, 6), size: 1.4, a: 0.34, drag: 2.0, lifeK: 1.6, r: 0.8 }); soot(x, 1.6, z, 12, { size: 1.8, a: 0.36, lifeK: 2.2, r: 1.0 });
    chips(x, z, 28, { speed: 5.5, up: 5.5, size: 1.3, r: 0.8 }); dustRing(x, z, 26, 7, { r0: R * 0.6, size: 1.4 });
    // crater: a burned heart, satellites, and cracks running out from it
    scorch(x, z, R * 0.75); scorch(x, z, R * 0.45);
    for (let i = 0; i < 9; i++) { const a = Math.random() * TAU, d = rr(0.6, 1.15) * R; scorch(x + Math.sin(a) * d, z + Math.cos(a) * d, rr(0.16, 0.34)); }
    for (let c = 0; c < 6; c++) { let a = c / 6 * TAU + rr(-0.3, 0.3), cx = x, cz = z; for (let s = 0; s < 9; s++) { a += rr(-0.35, 0.35); cx += Math.sin(a) * 0.3; cz += Math.cos(a) * 0.3; if (!WORLD.level.walkable(cx, cz)) break; GFX.decal(cx, cz, 0.07 * (1 - s / 12), [0.5, 0, 0.5, 0]); } }
    FIRE.hazes.push({ x, z, t: 0, dur: 1.4, r: 0.32, k: 2.2 });
    for (let i = 0; i < 10; i++) { const a = Math.random() * TAU, d = rr(0.3, 1.0) * R, gx = x + Math.sin(a) * d, gz = z + Math.cos(a) * d;
      if (WORLD.level.walkable(gx, gz)) FIRE.flame(gx, 0.02, gz, { delay: rr(0.3, 0.7), dur: rr(2.2, 3.8), w: rr(14, 26), h: rr(24, 50), tongues: 1 + (Math.random() < 0.5 ? 1 : 0), T, glow: 0.7, sp: 0.8 }); }
    // the blow itself: damage as before, and everything that survives is thrown back from it
    areaDamage(x, z, R, 'hero', dmg, H, {});
    for (const m of WORLD.monsters) if (m.alive && !m.boss) { const dx = m.x - x, dz = m.z - z, d = Math.hypot(dx, dz) || 1; if (d < R + m.radius + 0.6) { const kb = 1.1 * (1 - d / (R + 1.5)); for (let s = 0; s < 6; s++) moveWithCollision(m, dx / d * kb / 6, dz / d * kb / 6); FIRE.lick(m, T); } }
    spawnEffect('firewall', x, z, { points: [[x, z], [x + 0.6, z], [x - 0.6, z], [x, z + 0.6], [x, z - 0.6]], dmg: burn, dur: 3, team: 'hero', quiet: true });
  }
  SKILLS.meteor.cast = function (H, aim, r) {
    H.rot = aim.angle;
    const tx = aim.target ? aim.target.x : H.x + Math.sin(H.rot) * 5, tz = aim.target ? aim.target.z : H.z + Math.cos(H.rot) * 5, T = temper(1), R = 2.4;
    FIRE.smiteWindup(H);
    H.startAction('cast', 0.8 / H.castSpeed, () => {
      const delay = 1.1, dmg = { fire: spellDmg(40, 60, r, H, 12, 16) }, burn = spellDmg(10, 16, r, H, 3, 4);
      SFX.play('meteorFall', { x: tx, z: tz }); swordLook(H, null, 0);
      // the mark: a ring that closes on the spot, a second behind it, and a thin shaft that thickens until the star arrives
      const jag = [...Array(40)].map(() => (Math.random() - 0.5) * 0.5);
      FIRE.rings.push({ x: tx, z: tz, t: 0, dur: delay, r0: R * 1.5, r1: 0.25, w: 0.22, jag, rot: 0, col: [1.3, 0.95, 0.4] });
      FIRE.rings.push({ x: tx, z: tz, t: -0.25, dur: delay - 0.25, r0: R * 1.5, r1: 0.25, w: 0.16, jag, rot: 1.3, col: [1.1, 0.3, 0.08] });
      FIRE.beam(tx, tz, { dur: delay, w0: 0.03, w1: 0.22, h: 11, col: [1.4, 1.1, 0.55], grow: true });
      const light = addLight({ x: tx, y: 9, z: tz, color: 0xffd090, intensity: 4, radius: 9, priority: 4, transient: true, noShadow: true });
      rumble([[0, 0.1, 0.2, 500], [520, 0.25, 0.35, 500]]);
      FIRE.stars.push({ x: tx, z: tz, r: R, t: 0, delay, T, light, land: () => judgementLand(tx, tz, R, T, H, dmg, burn) });
    }, 0.5);
  };
}
