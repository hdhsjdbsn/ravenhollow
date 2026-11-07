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
